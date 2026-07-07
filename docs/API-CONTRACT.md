# V3 ↔ V2 系统间接口契约文档

> 本文档定义 V3（运单全流程管理系统）调用 V2（AI 录单解析系统）的接口规范

---

## 1. 概述

### 1.1 架构原则
- V3 与 V2 是**两个独立部署的系统**，各自拥有独立数据库
- V3 **不直接连接** V2 的数据库，所有数据交互通过 HTTP API 完成
- V2 负责提供运单主数据，V3 负责异常处理全流程

### 1.2 鉴权方式
- 所有 API 请求需要在 Header 中携带 `X-API-Key`
- V2 侧验证 API Key 有效性，无效返回 `401 Unauthorized`
- V3 侧在环境变量 `V2_API_KEY` 中配置密钥
- 每次请求携带 `X-Request-ID` 用于链路追踪

### 1.3 通用请求头

```
Content-Type: application/json
X-API-Key: <V2_API_KEY>
X-Request-ID: v3-<timestamp>-<random>
```

### 1.4 通用响应格式

```json
{
  "success": true/false,
  "data": { ... },
  "error": "错误信息（失败时）",
  "requestId": "v3-xxx"
}
```

---

## 2. 接口列表

### 2.1 校验运单是否存在 + 获取详情

```
GET /api/v2/orders/:id
```

**用途：** 发起异常上报时，实时校验运单的真实存在性

**响应示例 (200)：**

```json
{
  "id": "cm8abc123",
  "externalCode": "WAYBILL-000001",
  "receiverStore": "门店A",
  "receiverName": "收件人1",
  "receiverPhone": "13800000001",
  "receiverAddress": "北京市朝阳区测试路1号",
  "totalAmount": 150000,
  "skuCode": "SKU-0001",
  "skuName": "商品1",
  "skuQuantity": "10",
  "skuSpec": "标准",
  "remark": null
}
```

**错误响应：**

| HTTP 状态码 | 含义 | V3 处理 |
|------------|------|---------|
| 404 | 运单不存在 | 拒绝创建工单，提示用户 |
| 502 | V2 服务不可用 | 降级使用本地快照数据 |
| 401 | 鉴权失败 | 记录错误日志，提示运维 |

---

### 2.2 校验 SKU 是否归属于指定运单

```
GET /api/v2/orders/:id/skus?skuCode=<skuCode>
```

**用途：** 扫描录入时，验证扫描的 SKU 确实在该运单的 SKU 明细中

**响应示例 (200)：**

```json
{
  "exists": true,
  "skuInfo": {
    "skuCode": "SKU-0001",
    "skuName": "商品1",
    "quantity": "10",
    "spec": "标准"
  }
}
```

---

### 2.3 按条件查询/同步运单列表

```
GET /api/v2/orders?page=1&pageSize=50&status=active
GET /api/v2/orders?externalCode=PS2605290247&skuCode=ZBWP0185  (精确匹配)
```

**用途：** 本地快照表的初始化或增量同步 / 扫描时精确查找运单+SKU匹配

**查询参数（分页模式）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 50，最大 100 |
| status | string | 否 | 运单状态筛选 |

**查询参数（精确匹配模式）：**
- 同时传入 `externalCode` 和 `skuCode` 时进入精确匹配模式
- 返回 `{ found: boolean, order: { id, externalCode, skuCode, ... } | null }`

**响应示例 (200，分页模式)：**

```json
{
  "orders": [ ... ],
  "total": 500,
  "page": 1,
  "pageSize": 50,
  "totalPages": 10
}
```

---

### 2.4 （可选）异常处理结果回写 V2

```
POST /api/v2/orders/:id/anomaly-status
```

**请求体：**

```json
{
  "status": "anomaly_in_progress",
  "ticketNo": "TKT-20260703-0001",
  "anomalyType": "lost"
}
```

**用途：** V3 侧异常处理开始时通知 V2，让 V2 侧运单详情页显示"该运单存在未关闭异常"标记

---

## 3. 超时与重试策略

### 3.1 超时配置

