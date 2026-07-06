import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/tickets/[id]/reassign — 管理员转交审批人
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { newApproverId, newApproverName, newApproverRole, operatorId, operatorRole } = body;

    if (!newApproverId || !newApproverName || !newApproverRole) {
      return NextResponse.json({ error: '缺少转交目标审批人信息' }, { status: 400 });
    }

    // 仅管理员可操作转交
    if (operatorRole !== 'admin') {
      return NextResponse.json({ error: '仅管理员可执行转交操作' }, { status: 403 });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 });
    }

    // 只允许转交代审批/审批中的工单
    const canReassign = ['pending_approval', 'level1_approving', 'level2_approving'].includes(ticket.status);
    if (!canReassign) {
      return NextResponse.json({ error: `工单状态 "${ticket.status}" 不可转交` }, { status: 409 });
    }

    // 校验转交目标用户是否存在且角色匹配
    const targetUser = await prisma.user.findFirst({
      where: { id: newApproverId, enabled: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: `转交目标用户 "${newApproverId}" 不存在或已被禁用` }, { status: 404 });
    }
    const validRoles = ticket.currentLevel === 1 ? ['level1_approver', 'admin'] : ['level2_approver', 'admin'];
    if (!validRoles.includes(targetUser.role)) {
      return NextResponse.json({
        error: `用户 "${targetUser.name}" 的角色为 "${targetUser.role}"，无权审批第 ${ticket.currentLevel} 级工单`,
      }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 写入转交记录
      const approval = await tx.approvalRecord.create({
        data: {
          ticketId: id,
          level: ticket.currentLevel,
          approverId: operatorId,
          approverName: '管理员(转交)',
          action: 'reassign',
          comment: `转交至 ${newApproverName}(${newApproverRole})`,
          version: 1,
          token: `reassign-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        },
      });

      // 更新工单的超时时间（重新计时）
      const configs = await tx.approvalLevelConfig.findMany({ where: { enabled: true } });
      const cfg = configs.find(c => c.level === ticket.currentLevel);
      const timeoutHours = cfg?.timeoutHours ?? (ticket.currentLevel === 1 ? 24 : 48);
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          timeoutAt: new Date(Date.now() + timeoutHours * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      });

      return { approval, ticket: updated };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
