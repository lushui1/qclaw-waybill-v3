// ──────────────────────────────
// 全局类型定义
// ──────────────────────────────

export type TicketSource = 'scan_auto' | 'manual_report';

export type AnomalyType =
  // 物流类
  | 'lost' | 'damaged' | 'rejected' | 'timeout' | 'wrong_address'
  // 品控类
  | 'qty_mismatch' | 'appearance_damage' | 'spec_error' | 'label_error' | 'batch_error';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type TicketStatus =
  | 'pending_approval'
  | 'level1_approving'
  | 'level2_approving'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'resubmitted'
  | 'timeout_auto_rejected'
  | 'fast_released';

export type QcResult = 'pass' | 'anomaly';

export type BatchStatus = 'normal' | 'locked' | 'unlocked';

export type ApprovalAction = 'approved' | 'rejected' | 'fast_release' | 'reassign';

export type PaymentDirection = 'to_customer' | 'from_supplier';

export type UserRole = 'reporter' | 'level1_approver' | 'level2_approver' | 'qc_supervisor' | 'admin';

export type InventoryChangeType = 'deduction' | 'return_in' | 'lock' | 'unlock';

/** 物流异常 → 下游动作映射 */
export const LOGISTICS_ANOMALY_ACTIONS: Record<
  string,
  { actions: string[]; needsPayment: boolean; direction: PaymentDirection }
> = {
  lost:               { actions: ['compensate', 'restock'],            needsPayment: true,  direction: 'to_customer' },
  damaged:            { actions: ['compensate', 'restock'],            needsPayment: true,  direction: 'to_customer' },
  rejected:           { actions: ['return_warehouse', 'restock'],     needsPayment: false, direction: 'to_customer' },
  timeout:            { actions: ['contact_customer'],                 needsPayment: false, direction: 'to_customer' },
  wrong_address:      { actions: ['re_deliver'],                       needsPayment: false, direction: 'to_customer' },
};

/** 品控异常 → 下游动作映射 */
export const QC_ANOMALY_ACTIONS: Record<
  string,
  { actions: string[]; needsPayment: boolean; direction: PaymentDirection }
> = {
  qty_mismatch:       { actions: ['supplier_compensation', 'adjust_inventory'], needsPayment: true,  direction: 'from_supplier' },
  appearance_damage:  { actions: ['supplier_compensation', 'return_to_supplier'], needsPayment: true,  direction: 'from_supplier' },
  spec_error:         { actions: ['return_to_supplier'],             needsPayment: false, direction: 'from_supplier' },
  label_error:        { actions: ['re_label', 'return_to_supplier'], needsPayment: false, direction: 'from_supplier' },
  batch_error:        { actions: ['return_to_supplier', 'supplier_compensation'], needsPayment: true, direction: 'from_supplier' },
};

/** 异常类型分组 */
export const isLogisticsAnomaly = (type: string): boolean =>
  ['lost', 'damaged', 'rejected', 'timeout', 'wrong_address'].includes(type);

export const isQcAnomaly = (type: string): boolean =>
  ['qty_mismatch', 'appearance_damage', 'spec_error', 'label_error', 'batch_error'].includes(type);
