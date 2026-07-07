# 大模型调用说明

> 本文档说明 V3 系统中大模型（LLM）的接入方式、使用场景、降级方案和安全策略。

---

## 1. 模型信息

| 项目 | 说明 |
|------|------|
| 模型 | **agnes-2.0-flash** |
| API 地址 | `https://apihub.agnes-ai.com/v1` |
| 鉴权方式 | Bearer Token（Header: `Authorization: Bearer <api-key>`） |
| 超时时间 | 15 秒 |
| Temperature | 0.3（低温度保证输出稳定性） |
| Max Tokens | 500 |
| 接口兼容 | OpenAI Chat Completions API 兼容 |

### 配置方式

```
NEXT_PUBLIC_LLM_URL=https://apihub.agnes-ai.com/v1
NEXT_PUBLIC_LLM_KEY=sk-4q2k8spHszQUzelLSe8dD11d3t5Fswh9ResjekJgWJmis0yq
NEXT_PUBLIC_LLM_MODEL=agnes-2.0-flash
```

---

## 2. 使用场景

### 2.1 AI 辅助分类（异常上报页）

**文件：** `src/lib/llm.ts` → `classifyWithLlm()`

**触发时机：** 用户在 `/tickets/new` 页面填写异常描述后，点击"AI 辅助分类"按钮

**完整 Prompt 设计：**

```
System: 你是一个物流品控专家助手，只返回 JSON。

User:
你是一个物流品控系统的 AI 助手。请根据以下异常描述，判断最匹配的异常类型和严重度。

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

异常描述：{用户输入的描述文本}
```

**返回示例：**
```json
{"type":"lost","severity":"critical"}
```

**前端处理：**
- 解析 JSON 获取 type/severity
- 自动填充异常类型下拉框和严重度
- 显示蓝色 AI 建议提示框
- 用户可手动修改 AI 推荐的类型

### 2.2 AI 审批建议（工单详情页）

**文件：** `src/lib/llm.ts` → `getApprovalSuggestionWithLlm()`

**触发时机：** 审批人打开工单详情页时自动触发（useEffect 异步调用）

**完整 Prompt 设计：**

```
System: 你是一个物流审批专家，只返回 JSON。

User:
你是一个物流异常的审批助手。请给出审批建议。

异常类型：丢件
异常金额：¥5000.00
异常描述：客户反馈包裹未收到，物流显示已签收

请按以下 JSON 格式返回：
{"suggestion":"审批建议","reason":"给出这个建议的理由"}

要求：建议要具体可执行，理由要合理。
```

**返回示例：**
```json
{"suggestion":"建议核准赔付，同时安排补发","reason":"丢件属于高严重度异常，物流显示已签收但客户未收到，建议优先赔付客户并补发货物"}
```

**前端处理：**
- 在审批操作区上方显示 AI 建议框
- 标注"🤖 AI 建议审批意见 — 需人工确认"
- 显示依据说明
- 审批人可参考 AI 建议自行决定

---

## 3. 降级方案（关键词匹配）

当 LLM API 不可用时，系统自动降级到关键词匹配，流程不受影响。

### 降级触发条件

| 异常场景 | 处理方式 | 代码逻辑 |
|---------|---------|---------|
| API 超时（>15s） | 降级 | AbortController 触发，catch 中 fallback |
| 返回非 JSON | 降级 | JSON.parse 失败，catch 中 fallback |
| HTTP 4xx/5xx | 降级 | `res.ok` 检查，catch 中 fallback |
| 网络断开 | 降级 | fetch 异常，catch 中 fallback |

### 关键词降级逻辑（`src/lib/ai-classifier.ts`）

**异常分类降级：**
- 预定义 10 组关键词规则，覆盖全部 10 种异常类型
- 如 `['丢件','丢失','遗失','找不到','缺件','少货']` → `lost` 类型，`critical` 严重度
- 置信度计算公式：`Math.min(100, 60 + (关键词长度/描述长度) * 40)`
- 多条规则命中时按置信度降序排列

**审批建议降级：**
- 每种异常类型有固定的建议模板（如 lost → "建议核准赔付，同时安排补发"）
- 依据字段说明参考的历史记录数量

---

## 4. "AI 建议，需人工确认"原则

| 场景 | 前端标注方式 |
|------|-------------|
| 异常上报页 | 蓝色圆角提示框，顶部标题"🤖 AI 建议 — 需人工确认"，显示推荐类型、置信度、匹配关键词 |
| 工单详情页 | 审批操作区上方的蓝色提示框，标题"🤖 AI 建议审批意见 — 需人工确认"，显示具体建议和依据 |
| AI 不自动执行 | 建议不会自动提交或执行，用户必须手动点击"提交上报"/"通过"/"拒绝" |
| 可人工修改 | AI 推荐的异常类型可以手动修改为其他类型 |

---

## 5. 架构设计

```
┌─────────────────────────────────────────────────┐
│  前端页面                                        │
│  /tickets/new (AI分类按钮)                        │
│  /tickets/[id] (AI审批建议, useEffect自动触发)     │
└──────────────┬──────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────┐
│  src/lib/ai-classifier.ts                        │
│  - classifyAnomaly()         ← 优先LLM，降级关键词 │
│  - generateApprovalSuggestion() ← 优先LLM，降级关键词│
│  - getTopSuggestion()                             │
└──────────────┬──────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────┐
│  src/lib/llm.ts                                  │
│  - callLlm()              ← OpenAI兼容接口封装     │
│  - classifyWithLlm()      ← AI分类Prompt          │
│  - getApprovalSuggestionWithLlm() ← 审批建议Prompt │
│  - 超时控制: AbortController + 15s timer          │
│  - 错误处理: 不抛异常，返回 null                   │
└──────────────┬──────────────────────────────────┘
               │ HTTP POST
┌──────────────▼──────────────────────────────────┐
│  apihub.agnes-ai.com/v1/chat/completions         │
│  Model: agnes-2.0-flash                          │
└─────────────────────────────────────────────────┘
```

## 6. 安全性

- API Key 通过环境变量 `NEXT_PUBLIC_LLM_KEY` 注入，不硬编码在代码中
- 只在客户端浏览器中调用（`NEXT_PUBLIC_` 前缀意味着它在客户端公开）
- **建议在生产环境中改用服务端 API route 代理调用**，避免暴露 API Key
- 当前方案为客户端直接调用，适用于开发/演示环境
