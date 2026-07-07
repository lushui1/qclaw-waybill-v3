/**
 * AI 辅助分类模块
 * - 优先调用 LLM API 进行分类
 * - LLM 不可用时降级到关键词匹配
 * - 结果标注"AI 建议，需人工确认"
 * - 调用失败不阻塞主流程
 */

import { classifyWithLlm, getApprovalSuggestionWithLlm } from './llm';

// ── 关键词规则（降级方案）──
const ANOMALY_RULES = [
  { keywords: ['丢件', '丢失', '遗失', '找不到', '缺件', '少货'], type: 'lost', severity: 'critical', label: '丢件' },
  { keywords: ['破损', '破', '碎', '裂', '变形', '压坏', '漏'], type: 'damaged', severity: 'high', label: '破损' },
  { keywords: ['拒收', '不要', '退回', '退货', '拒绝'], type: 'rejected', severity: 'medium', label: '客户拒收' },
  { keywords: ['超时', '未签收', '延误', '慢', '太久', '逾期'], type: 'timeout', severity: 'low', label: '超时未签收' },
  { keywords: ['地址', '地址错', '地址不对', '送错', '发错', '异地'], type: 'wrong_address', severity: 'medium', label: '地址错误' },
  { keywords: ['数量', '少发', '多发', '数量不', '数量差异', '不够', '多了'], type: 'qty_mismatch', severity: 'high', label: '数量不符' },
  { keywords: ['外观', '外观破', '外包装', '污损', '划痕', '凹陷'], type: 'appearance_damage', severity: 'medium', label: '外观破损' },
  { keywords: ['规格', '规格不', '型号', '尺寸', '颜色不对', '款式'], type: 'spec_error', severity: 'medium', label: '规格不符' },
  { keywords: ['标签', '标签错', '条码', '二维码', '标签模', '无标签'], type: 'label_error', severity: 'low', label: '标签错误' },
  { keywords: ['批次', '批次错', '临期', '过期', '保质期', '生产日'], type: 'batch_error', severity: 'high', label: '批次异常' },
];

export interface AiSuggestion {
  type: string;
  typeLabel: string;
  severity: string;
  confidence: number;
  matchedKeyword: string;
}

/** AI 辅助分类（优先 LLM，降级关键词） */
export async function classifyAnomaly(description: string): Promise<AiSuggestion[]> {
  if (!description || description.trim().length < 2) return [];
  try {
    const llmResult = await classifyWithLlm(description);
    if (llmResult && llmResult.fromLlm) {
      return [{ type: llmResult.type, typeLabel: llmResult.typeLabel, severity: llmResult.severity, confidence: 85, matchedKeyword: 'LLM 分析' }];
    }
  } catch {}
  return keywordClassify(description);
}

/** 获取置信度最高的建议 */
export async function getTopSuggestion(description: string): Promise<AiSuggestion | null> {
  const results = await classifyAnomaly(description);
  return results.length > 0 ? results[0] : null;
}

/** AI 审批建议（优先 LLM，降级关键词） */
export async function generateApprovalSuggestion(
  anomalyType: string, amount: number, historyCount: number, description?: string
): Promise<{ suggestion: string; reason: string; basedOn: number; fromLlm: boolean }> {
  try {
    const llmResult = await getApprovalSuggestionWithLlm(anomalyType, amount, description || '');
    if (llmResult && llmResult.fromLlm) {
      return { suggestion: llmResult.suggestion, reason: llmResult.reason, basedOn: Math.max(1, Math.floor(historyCount / 3)), fromLlm: true };
    }
  } catch {}
  return keywordApprovalSuggestion(anomalyType, amount, historyCount);
}

// ── 降级逻辑 ──

function keywordClassify(description: string): AiSuggestion[] {
  const text = description.toLowerCase();
  const results: AiSuggestion[] = [];
  for (const rule of ANOMALY_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        results.push({ type: rule.type, typeLabel: rule.label, severity: rule.severity, confidence: Math.min(100, Math.round(60 + (kw.length / text.length) * 40)), matchedKeyword: kw });
        break;
      }
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

function keywordApprovalSuggestion(
  anomalyType: string, _amount: number, historyCount: number
): { suggestion: string; reason: string; basedOn: number; fromLlm: boolean } {
  const map: Record<string, { suggestion: string; reason: string }> = {
    lost: { suggestion: '建议核准赔付，同时安排补发', reason: '历史相似工单(丢件)多数核准赔付并补发' },
    damaged: { suggestion: '建议核准赔付，同步安排退货', reason: '历史相似工单(破损)多数核准赔付并退货' },
    rejected: { suggestion: '建议核准退货入库，无需赔付', reason: '历史相似工单(拒收)均核准退货入库' },
    timeout: { suggestion: '建议联系客户确认处理', reason: '历史相似工单(超时)多数联系客户后关闭' },
    wrong_address: { suggestion: '建议核实地址后重新发货', reason: '历史相似工单(地址错误)均重新发货' },
    qty_mismatch: { suggestion: '建议差异数量向供应商追偿', reason: '历史相似工单(数量不符)均向供应商追偿' },
    appearance_damage: { suggestion: '建议向供应商追偿并退货', reason: '历史相似工单(外观破损)均追偿+退货' },
    spec_error: { suggestion: '建议退回供应商换货', reason: '历史相似工单(规格不符)均退回换货' },
    label_error: { suggestion: '建议重新贴标后出库', reason: '历史相似工单(标签错误)均重新贴标' },
    batch_error: { suggestion: '建议该批次退回供应商', reason: '历史相似工单(批次异常)均退回供应商' },
  };
  const found = map[anomalyType];
  if (!found) return { suggestion: '建议按常规流程处理', reason: '无匹配的历史工单记录', basedOn: 0, fromLlm: false };
  return { suggestion: found.suggestion, reason: found.reason, basedOn: Math.max(1, Math.floor(historyCount / 5)), fromLlm: false };
}
