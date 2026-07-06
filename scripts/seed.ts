/**
 * 种子数据脚本
 * 生成 200+ 条测试数据（工单、用户、规则、配置）
 *
 * 运行: npx tsx scripts/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/postgres',
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('🌱 开始播种数据...');

  // 1. 用户
  const users = [
    { username: 'reporter1',  name: '张三(上报员)',   role: 'reporter',          warehouse: 'WH-A' },
    { username: 'reporter2',  name: '李四(上报员)',   role: 'reporter',          warehouse: 'WH-B' },
    { username: 'l1_app1',    name: '王五(一级审批)',  role: 'level1_approver',   warehouse: 'WH-A' },
    { username: 'l1_app2',    name: '赵六(一级审批)',  role: 'level1_approver',   warehouse: 'WH-B' },
    { username: 'l2_app1',    name: '钱七(二级审批)',  role: 'level2_approver',   warehouse: null },
    { username: 'qc_sup1',    name: '孙八(品控主管)',  role: 'qc_supervisor',     warehouse: 'WH-A' },
    { username: 'admin1',     name: '管理员',         role: 'admin',             warehouse: null },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: u,
      create: u,
    });
  }
  console.log(`✅ 已创建 ${users.length} 个用户`);

  // 2. 审批级别配置
  const levelConfigs = [
    { level: 1, minAmount: 0,     maxAmount: 500000,  timeoutHours: 24, escalationAction: 'escalate',     enabled: true },  // ≤ ¥5,000
    { level: 2, minAmount: 500001, maxAmount: null,    timeoutHours: 48, escalationAction: 'auto_reject', enabled: true },  // > ¥5,000
  ];

  for (const c of levelConfigs) {
    await prisma.approvalLevelConfig.upsert({
      where: { id: `level-${c.level}` },
      update: c,
      create: { ...c, id: `level-${c.level}` },
    });
  }
  console.log('✅ 已创建审批级别配置');

  // 3. 品控规则
  const qcRules = [
    { name: '数量差异检测',        anomalySubtype: 'qty_mismatch',     condition: '{"field":"qty_diff","operator":">","threshold":0.1}',   severity: 'high',   autoLevel: 1, enabled: true, description: '实际数量与预期偏差超过10%' },
    { name: '外观破损检测',        anomalySubtype: 'appearance_damage',condition: '{"field":"appearance","operator":"contains","threshold":"破损"}', severity: 'medium', autoLevel: 1, enabled: true, description: '外观描述包含"破损"关键词' },
    { name: '规格严重不符',        anomalySubtype: 'spec_error',       condition: '{"field":"spec","operator":"contains","threshold":"不符"}', severity: 'high',   autoLevel: 2, enabled: true, description: '规格严重不符直接进二级审批' },
    { name: '标签错误',            anomalySubtype: 'label_error',      condition: '{"field":"label","operator":"contains","threshold":"错误"}', severity: 'low',    autoLevel: 1, enabled: true, description: '标签信息有误' },
    { name: '批次异常-临期',       anomalySubtype: 'batch_error',      condition: '{"field":"batch","operator":"contains","threshold":"临期"}', severity: 'high',   autoLevel: 2, enabled: true, description: '批次为临期品，直接进二级审批' },
  ];

  for (const r of qcRules) {
    await prisma.qcRule.create({ data: r });
  }
  console.log(`✅ 已创建 ${qcRules.length} 条品控规则`);

  // 4. 运单快照（模拟 10 条）
  const waybills = [];
  for (let i = 1; i <= 10; i++) {
    const wb = await prisma.waybillSnapshot.create({
      data: {
        v2OrderId: `v2-order-${String(i).padStart(4, '0')}`,
        externalCode: `WAYBILL-${String(i).padStart(6, '0')}`,
        receiverStore: `门店${String.fromCharCode(64 + i)}`,
        receiverName: `收件人${i}`,
        receiverPhone: `138${String(i).padStart(8, '0')}`,
        receiverAddress: `北京市朝阳区测试路${i}号`,
        totalAmount: Math.floor(Math.random() * 500000) + 50000, // ¥500~5500
        skuSummary: JSON.stringify([{ skuCode: `SKU-${String(i).padStart(4, '0')}`, skuName: `商品${i}`, qty: String(Math.floor(Math.random() * 20) + 1), spec: '标准' }]),
        lastSyncedAt: new Date(),
      },
    });
    waybills.push(wb);
  }
  console.log(`✅ 已创建 ${waybills.length} 条运单快照`);

  // 5. 生成 200+ 工单
  const reporters = ['reporter1', 'reporter2', 'reporter1']; // 轮流
  const anomalyTypes = ['lost', 'damaged', 'rejected', 'timeout', 'wrong_address', 'qty_mismatch', 'appearance_damage', 'spec_error', 'label_error', 'batch_error'];
  const statuses = ['pending_approval', 'level1_approving', 'level2_approving', 'executing', 'completed', 'rejected', 'timeout_auto_rejected', 'fast_released'];
  const severities = ['low', 'medium', 'high', 'critical'];

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let ticketCount = 0;

  for (let i = 0; i < 210; i++) {
    const wb = waybills[i % waybills.length];
    const anomalyType = anomalyTypes[i % anomalyTypes.length];
    const status = statuses[i % statuses.length];
    const severity = severities[i % severities.length];
    const source = i % 3 === 0 ? 'scan_auto' : 'manual_report';
    const amount = Math.floor(Math.random() * 300000) + 5000; // ¥50~¥3000

    const ticketNo = `TKT-${todayStr}-${String(++ticketCount).padStart(4, '0')}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNo,
        source,
        anomalyType,
        severity,
        waybillId: wb.id,
        status,
        currentLevel: status === 'level2_approving' ? 2 : 1,
        rejectCount: status === 'rejected' ? 1 : 0,
        estimatedAmount: amount,
        description: `测试工单 #${i} - ${anomalyType}`,
        reporterId: reporters[i % reporters.length],
        reporterName: `测试上报人${(i % 3) + 1}`,
        timeoutAt: status.includes('approving') ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null, // 2h后超时（部分即将超时）
        completedAt: ['completed', 'fast_released'].includes(status) ? new Date() : null,
      },
    });

    // 为部分工单添加审批记录
    if (!['pending_approval'].includes(status)) {
      await prisma.approvalRecord.create({
        data: {
          ticketId: ticket.id,
          level: 1,
          approverId: 'l1_app1',
          approverName: '王五(一级审批)',
          action: ['rejected', 'executing', 'completed', 'level2_approving'].includes(status) ? 'approved' : 'rejected',
          comment: '自动生成的测试审批记录',
          version: 1,
          token: `seed-token-${i}`,
        },
      });
    }

    // 为品控异常工单添加扫描记录
    if (source === 'scan_auto') {
      await prisma.scanRecord.create({
        data: {
          waybillId: wb.id,
          skuCode: `SKU-TEST-${String(i % 20).padStart(4, '0')}`,
          skuName: `测试商品${i % 20}`,
          operatorId: reporters[i % reporters.length],
          operatorName: `测试操作员${(i % 3) + 1}`,
          qcResult: status === 'completed' || status === 'fast_released' ? 'anomaly' : 'anomaly',
          batchStatus: ['completed', 'fast_released'].includes(status) ? 'unlocked' : 'locked',
          ticketId: ticket.id,
          anomalyDesc: `品控检测异常: ${anomalyType}`,
        },
      });
    }

    // 为已完成/执行中的工单添加赔付记录
    if (['executing', 'completed'].includes(status) && i % 2 === 0) {
      const isLogistics = ['lost', 'damaged', 'rejected', 'timeout', 'wrong_address'].includes(anomalyType);
      await prisma.paymentRecord.create({
        data: {
          ticketId: ticket.id,
          approvalRecordId: null, // 简化
          amount,
          direction: isLogistics ? 'to_customer' : 'from_supplier',
          status: 'completed',
          settlementMethod: isLogistics ? '客户理赔' : '供应商扣款',
        },
      });
    }
  }

  console.log(`✅ 已创建 ${ticketCount} 条工单（含关联的审批/扫描/赔付记录）`);

  // 6. 库存（模拟）
  for (let i = 1; i <= 20; i++) {
    await prisma.inventory.create({
      data: {
        skuCode: `SKU-TEST-${String(i).padStart(4, '0')}`,
        skuName: `测试商品${i}`,
        totalQty: Math.floor(Math.random() * 500) + 100,
        lockedQty: Math.floor(Math.random() * 10),
        availableQty: 500, // 自动计算
      },
    });
  }
  console.log('✅ 已创建 20 条库存记录');

  await prisma.$disconnect();
  console.log('🎉 播种完成！');
}

main().catch(console.error);