| 维度 | 配置值 |
|------|--------|
| 连接超时 | **5 秒** |
| 读取超时 | **5 秒**（总超时） |

### 3.2 重试策略

| 参数 | 配置值 |
|------|--------|
| 最大重试次数 | **2 次** |
| 重试间隔 | 指数退避：**1s → 2s** |
| 重试条件 | 仅 5xx 服务端错误和网络超时 |
| 不重试条件 | 4xx 客户端错误（404 不存在、401 鉴权失败） |

### 3.3 幂等性保证

- 每次请求携带唯一的 `X-Request-ID`
- V2 侧对同一 Request ID 的重复请求应返回相同结果（幂等）
- V3 侧在重试时复用相同的 Request ID

---

## 4. 降级方案

### 4.1 V2 服务不可用时

| 场景 | 降级行为 | 用户提示 |
|------|---------|---------|
| 发起异常上报时 V2 不可用 | 拒绝上报，提示"V2 服务暂时不可用，请稍后重试" | 🚫 V2 服务不可用 |
| 查看工单详情时 V2 不可用 | 使用本地快照表数据展示 | ⚠️ 数据获取自 XX:XX（本地快照） |
| 批量同步时 V2 不可用 | 跳过本轮同步，保留上次快照数据 | 🔄 同步失败，数据可能非最新 |

### 4.2 降级代码实现

详见 `src/lib/v2-client.ts`，关键逻辑：

```typescript
// 降级数据源标注
const dataSource = useLocalFallback
  ? `⚠️ 本地缓存 · 同步于 ${lastSyncedAt}`
  : `✅ 实时获取自 V2 接口`;
```

### 4.3 恢复策略

- V3 不主动轮询 V2 健康状态
- 下次用户触发操作（上报/扫描）时自动重试调用 V2
- 调用成功后自动恢复实时数据
- 无需人工介入修复

---

## 5. 老系统二开兼容性说明

### 5.1 如果 V2 原本没有对外接口

假设 V2 没有现成的对外接口，需要新增时：

1. **接口版本策略**：URL 中加入版本号 `/api/v2/`，后续升级用 `/api/v3/`
2. **字段向后兼容**：新增接口字段使用 optional（可空），不破坏已有调用方
3. **灰度上线**：先在 V2 的 staging 环境部署接口，V3 对接测试后再上生产
4. **不影响 V2 现有功能**：新增 API 路由是独立的，不修改 V2 现有路由

### 5.2 V2 接口字段升级时的兼容处理

以「运单金额从 `int` 升级为 `decimal`」为例：

1. **V2 侧**：旧接口同时返回 `totalAmount`（int）和新字段 `totalAmountDecimal`（decimal），V2 的旧调用方不受影响
2. **V3 侧**：优先读取新字段，不存在则读旧字段做兼容
3. **监控**：通过 `SyncLog` 表监控接口字段变化，异常时告警

---

## 6. 请求链路追踪

### 6.1 Request ID 生成

每次 V3 调用 V2 接口时生成唯一 Request ID：

```
格式: v3-<base36_timestamp>-<6位随机>
示例: v3-1a2b3c-xyz789
```

### 6.2 日志记录

每次调用记录到 `SyncLog` 表，包含：

| 字段 | 说明 |
|------|------|
| requestId | 唯一追踪 ID |
| endpoint | 调用的接口名 |
| params | 请求参数摘要 (JSON) |
| statusCode | 响应状态码 |
| durationMs | 调用耗时 (ms) |
| success | 是否成功 |
| errorMsg | 错误详情 |

### 6.3 错误分类

日志中的 `errorMsg` 区分不同错误类型：

- `V2 API 404: Order not found` — 运单不存在（业务错误）
- `V2 API 500: Internal server error` — V2 服务端错误
- `请求超时 (5000ms)` — 网络超时
- `Fetch failed: connect ECONNREFUSED` — V2 服务不可达

---

## 7. 接口状态监控

V3 提供 `/sync` 页面（接口同步监控页），实时展示：

- 最近一次同步时间与状态
- 过去 24h 调用成功率
- 近期的接口调用日志（含 Request ID 链路追踪）
- 支持按成功/失败状态筛选
