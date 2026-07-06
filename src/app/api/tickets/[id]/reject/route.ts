import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TicketStateMachine, isActionable } from '@/lib/ticket-state-machine';
import { canApproveLevel, canSelfApprove, generateOperationToken } from '@/lib/approval-engine';

// POST /api/tickets/[id]/reject
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { approverId, approverName, approverRole, comment } = body;

    if (!approverId || !approverRole || !approverName) {
      return NextResponse.json({ error: '缺少审批人信息（id, name, role）' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: '工单不存在' }, { status: 404 });

    if (!isActionable(ticket.status as any)) {
      return NextResponse.json({ error: `工单当前状态为 "${ticket.status}"，不可操作` }, { status: 409 });
    }

    if (!canSelfApprove(ticket.reporterId, approverId)) {
      return NextResponse.json({ error: '上报人不能审批自己提交的工单' }, { status: 403 });
    }

    if (!canApproveLevel(approverRole, ticket.currentLevel)) {
      return NextResponse.json({ error: `无权进行第 ${ticket.currentLevel} 级审批` }, { status: 403 });
    }

    const machine = new TicketStateMachine(ticket.status as any);
    const token = generateOperationToken();
    const newRejectCount = ticket.rejectCount + 1;
    const maxRejects = ticket.maxRejectCount;

    let nextStatus: string;
    if (newRejectCount >= maxRejects) {
      nextStatus = 'timeout_auto_rejected';
    } else {
      nextStatus = 'rejected';
    }

    if (!machine.canTransition(nextStatus as any)) {
      return NextResponse.json({ error: `无法从 ${ticket.status} 过渡到 ${nextStatus}` }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.ticket.findUnique({ where: { id } });
      if (!current || current.status !== ticket.status) {
        throw new Error('并发冲突：该工单已被其他人处理，请刷新后重试');
      }

      const approval = await tx.approvalRecord.create({
        data: {
          ticketId: id,
          level: ticket.currentLevel,
          approverId,
          approverName,
          action: 'rejected',
          comment,
          version: 1,
          token,
        },
      });

      const updated = await tx.ticket.update({
        where: { id },
        data: {
          status: nextStatus,
          rejectCount: newRejectCount,
          updatedAt: new Date(),
        },
      });

      return { approval, ticket: updated };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message?.includes('并发冲突')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
