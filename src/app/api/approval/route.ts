import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleGetError } from '@/lib/api-error-handler';
import { TicketStateMachine } from '@/lib/ticket-state-machine';

// GET: 获取待审批工单列表（含超时惰性检查）
export async function GET(req: NextRequest) {
  try {
    // 先检查超时工单（惰性检测）
    await checkTimeouts();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const approverId = searchParams.get('approverId');
    const approverRole = searchParams.get('approverRole');

    // 根据审批人角色，返回对应层级的待审批工单
    const where: any = {
      status: { in: ['pending_approval', 'level1_approving', 'level2_approving'] },
    };

    if (approverRole === 'level1_approver') {
      // 一级审批人：只看第1级
      where.currentLevel = 1;
      where.status = { in: ['pending_approval', 'level1_approving'] };
    } else if (approverRole === 'level2_approver') {
      // 二级审批人：只看第2级
      where.currentLevel = 2;
      where.status = { in: ['pending_approval', 'level2_approving'] };
    }
    // admin 不追加过滤，能看到全部层级

    // 上报人不能看到自己提交的工单
    if (approverId) {
      where.NOT = { reporterId: approverId };
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          waybill: { select: { externalCode: true, receiverName: true, totalAmount: true } },
        },
        orderBy: [
          { timeoutAt: 'asc' },  // 即将超时的优先显示
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ]);

    // 标记即将超时的工单
    const now = Date.now();
    const enriched = tickets.map(t => ({
      ...t,
      isUrgent: t.timeoutAt ? (new Date(t.timeoutAt).getTime() - now) < 2 * 60 * 60 * 1000 : false,
      timeLeft: t.timeoutAt ? Math.max(0, Math.floor((new Date(t.timeoutAt).getTime() - now) / (1000 * 60 * 60))) : null,
    }));

    return NextResponse.json({
      tickets: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    return handleGetError(error, 'GET /api/approval');
  }
}

/** 惰性超时检查：每次查询待审批列表时自动处理超时工单 */
async function checkTimeouts() {
  try {
    const now = new Date();
    const expiredTickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['pending_approval', 'level1_approving', 'level2_approving'] },
        timeoutAt: { lte: now },
      },
      select: { id: true, status: true, currentLevel: true },
    });

    for (const t of expiredTickets) {
      const machine = new TicketStateMachine(t.status as any);
      if (t.currentLevel === 1 && t.status === 'level1_approving') {
        // 一级超时 → 升二级
        if (machine.canTransition('level2_approving')) {
          await prisma.ticket.update({
            where: { id: t.id },
            data: { status: 'level2_approving', currentLevel: 2, updatedAt: now },
          });
        }
      } else if (t.currentLevel === 2 || t.status === 'pending_approval') {
        // 二级超时/待审批超时 → 自动驳回
        if (machine.canTransition('timeout_auto_rejected')) {
          await prisma.ticket.update({
            where: { id: t.id },
            data: { status: 'timeout_auto_rejected', updatedAt: now },
          });
        }
      }
    }
    if (expiredTickets.length > 0) {
      console.log(`[Timeout] 自动处理了 ${expiredTickets.length} 个超时工单`);
    }
  } catch (err) {
    console.error('[Timeout] 超时检查失败:', (err as Error).message);
  }
}
