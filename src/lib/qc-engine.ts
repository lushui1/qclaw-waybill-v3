/**
 * 品控规则引擎
 * - 可配置规则匹配（非硬编码）
 * - 判定过程可追溯（记录命中规则 ID + 判定依据）
 * - 支持多种条件类型
 */

import { prisma } from './db';

interface QcCheckResult {
  passed: boolean;
  hitRuleId?: string;
  hitRuleName?: string;
  anomalySubtype?: string;
  severity?: string;
  description: string;
}

/** 执行品控检测 */
export async function executeQcCheck(
  skuCode: string,
  expectedQty: number,
  actualQty: number,
  extra?: { appearance?: string; spec?: string; label?: string; batch?: string }
): Promise<QcCheckResult> {
  const rules = await prisma.qcRule.findMany({
    where: { enabled: true },
    orderBy: { severity: 'desc' },
  });

  if (rules.length === 0) {
    return { passed: true, description: '未配置品控规则，默认通过' };
  }

  for (const rule of rules) {
    const condition = parseCondition(rule.condition);
    if (!condition) continue;

    let matched = false;
    let matchDesc = '';

    switch (rule.anomalySubtype) {
      case 'qty_mismatch': {
        if (expectedQty > 0) {
          const diffRatio = Math.abs(actualQty - expectedQty) / expectedQty;
          matched = evaluateCondition(diffRatio, condition);
          matchDesc = `预期数量:${expectedQty}, 实际:${actualQty}, 差异率:${(diffRatio * 100).toFixed(1)}%, 阈值:${condition.threshold}${condition.operator}`;
        }
        break;
      }
      case 'appearance_damage': {
        if (extra?.appearance) {
          matched = evaluateCondition(extra.appearance, condition);
          matchDesc = `外观描述: "${extra.appearance}", 匹配条件: ${rule.condition}`;
        }
        break;
      }
      case 'spec_error': {
        if (extra?.spec) {
          matched = evaluateCondition(extra.spec, condition);
          matchDesc = `规格: "${extra.spec}", 匹配条件: ${rule.condition}`;
        }
        break;
      }
      case 'label_error': {
        if (extra?.label) {
          matched = evaluateCondition(extra.label, condition);
          matchDesc = `标签: "${extra.label}", 匹配条件: ${rule.condition}`;
        }
        break;
      }
      case 'batch_error': {
        if (extra?.batch) {
          matched = evaluateCondition(extra.batch, condition);
          matchDesc = `批次: "${extra.batch}", 匹配条件: ${rule.condition}`;
        }
        break;
      }
    }

    if (matched) {
      return {
        passed: false,
        hitRuleId: rule.id,
        hitRuleName: rule.name,
        anomalySubtype: rule.anomalySubtype,
        severity: rule.severity,
        description: matchDesc,
      };
    }
  }

  return { passed: true, description: '品控检测通过，未命中任何规则' };
}

interface Condition {
  field: string;
  operator: string;
  threshold: number | string;
}

function parseCondition(conditionJson: string): Condition | null {
  try {
    return JSON.parse(conditionJson) as Condition;
  } catch {
    return null;
  }
}

function evaluateCondition(value: number | string, condition: Condition): boolean {
  const { operator, threshold } = condition;

  if (typeof value === 'number' && typeof threshold === 'number') {
    switch (operator) {
      case '>': return value > threshold;
      case '>=': return value >= threshold;
      case '<': return value < threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  if (typeof value === 'string' && typeof threshold === 'string') {
    switch (operator) {
      case 'contains': return value.includes(threshold);
      case 'equals': return value === threshold;
      case 'regex': {
        try {
          return new RegExp(threshold).test(value);
        } catch { return false; }
      }
      default: return false;
    }
  }

  return false;
}

/** 根据异常子类型自动确定严重度 */
export function getDefaultSeverity(anomalySubtype: string): string {
  const severityMap: Record<string, string> = {
    qty_mismatch: 'high',
    appearance_damage: 'medium',
    spec_error: 'medium',
    label_error: 'low',
    batch_error: 'high',
    lost: 'critical',
    damaged: 'high',
    rejected: 'medium',
    timeout: 'low',
    wrong_address: 'low',
  };
  return severityMap[anomalySubtype] || 'medium';
}
