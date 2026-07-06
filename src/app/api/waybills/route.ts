import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleGetError } from '@/lib/api-error-handler';

// GET: 获取运单快照列表（供扫描页面下拉选择）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50'));
    const keyword = searchParams.get('keyword');

    const where: any = {};
    if (keyword) {
      where.OR = [
        { externalCode: { contains: keyword } },
        { v2OrderId: { contains: keyword } },
        { receiverName: { contains: keyword } },
      ];
    }

    const [waybills, total] = await Promise.all([
      prisma.waybillSnapshot.findMany({
        where,
        select: {
          id: true,
          v2OrderId: true,
          externalCode: true,
          receiverName: true,
          receiverStore: true,
          totalAmount: true,
          lastSyncedAt: true,
          skuSummary: true,
        },
        orderBy: { lastSyncedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.waybillSnapshot.count({ where }),
    ]);

    return NextResponse.json({ waybills, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    return handleGetError(error, 'GET /api/waybills');
  }
}
