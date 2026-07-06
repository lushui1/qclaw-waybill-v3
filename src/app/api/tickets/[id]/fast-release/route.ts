import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TicketStateMachine, isActionable } from '@/lib/ticket-state-machine';
import { canFastRelease, generateOperationToken } from '@/lib/approval-engine';

// POST /api/tickets/[id]/fast-release
// 品控主管快速放行（绕过审批）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { approverId, approverName, approverRole, comment, scanRecordId } = body;

    if (!approverId || !approverRole || !approverName) {
      return NextResponse.json({ error: '缺少操作人信息（id, name, role）' }, { status: 400 });
    }

    // 权限检查：仅品控主管可操作
    if (!canFastRelease(approverRole)) {
      return NextResponse.json({ error: '仅品控主管可执行快速放行操作' }, { status: 403 });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: '工单不存在' }, { status: 404 });

    if (ticket.source !== 'scan_auto') {
      return NextResponse.json({ error: '仅品控异常工单可快速放行' }, { status: 400 });
    }

    if (!isActionable(ticket.status as any) && ticket.status !== 'pending_approval') {
      return NextResponse.json({ error: `工单当前状态为 "${ticket.status}"，不可快速放行` }, { status: 409 });
    }

    const machine = new TicketStateMachine(ticket.status as any);
    if (!machine.canTransition('fast_released')) {
      return NextResponse.json({ error: `无法从 ${ticket.status} 进行快速放行` }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 检查版本冲突
      const current = await tx.ticket.findUnique({ where: { id } });
      if (!current || current.status !== ticket.status) {
        throw new Error('并发冲突：该工单已被其他人处理');
      }

      // 记录审批（快速放行记录）
      const approval = await tx.approvalRecord.create({
        data: {
          ticketId: id,
          level: 0,
          approverId,
          approverName,
          action: 'fast_release',
          comment: `快速放行: ${comment || '品控主管认定误判'}`,
          version: 1,
          token: generateOperationToken(),
        },
      });

      // 更新工单
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          status: 'fast_released',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 解锁批次
      if (scanRecordId) {
        await tx.scanRecord.update({
          where: { id: scanRecordId },
          data: { batchStatus: 'unlocked' },
        });
      } else {
        // 解锁所有关联的扫描记录
        await tx.scanRecord.updateMany({
          where: { ticketId: id, batchStatus: 'locked' },
          data: { batchStatus: 'unlocked' },
        });
      }

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
