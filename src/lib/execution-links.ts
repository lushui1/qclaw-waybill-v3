/**
 * 执行联动引擎
 * 审批通过后统一调度：赔付记录创建 + 库存变更
 * 一致性保证：所有操作在同一个 Prisma 事务中完成
 */

import { prisma } from './db';
import { isLogisticsAnomaly, isQcAnomaly, LOGISTICS_ANOMALY_ACTIONS, QC_ANOMALY_ACTIONS, PaymentDirection, SEVERITY_ORDER } from './types';

export interface ExecutionResult {
  paymentCreated: boolean;
  paymentId?: string;
  inventoryUpdated: boolean;
  inventoryLogId?: string;
  actions: string[];
}

/** 执行联动：在工单状态变为 executing 时调用 */
export async function executeLinks(
  ticketId: string,
  approvalRecordId: string,
  actualAmount?: number
): Promise<ExecutionResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      waybill: true,
      scanRecords: { where: { batchStatus: 'locked' } },
    },
  });

  if (!ticket) throw new Error('工单不存在');

  const result: ExecutionResult = {
    paymentCreated: false,
    inventoryUpdated: false,
    actions: [],
  };

  // 在事务中执行所有联动操作
  await prisma.$transaction(async (tx) => {
    const amount = actualAmount !== undefined ? actualAmount : Number(ticket.estimatedAmount);
    const isLogistics = isLogisticsAnomaly(ticket.anomalyType);
    const actionMap = isLogistics ? LOGISTICS_ANOMALY_ACTIONS : QC_ANOMALY_ACTIONS;
    const actions = actionMap[ticket.anomalyType]?.actions || [];
    result.actions = actions;

    // 1. 创建赔付记录（如果需要赔付）
    if (actionMap[ticket.anomalyType]?.needsPayment) {
      const direction: PaymentDirection = actionMap[ticket.anomalyType].direction;

      const payment = await tx.paymentRecord.create({
        data: {
          ticketId,
          approvalRecordId,
          amount: amount,
          direction,
          status: 'pending',
          settlementMethod: direction === 'to_customer' ? '客户理赔' : '供应商扣款',
        },
      });
      result.paymentCreated = true;
      result.paymentId = payment.id;
    }

    // 2. 库存联动
    // 解析 SKU 信息
    let skuCode = '';
    let skuQty = 0;
    try {
      const skuSummary = ticket.waybill?.skuSummary;
      if (skuSummary) {
        const skus = JSON.parse(skuSummary);
        if (Array.isArray(skus) && skus.length > 0) {
          skuCode = skus[0].skuCode || '';
          skuQty = parseInt(skus[0].qty || '0');
        }
      }
    } catch {}

    if (skuCode) {
      const hasRestock = actions.includes('restock') || actions.includes('return_warehouse') || actions.includes('return_to_supplier');
      const hasDeduction = actions.includes('compensate');

      // 找出需要操作的库存记录
      let inventory = await tx.inventory.findUnique({ where: { skuCode } });

      if (!inventory) {
        // 库存不存在则创建（按实际数量初始化，避免魔数）
        const initQty = Math.max(skuQty, 10); // 至少 10 件
        inventory = await tx.inventory.create({
          data: {
            skuCode,
            skuName: skuCode,
            totalQty: initQty,
            lockedQty: 0,
            availableQty: initQty,
          },
        });
      }

      // 退货入库：增加库存
      if (hasRestock) {
        const returnQty = skuQty || 1;
        await tx.inventory.update({
          where: { skuCode },
          data: {
            totalQty: { increment: returnQty },
            availableQty: { increment: returnQty },
          },
        });
        const log = await tx.inventoryLog.create({
          data: {
            skuCode,
            changeType: 'return_in',
            qty: returnQty,
            relatedId: ticketId,
            relatedType: 'ticket',
            remark: `异常处理退货入库: ${ticket.ticketNo}`,
          },
        });
        result.inventoryUpdated = true;
        result.inventoryLogId = log.id;
      }

      // 赔付/重新发货：扣减库存（检查可用量是否充足）
      if (hasDeduction) {
        const deductQty = skuQty || 1;
        // 重新读取最新库存，检查可用量
        const currentInv = await tx.inventory.findUnique({ where: { skuCode } });
        if (currentInv && currentInv.availableQty < deductQty) {
          throw new Error(`库存不足: ${skuCode} 可用量 ${currentInv.availableQty}，需要 ${deductQty}`);
        }
        await tx.inventory.update({
          where: { skuCode },
          data: {
            totalQty: { decrement: deductQty },
            availableQty: { decrement: deductQty },
          },
        });
        const log = await tx.inventoryLog.create({
          data: {
            skuCode,
            changeType: 'deduction',
            qty: deductQty,
            relatedId: ticketId,
            relatedType: 'ticket',
            remark: `异常处理赔付扣库存: ${ticket.ticketNo}`,
          },
        });
        result.inventoryUpdated = true;
        result.inventoryLogId = log.id;
      }

      // 解锁品控暂扣批次：仅递减 lockedQty，不清零
      if (ticket.scanRecords.length > 0) {
        const lockedCount = ticket.scanRecords.length;
        for (const sr of ticket.scanRecords) {
          await tx.scanRecord.update({
            where: { id: sr.id },
            data: { batchStatus: 'unlocked' },
          });
        }
        // 仅递减锁定数，而非清零
        await tx.inventory.update({
          where: { skuCode },
          data: { lockedQty: { decrement: lockedCount } },
        });
      }
    }
  });

  return result;
}
