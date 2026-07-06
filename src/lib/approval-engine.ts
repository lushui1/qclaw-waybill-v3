/**
 * 审批规则引擎
 * - 分级审批金额阈值读取（从 ApprovalLevelConfig 表）
 * - 并发冲突检测（乐观锁）
 * - 幂等性（token 唯一约束）
 * - 权限校验
 */

import { prisma } from './db';
import { isActionable, isTerminalStatus } from './ticket-state-machine';

/** 获取启用的分级审批配置 */
export async function getApprovalConfigs() {
  const configs = await prisma.approvalLevelConfig.findMany({
    where: { enabled: true },
    orderBy: { level: 'asc' },
  });
  return configs;
}

/** 获取一级审批金额上限 */
export async function getLevel1MaxAmount(): Promise<number> {
  const configs = await getApprovalConfigs();
  const level1 = configs.find(c => c.level === 1);
  return level1 ? Number(level1.maxAmount ?? 0) : 5000; // 默认阈值
}

/** 判断是否需要二级审批 */
export async function needsLevel2Approval(amount: number): Promise<boolean> {
  const maxAmount = await getLevel1MaxAmount();
  return amount > maxAmount;
}

/** 获取审批超时小时数 */
export async function getTimeoutHours(level: number): Promise<number> {
  const configs = await getApprovalConfigs();
  const cfg = configs.find(c => c.level === level);
  return cfg?.timeoutHours ?? (level === 1 ? 24 : 48);
}

/** 检查上报人是否可审批自己提交的工单 */
export function canSelfApprove(reporterId: string, approverId: string): boolean {
  return reporterId !== approverId;
}

/** 乐观锁校验：检查工单版本号 */
export async function checkConcurrency(ticketId: string): Promise<void> {
  // 放在事务中做，在 update 时校验 version
  // 实际在 approve/reject API 中用 where: { id, version } 实现
}

/** 生成操作令牌（幂等性） */
export function generateOperationToken(): string {
  return `op-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/** 验证权限：用户角色是否有权审批对应层级 */
export function canApproveLevel(userRole: string, level: number): boolean {
  if (level === 1) return ['level1_approver', 'admin'].includes(userRole);
  if (level === 2) return ['level2_approver', 'admin'].includes(userRole);
  return false;
}

/** 验证权限：用户角色是否有权进行品控快速放行 */
export function canFastRelease(userRole: string): boolean {
  return ['qc_supervisor', 'admin'].includes(userRole);
}

/** 验证权限：用户角色是否有权上报 */
export function canReport(userRole: string): boolean {
  return ['reporter', 'admin'].includes(userRole);
}

/** 验证权限：用户角色是否为管理员 */
export function isAdmin(userRole: string): boolean {
  return userRole === 'admin';
}
