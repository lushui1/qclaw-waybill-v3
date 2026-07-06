import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleGetError } from '@/lib/api-error-handler';

// GET: 获取待审批工单列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const approverId = searchParams.get('approverId');
    const approverRole = searchParams.get('approverRole');

    // 根据审批人角色，返回对应层级的待审批工单
    const where: any = {
      status: { in: ['pending_approval', 'level1_approving', 'level2_approving'] },
    };

    if (approverRole === 'level1_approver' || approverRole === 'admin') {
      where.currentLevel = 1;
      where.status = { in: ['pending_approval', 'level1_approving'] };
    } else if (approverRole === 'level2_approver') {
      where.currentLevel = 2;
      where.status = 'level2_approving';
    }

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
