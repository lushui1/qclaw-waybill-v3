import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeQcCheck, getDefaultSeverity } from '@/lib/qc-engine';
import { verifyWaybill, verifySkuBelongsToWaybill } from '@/lib/v2-client';
import { handleGetError } from '@/lib/api-error-handler';

// GET: 获取扫描记录列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const waybillId = searchParams.get('waybillId');

    const where: any = {};
    if (waybillId) where.waybillId = waybillId;

    const [records, total] = await Promise.all([
      prisma.scanRecord.findMany({
        where,
        include: {
          waybill: { select: { externalCode: true, receiverName: true } },
          ticket: { select: { ticketNo: true, status: true } },
        },
        orderBy: { scanTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.scanRecord.count({ where }),
    ]);

    return NextResponse.json({ records, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    return handleGetError(error, 'GET /api/scan');
  }
}

// POST: 扫描录入
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { waybillId, skuCode, skuName, operatorId, operatorName, expectedQty, actualQty, extra } = body;

    if (!waybillId || !skuCode) {
      return NextResponse.json({ error: '缺少必要参数: waybillId, skuCode' }, { status: 400 });
    }

    // 1. 获取运单快照
    const waybill = await prisma.waybillSnapshot.findUnique({ where: { id: waybillId } });
    if (!waybill) {
      return NextResponse.json({ error: '运单不存在，请先同步数据' }, { status: 404 });
    }

    // 2. 实时调用 V2 接口校验 SKU 归属
    const skuResult = await verifySkuBelongsToWaybill(waybill.v2OrderId, skuCode);
    if (!skuResult.success) {
      return NextResponse.json({
        error: `SKU 校验失败: ${skuResult.error}`,
        requestId: skuResult.requestId,
      }, { status: 502 });
    }

    if (skuResult.data && !skuResult.data.exists) {
      return NextResponse.json({ error: `SKU "${skuCode}" 不属于该运单` }, { status: 400 });
    }

    // 3. 检查扫描幂等性：同一运单同一 SKU 存在未关闭品控工单
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        waybillId,
        scanRecords: { some: { skuCode } },
        status: { notIn: ['completed', 'fast_released', 'timeout_auto_rejected'] },
      },
      include: { scanRecords: true },
    });

    if (existingTicket) {
      // 只追加扫描记录，不重新创建工单
      const scanRecord = await prisma.scanRecord.create({
        data: {
          waybillId,
          skuCode,
          skuName,
          operatorId,
          operatorName,
          qcResult: 'anomaly',
          batchStatus: 'locked',
          ticketId: existingTicket.id,
          anomalyDesc: `重复扫描: 该批次已存在未关闭品控工单 ${existingTicket.ticketNo}`,
        },
      });

      return NextResponse.json({
        scanRecord,
        ticket: existingTicket,
        warning: `该批次已存在未关闭品控工单: ${existingTicket.ticketNo}，已追加扫描记录`,
        isDuplicate: true,
      });
    }

    // 4. 执行品控检测
    const qcResult = await executeQcCheck(skuCode, expectedQty || 0, actualQty || 0, extra);

    // 5. 创建扫描记录
    const scanRecord = await prisma.scanRecord.create({
      data: {
        waybillId,
        skuCode,
        skuName: skuName || null,
        operatorId,
        operatorName,
        qcResult: qcResult.passed ? 'pass' : 'anomaly',
        hitRuleId: qcResult.hitRuleId || null,
        hitRuleDesc: qcResult.description,
        anomalyDesc: qcResult.passed ? null : qcResult.description,
        batchStatus: qcResult.passed ? 'normal' : 'locked',
      },
    });

    // 6. 品控异常 → 自动创建工单
    let ticket = null;
    if (!qcResult.passed) {
      const configs = await prisma.approvalLevelConfig.findMany({
        where: { enabled: true },
        orderBy: { level: 'asc' },
      });
      const level1Cfg = configs.find(c => c.level === 1);
      const timeoutHours = level1Cfg?.timeoutHours ?? 24;

      // 查找匹配的规则来确定自动进入哪级审批和单价
      const hitRule = qcResult.hitRuleId
        ? await prisma.qcRule.findUnique({ where: { id: qcResult.hitRuleId } })
        : null;
      const autoLevel = hitRule?.autoLevel || 1;
      // 数量差异 × 默认单价 100 元/件 = 预估金额
      const unitPrice = 100;
      const estimatedAmount = actualQty ? Math.abs((expectedQty || 0) - actualQty) * unitPrice : 0;

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      // 用当天最大序号+1，替代 count 防竞态
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

      ticket = await prisma.ticket.create({
        data: {
          ticketNo,
          source: 'scan_auto',
          anomalyType: qcResult.anomalySubtype || 'qty_mismatch',
          severity: qcResult.severity || getDefaultSeverity(qcResult.anomalySubtype || 'qty_mismatch'),
          waybillId,
          scanRecordId: scanRecord.id,
          status: autoLevel === 2 ? 'level2_approving' : 'pending_approval',
          currentLevel: autoLevel,
          estimatedAmount,
          description: `品控扫描异常: ${qcResult.description}`,
          reporterId: operatorId,
          reporterName: operatorName,
          timeoutAt: new Date(Date.now() + timeoutHours * 60 * 60 * 1000),
        },
      });

      // 关联扫描记录到工单
      await prisma.scanRecord.update({
        where: { id: scanRecord.id },
        data: { ticketId: ticket.id },
      });
    }

    return NextResponse.json({
      scanRecord,
      qcResult: {
        passed: qcResult.passed,
        description: qcResult.description,
        hitRuleName: qcResult.hitRuleName,
      },
      ticket,
    }, { status: 201 });
  } catch (error: any) {
    return handleGetError(error, 'POST /api/scan');
  }
}
