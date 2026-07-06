/**
 * 工单状态机引擎
 * 管理工单状态迁移 + 校验规则 + 超时兜底
 */

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

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending_approval:     ['level1_approving'],
  level1_approving:     ['level2_approving', 'executing', 'rejected', 'timeout_auto_rejected'],
  level2_approving:     ['executing', 'rejected', 'timeout_auto_rejected'],
  executing:            ['completed'],
  completed:            [],
  rejected:             ['resubmitted'],
  resubmitted:          ['level1_approving'],
  timeout_auto_rejected:['resubmitted'],
  fast_released:        ['completed'],
};

export class TicketStateMachine {
  private current: TicketStatus;

  constructor(status: TicketStatus) {
    this.current = status;
  }

  get status(): TicketStatus {
    return this.current;
  }

  canTransition(to: TicketStatus): boolean {
    return TRANSITIONS[this.current]?.includes(to) ?? false;
  }

  transition(to: TicketStatus): TicketStatus {
    if (!this.canTransition(to)) {
      throw new Error(
        `状态迁移非法: ${this.current} → ${to}。允许的目标: [${TRANSITIONS[this.current]?.join(', ') || '无'}]`
      );
    }
    this.current = to;
    return this.current;
  }

  /** 审批通过：判断是否需要进入二级审批 */
  static approveTransition(
    estimatedAmount: number,
    currentLevel: number,
    config: { level1MaxAmount: number }
  ): { nextStatus: TicketStatus; nextLevel: number } {
    if (currentLevel === 1 && estimatedAmount > config.level1MaxAmount) {
      return { nextStatus: 'level2_approving', nextLevel: 2 };
    }
    return { nextStatus: 'executing', nextLevel: currentLevel };
  }
}

/** 检查工单是否在终态（不可再流转） */
export function isTerminalStatus(status: TicketStatus): boolean {
  return ['completed', 'timeout_auto_rejected', 'fast_released'].includes(status);
}

/** 检查工单是否可被操作 */
export function isActionable(status: TicketStatus): boolean {
  return ['level1_approving', 'level2_approving'].includes(status);
}
