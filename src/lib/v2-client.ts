import { prisma } from './db';

// ──────────────────────────────────────────
// V2 HTTP API 客户端
// ──────────────────────────────────────────

const V2_BASE = process.env.V2_API_BASE_URL || 'http://localhost:3000';
const V2_API_KEY = process.env.V2_API_KEY || '';
const TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;

interface V2OrderResponse {
  id: string;
  externalCode: string | null;
  receiverStore: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  skuCode: string;
  skuName: string;
  skuQuantity: string;
  skuSpec: string | null;
  remark: string | null;
}

interface V2ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  requestId: string;
  durationMs: number;
}

/** 生成 Request ID 用于链路追踪 */
function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `v3-${ts}-${rand}`;
}

/** 带超时的 fetch */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** 核心请求函数：自动重试 + Request ID 追踪 + 日志记录 */
async function request<T>(
  endpoint: string,
  options: { method?: string; params?: Record<string, string> } = {}
): Promise<V2ApiResult<T>> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { method = 'GET', params } = options;

  // 构建 URL
  const url = new URL(`${V2_BASE}/api${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  // 重试循环
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url.toString(),
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': V2_API_KEY,
            'X-Request-ID': requestId,
          },
        },
        TIMEOUT_MS
      );

      lastStatusCode = response.status;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        lastError = `V2 API ${response.status}: ${errorText.substring(0, 200)}`;

        // 4xx 不重试（客户端错误）
        if (response.status >= 400 && response.status < 500) {
          break;
        }
        // 5xx 重试
        continue;
      }

      const data = await response.json();
      const durationMs = Date.now() - startTime;

      // 记录成功日志
      await logSync(requestId, endpoint, params, response.status, durationMs, true);

      return { success: true, data: data as T, requestId, durationMs, statusCode: response.status };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = `请求超时 (${TIMEOUT_MS}ms)`;
      } else {
        lastError = err.message || String(err);
      }
      // 最后一次尝试也失败，跳出循环
      if (attempt >= MAX_RETRIES) break;
      // 指数退避：1s, 2s
      await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
    }
  }

  const durationMs = Date.now() - startTime;

  // 记录失败日志
  await logSync(requestId, endpoint, params, lastStatusCode, durationMs, false, lastError);

  return {
    success: false,
    error: lastError || 'Unknown error',
    requestId,
    durationMs,
    statusCode: lastStatusCode,
  };
}

/** 写入同步日志 */
async function logSync(
  requestId: string,
  endpoint: string,
  params: Record<string, string> | undefined,
  statusCode: number | undefined,
  durationMs: number,
  success: boolean,
  errorMsg?: string
) {
  try {
    await prisma.syncLog.create({
      data: {
        requestId,
        endpoint,
        params: params ? JSON.stringify(params) : null,
        statusCode: statusCode ?? null,
        durationMs,
        success,
        errorMsg,
      },
    });
  } catch {
    // 日志写失败不影响主流程
  }
}

// ──────────────────────────────────────────
// 对外接口方法
// ──────────────────────────────────────────

/** 校验运单是否存在 + 获取详情 */
export async function verifyWaybill(v2OrderId: string) {
  return await request<V2OrderResponse>(`/v2/orders/${v2OrderId}`);
}

/** 校验 SKU 是否归属于指定运单 */
export async function verifySkuBelongsToWaybill(v2OrderId: string, skuCode: string) {
  return await request<{ exists: boolean }>(`/v2/orders/${v2OrderId}/skus`, {
    params: { skuCode },
  });
}

/** 同步运单列表（分页） */
export async function syncWaybills(page: number = 1, pageSize: number = 50, status?: string) {
  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
  if (status) params.status = status;
  return await request<{ orders: V2OrderResponse[]; total: number }>('/v2/orders', { params });
}

/** (可选) 回写异常状态到 V2 */
export async function writebackAnomalyStatus(v2OrderId: string, status: string, ticketNo: string) {
  return await request<{ success: boolean }>(`/v2/orders/${v2OrderId}/anomaly-status`, {
    method: 'POST',
    params: { status, ticketNo },
  });
}
