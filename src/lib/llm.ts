/**
 * LLM API 封装（OpenAI 兼容接口）
 * 用于 AI 辅助分类 + 建议审批意见
 * 调用失败时不阻塞主流程，降级到关键词匹配
 */

const LLM_BASE = process.env.NEXT_PUBLIC_LLM_URL || 'https://apihub.agnes-ai.com/v1';
const LLM_KEY = process.env.NEXT_PUBLIC_LLM_KEY || 'sk-4q2k8spHszQUzelLSe8dD11d3t5Fswh9ResjekJgWJmis0yq';
const LLM_MODEL = process.env.NEXT_PUBLIC_LLM_MODEL || 'agnes-2.0-flash';
const TIMEOUT_MS = 15000;

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 调用 LLM API */
async function callLlm(messages: LlmMessage[]): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[LLM] API error: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[LLM] Request timeout');
    } else {
      console.warn('[LLM] Request failed:', err.message);
    }
    return null;
  }
}

/** AI 辅助分类：异常描述 → 推荐类型+严重度 */
export async function classifyWithLlm(description: string): Promise<{
  type: string; severity: string; typeLabel: string; fromLlm: boolean;
} | null> {
  const prompt = `你是一个物流品控系统的 AI 助手。请根据以下异常描述，判断最匹配的异常类型和严重度。

可选异常类型（含中文标签）：
- lost: 丢件
- damaged: 破损
- rejected: 客户拒收
- timeout: 超时未签收
- wrong_address: 地址错误
- qty_mismatch: 数量不符
- appearance_damage: 外观破损
- spec_error: 规格不符
- label_error: 标签错误
- batch_error: 批次异常

可选严重度：low, medium, high, critical

请严格按以下 JSON 格式返回，不要返回其他内容：
{"type":"异常类型","severity":"严重度"}

异常描述：${description}`;

  const result = await callLlm([
    { role: 'system', content: '你是一个物流品控专家助手，只返回 JSON。' },
    { role: 'user', content: prompt },
  ]);

  if (!result) return null;

  try {
    const parsed = JSON.parse(result);
    const typeLabels: Record<string, string> = {
      lost: '丢件', damaged: '破损', rejected: '客户拒收', timeout: '超时未签收',
      wrong_address: '地址错误', qty_mismatch: '数量不符', appearance_damage: '外观破损',
      spec_error: '规格不符', label_error: '标签错误', batch_error: '批次异常',
    };
    return {
      type: parsed.type,
      severity: parsed.severity || 'medium',
      typeLabel: typeLabels[parsed.type] || parsed.type,
      fromLlm: true,
    };
  } catch {
    return null;
  }
}

/** AI 审批建议 */
export async function getApprovalSuggestionWithLlm(
  anomalyType: string, amount: number, description: string
): Promise<{ suggestion: string; reason: string; fromLlm: boolean } | null> {
  const typeLabels: Record<string, string> = {
    lost: '丢件', damaged: '破损', rejected: '客户拒收', timeout: '超时未签收',
    wrong_address: '地址错误', qty_mismatch: '数量不符', appearance_damage: '外观破损',
    spec_error: '规格不符', label_error: '标签错误', batch_error: '批次异常',
  };

  const prompt = `你是一个物流异常的审批助手。请给出审批建议。

异常类型：${typeLabels[anomalyType] || anomalyType}
异常金额：¥${(amount / 100).toFixed(2)}
异常描述：${description || '无'}

请按以下 JSON 格式返回：
{"suggestion":"审批建议","reason":"给出这个建议的理由"}

要求：建议要具体可执行，理由要合理。`;

  const result = await callLlm([
    { role: 'system', content: '你是一个物流审批专家，只返回 JSON。' },
    { role: 'user', content: prompt },
  ]);

  if (!result) return null;

  try {
    const parsed = JSON.parse(result);
    return { suggestion: parsed.suggestion, reason: parsed.reason, fromLlm: true };
  } catch {
    return null;
  }
}
