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
  const prompt = `你是一个物流仓储品控专家。请分析以下异常描述，判断最匹配的异常类型和严重度。

可选类型：
- lost: 丢件（包裹/货物丢失，找不到）
- damaged: 破损（货物破损、碎裂、漏液）
- rejected: 客户拒收（客户拒绝签收）
- timeout: 超时未签收（物流超时，客户未取件）
- wrong_address: 地址错误（发货地址/收件地址错误）
- qty_mismatch: 数量不符（实际数量与应发数量不一致）
- appearance_damage: 外观破损（外包装破损、变形、污损）
- spec_error: 规格不符（规格、型号、尺寸、颜色与订单不符）
- label_error: 标签错误（标签模糊、条码错误、标签缺失）
- batch_error: 批次异常（批次错误、临期、过期）

严重度：low（轻微）| medium（中等）| high（严重）| critical（致命）

规则：描述中明确提到"丢""丢失""遗失"→lost；"破""碎""裂"→damaged；"拒收"→rejected；"超时""慢"→timeout；"地址"→wrong_address；"数量""少""多"→qty_mismatch；"外观""包装"→appearance_damage；"规格""型号""尺寸"→spec_error；"标签""条码"→label_error；"批次""过期""临期"→batch_error

仅返回JSON：{"type":"类型","severity":"严重度"}

描述：${description}`;

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

  const prompt = `你是一个物流审批经理。请根据以下信息给出审批建议。

异常类型：${typeLabels[anomalyType] || anomalyType}
${amount > 0 ? `异常金额：¥${(amount / 100).toFixed(2)}` : '金额：未指定'}
${description ? `描述：${description}` : '无详细描述'}

请针对该异常给出具体的处置建议。要求：
1. 建议要具体可行，包含\"建议核准/建议驳回/需补充材料\"等明确结论
2. 理由要结合实际业务逻辑（如赔付标准、供应商追偿条款、库存影响等）
3. 金额>5000的建议需特别说明理由

仅返回JSON：{"suggestion":"具体建议","reason":"理由说明"}`;

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
