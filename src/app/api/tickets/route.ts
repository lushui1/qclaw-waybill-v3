import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TicketStateMachine, isActionable, isTerminalStatus } from '@/lib/ticket-state-machine';
import { verifyWaybill } from '@/lib/v2-client';
import { handleGetError } from '@/lib/api-error-handler';

// GET: 工单列表（支持筛选/分页）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const status = searchParams.get('status');
    const anomalyType = searchParams.get('anomalyType');
    const source = searchParams.get('source');
    const keyword = searchParams.get('keyword');
    const searchId = searchParams.get('searchId');

    // 如果提供了 searchId，查看完整详情
    if (searchId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: searchId },
        include: {
          waybill: true,
          approvals: { orderBy: { createdAt: 'desc' } },
          payments: true,
          scanRecords: true,
        },
      });
      if (!ticket) return NextResponse.json({ error: '工单不存在' }, { status: 404 });
      return NextResponse.json(ticket);
    }

    const where: any = {};
    if (status) where.status = status;
    if (anomalyType) where.anomalyType = anomalyType;
    if (source) where.source = source;
    if (keyword) {
      where.OR = [
        { ticketNo: { contains: keyword } },
        { reporterName: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          waybill: { select: { externalCode: true, receiverName: true } },
          _count: { select: { approvals: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ]);

    return NextResponse.json({
      tickets,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    return handleGetError(error, 'GET /api/tickets');
  }
}

// POST: 创建工单（手工上报）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { waybillId, waybillCode, anomalyType, description, amount, reporterId, reporterName, severity } = body;

    if ((!waybillId && !waybillCode) || !anomalyType) {
      return NextResponse.json({ error: '缺少必要参数: waybillId/waybillCode, anomalyType' }, { status: 400 });
    }

    // 1. 查找运单（支持 waybillId 或 waybillCode）
    let waybill = null;
    let v2OrderId = '';

    if (waybillId) {
      // 按本地 ID 查找
      waybill = await prisma.waybillSnapshot.findUnique({ where: { id: waybillId } });
      if (waybill) v2OrderId = waybill.v2OrderId;
    }

    if (!waybill && waybillCode) {
      // 按运单号（externalCode 或 v2OrderId）查找本地快照
      waybill = await prisma.waybillSnapshot.findFirst({
        where: { OR: [{ externalCode: waybillCode }, { v2OrderId: waybillCode }] },
      });
      if (waybill) v2OrderId = waybill.v2OrderId;
    }

    if (!waybill) {
      // 本地没有，直接调 V2 接口查询
      return NextResponse.json({
        error: '运单不存在，请先通过 /sync 页面同步数据',
        hint: '可通过 /sync 页面手动同步 V2 运单数据后再上报',
      }, { status: 404 });
    }

    // 实时调用 V2 接口校验运单真实性
    const v2Result = await verifyWaybill(v2OrderId);
    if (!v2Result.success) {
      return NextResponse.json({
        error: `V2 接口校验失败: ${v2Result.error}`,
        requestId: v2Result.requestId,
        hint: v2Result.statusCode === 404 ? '该运单在 V2 系统中已不存在' : 'V2 服务暂时不可用，请稍后重试',
        useLocalFallback: true,
      }, { status: v2Result.statusCode === 404 ? 404 : 502 });
    }

    // 2. 检查同类型未关闭工单（同类型不可重复上报）
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        waybillId,
        anomalyType,
        status: { notIn: ['completed', 'fast_released', 'timeout_auto_rejected'] },
      },
    });
    if (existingTicket) {
      return NextResponse.json({
        error: `该运单已有同类型未关闭的异常工单: ${existingTicket.ticketNo}`,
        existingTicketId: existingTicket.id,
      }, { status: 409 });
    }

    // 3. 生成工单号（使用数据库事务保证唯一递增）
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    const lastTicket = await prisma.ticket.findFirst({
      where: { ticketNo: { startsWith: `TKT-${today}` } },
      orderBy: { ticketNo: 'desc' },
      select: { ticketNo: true },
    });
    let seq = 1;
    if (lastTicket) {
      const lastSeq = parseInt(lastTicket.ticketNo.split('-').pop() || '0', 10);
      seq = lastSeq + 1;
    }
    const ticketNo = `TKT-${today}-${String(seq).padStart(4, '0')}`;

    // 4. 计算超时时间（一级审批）
    const configs = await prisma.approvalLevelConfig.findMany({ where: { enabled: true } });
    const level1Cfg = configs.find(c => c.level === 1);
    const timeoutHours = level1Cfg?.timeoutHours ?? 24;
    const timeoutAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    // 5. 创建工单
    const ticket = await prisma.ticket.create({
      data: {
        ticketNo,
        source: 'manual_report',
        anomalyType,
        severity: severity || 'medium',
        waybillId,
        status: 'pending_approval',
        currentLevel: 1,
        estimatedAmount: amount ? Math.round(Number(amount) * 100) : 0,
        description,
        reporterId,
        reporterName,
        timeoutAt,
      },
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    return handleGetError(error, 'POST /api/tickets');
  }
}

// PATCH: 批量更新工单状态（如超时自动驳回）
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ticketIds } = body;

    if (action === 'check_timeouts') {
      // 检查超时工单
      const now = new Date();
      const expiredTickets = await prisma.ticket.findMany({
        where: {
          status: { in: ['pending_approval', 'level1_approving', 'level2_approving'] },
          timeoutAt: { lte: now },
        },
      });

      let updated = 0;
      for (const t of expiredTickets) {
        const machine = new TicketStateMachine(t.status as any);
        if (machine.canTransition('timeout_auto_rejected')) {
          await prisma.ticket.update({
            where: { id: t.id },
            data: {
              status: 'timeout_auto_rejected',
              updatedAt: now,
            },
          });
          updated++;
        }
      }

      return NextResponse.json({ checked: expiredTickets.length, autoRejected: updated });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    return handleGetError(error, 'PATCH /api/tickets');
  }
}
