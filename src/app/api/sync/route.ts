import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncWaybills } from '@/lib/v2-client';
import { handleGetError } from '@/lib/api-error-handler';

// POST: 手动触发 V2 运单同步
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const page = body.page || 1;

    const result = await syncWaybills(page);

    if (!result.success) {
      return NextResponse.json({ error: result.error, requestId: result.requestId }, { status: 502 });
    }

    // 批量 upsert 到本地快照表
    let synced = 0;
    if (result.data?.orders) {
      for (const order of result.data.orders) {
        await prisma.waybillSnapshot.upsert({
          where: { v2OrderId: order.id },
          update: {
            externalCode: order.externalCode,
            receiverStore: order.receiverStore,
            receiverName: order.receiverName,
            receiverPhone: order.receiverPhone,
            receiverAddress: order.receiverAddress,
            skuSummary: JSON.stringify([{
              skuCode: order.skuCode,
              skuName: order.skuName,
              qty: order.skuQuantity,
              spec: order.skuSpec,
            }]),
            lastSyncedAt: new Date(),
          },
          create: {
            v2OrderId: order.id,
            externalCode: order.externalCode,
            receiverStore: order.receiverStore,
            receiverName: order.receiverName,
            receiverPhone: order.receiverPhone,
            receiverAddress: order.receiverAddress,
            skuSummary: JSON.stringify([{
              skuCode: order.skuCode,
              skuName: order.skuName,
              qty: order.skuQuantity,
              spec: order.skuSpec,
            }]),
            lastSyncedAt: new Date(),
          },
        });
        synced++;
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      total: result.data?.total || 0,
      page,
      requestId: result.requestId,
    });
  } catch (error: any) {
    return handleGetError(error, 'POST /api/sync');
  }
}

// GET: 查询同步日志
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const success = searchParams.get('success'); // 'true' | 'false' | null

    const where: any = {};
    if (success === 'true') where.success = true;
    else if (success === 'false') where.success = false;

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.syncLog.count({ where }),
    ]);

    // 最新状态摘要
    const latestSummary = await prisma.syncLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { success: true, createdAt: true, endpoint: true, requestId: true },
    });

    const recentStats = {
      total: await prisma.syncLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      failed: await prisma.syncLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          success: false,
        },
      }),
    };

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      latestSummary,
      recentStats,
    });
  } catch (error: any) {
    return handleGetError(error, 'GET /api/sync');
  }
}
