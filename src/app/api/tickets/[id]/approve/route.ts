import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TicketStateMachine, isActionable } from '@/lib/ticket-state-machine';
import { getApprovalConfigs, canApproveLevel, canSelfApprove, generateOperationToken, getTimeoutHours, getLevel1MaxAmount } from '@/lib/approval-engine';
import { executeLinks } from '@/lib/execution-links';

// POST /api/tickets/[id]/approve
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { approverId, approverName, approverRole, comment, amount } = body;

    if (!approverId || !approverRole || !approverName) {
      return NextResponse.json({ error: '缺少审批人信息（id, name, role）' }, { status: 400 });
    }

    // 1. 获取工单（带乐观锁 version）
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 });
    }

    // 2. 状态检查
    if (!isActionable(ticket.status as any)) {
      return NextResponse.json({
        error: `工单当前状态为 "${ticket.status}"，不可进行审批操作`,
      }, { status: 409 });
    }

    // 3. 权限检查：不能自批
    if (!canSelfApprove(ticket.reporterId, approverId)) {
      return NextResponse.json({ error: '上报人不能审批自己提交的工单' }, { status: 403 });
    }

    // 4. 权限检查：是否有权审批当前层级
    if (!canApproveLevel(approverRole, ticket.currentLevel)) {
      return NextResponse.json({
        error: `无权进行第 ${ticket.currentLevel} 级审批`,
      }, { status: 403 });
    }

    // 5. 生成操作令牌（幂等性）
    const token = generateOperationToken();
    const machine = new TicketStateMachine(ticket.status as any);

    // 6. 判断下一状态（使用状态机静态方法，消除重复逻辑）
    // 注意：pending_approval 必须先到 level1_approving，不能直接到 executing
    let actualStatus = ticket.status;
    let actualNextLevel = ticket.currentLevel;

    if (ticket.status === 'pending_approval') {
      // 先推进到 level1_approving
      actualStatus = 'level1_approving';
    }

    const level1MaxAmount = await getLevel1MaxAmount();
    const { nextStatus, nextLevel } = TicketStateMachine.approveTransition(
      Number(amount ?? ticket.estimatedAmount),
      actualNextLevel,
      { level1MaxAmount }
    );

    // 用实际状态校验
    const machineForCheck = new TicketStateMachine(actualStatus as any);
    if (!machineForCheck.canTransition(nextStatus as any)) {
      return NextResponse.json({ error: `无法从 ${actualStatus} 过渡到 ${nextStatus}` }, { status: 409 });
    }

    // 7. 计算下一级超时时间
    const timeoutHours = await getTimeoutHours(nextLevel);
    const newTimeoutAt = nextStatus === 'executing' ? null : new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    // 8. 事务执行：写审批记录 + 更新工单（乐观锁版本）
    const result = await prisma.$transaction(async (tx) => {
      // 乐观锁：校验 version
      const current = await tx.ticket.findUnique({ where: { id } });
      if (!current) throw new Error('工单不存在');
      if (current.status !== ticket.status) {
        throw new Error('并发冲突：该工单已被其他人处理，请刷新后重试');
      }

      // 写审批记录（token 唯一约束保证幂等）
      const approval = await tx.approvalRecord.create({
        data: {
          ticketId: id,
          level: ticket.currentLevel,
          approverId,
          approverName,
          action: 'approved',
          comment,
          version: 1,
          token,
        },
      });

      // 更新工单状态
      const updateData: any = {
        status: nextStatus,
        currentLevel: nextLevel,
        updatedAt: new Date(),
        timeoutAt: newTimeoutAt,
      };

      if (nextStatus === 'executing') {
        updateData.actualAmount = amount ? Math.round(Number(amount) * 100) : ticket.estimatedAmount;
      }

      const updated = await tx.ticket.update({
        where: { id },
        data: updateData,
      });

      // 如果进入 executing 状态，触发执行联动（赔付+库存）
      let executionResult = null;
      if (nextStatus === 'executing') {
        // 传入 tx 避免嵌套事务导致外键不可见
        executionResult = await executeLinks(id, approval.id, amount ? Math.round(Number(amount) * 100) : undefined, tx);
      }

      return { approval, ticket: updated, executionResult };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message?.includes('并发冲突') || error.message?.includes('已被处理')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
