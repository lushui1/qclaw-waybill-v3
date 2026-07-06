import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleGetError } from '@/lib/api-error-handler';

// GET: 查询赔付记录列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const ticketId = searchParams.get('ticketId');
    const direction = searchParams.get('direction');

    const where: any = {};
    if (ticketId) where.ticketId = ticketId;
    if (direction) where.direction = direction;

    const [payments, total] = await Promise.all([
      prisma.paymentRecord.findMany({
        where,
        include: {
          ticket: { select: { ticketNo: true, anomalyType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.paymentRecord.count({ where }),
    ]);

    return NextResponse.json({
      payments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    return handleGetError(error, 'GET /api/payments');
  }
}
