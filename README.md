# 运单全流程管理系统 V3

> 录单 → 扫描品控 → 异常上报 → 分级审批 → 执行联动 —— 运单全生命周期管理

**在线地址：** https://atom-code-waybill-v3.vercel.app  
**源码仓库：** https://github.com/lushui1/qclaw-waybill-v3  
**技术栈：** Next.js 16 (App Router) + TypeScript + Prisma + PostgreSQL (Neon)

---

## 系统定位

本系统是**运单全生命周期管理平台**，承接 V2（AI 录单解析）的输出数据，覆盖运单从入仓到交付完成的完整链路。V3 是**独立部署、独立数据库的系统**，通过 HTTP 接口与 V2 数据互通。

| 阶段 | 所属系统 | 触发方式 | 核心动作 |
|------|---------|---------|---------|
| 录单解析 | V2（已有） | 人工上传/导入 | AI 解析任意格式出库单 → 结构化运单数据 |
| 仓库扫描品控 | V3（新增） | 扫描操作自动触发 | 品控规则引擎检测 → 通过出库 / 异常暂扣 |
| 物流异常上报 | V3（新增） | 操作人手工上报 | 丢件/破损/拒收/超时/地址错误 → 创建工单 |
| 分级审批 | V3（新增） | 工单状态机驱动 | 一级/二级审批，超时自动流转，并发冲突保护 |
| 执行联动 | V3（新增） | 审批通过后触发 | 赔付/库存/退仓/重采购，保证一致性 |

---

## 功能模块

### 模块零：扫描操作与品控检测
- 扫描录入（手工输入 SKU 模拟扫描枪）
- V2 接口实时校验 SKU 归属运单
- 品控规则引擎（可配置条件，不硬编码）
- 品控暂扣（批次锁定，禁止出库）
- 扫描幂等性（重复扫描只追加记录，不创建工单）
- 误判快速放行（仅品控主管可操作，留痕记录）

### 模块一：异常工单上报
- 手工上报（物流异常：丢件/破损/拒收/超时/地址错误）
- 扫描自动触发（品控异常：数量不符/外观破损/规格不符/标签错误/批次异常）
- V2 接口实时校验运单真实性
- 同类型未关闭工单不可重复上报
- 🤖 AI 辅助分类（根据描述自动推荐异常类型+严重度）

### 模块二：分级审批流程引擎
- 一/二级分级审批，金额阈值可配置（`ApprovalLevelConfig` 表）
- 完整状态机（9 种状态，9 条迁移路径）
- 并发冲突保护（乐观锁）
- 审批人离职兜底（管理员可转交）
- 超时自动流转（惰性检测）
- 权限边界（上报人不能自批，后端 API 校验）
- 幂等性（token 唯一约束）
- 🤖 AI 建议审批意见（显示依据和参考历史记录）

### 模块三：执行联动
- 审批通过后自动创建赔付记录
- 库存联动（退货入库/赔付扣减/批次解锁）
- 事务一致性（`$transaction` 保证无中间态）
- 可追溯性（赔付记录关联 `approvalRecordId`）

### 模块四：工单列表与追踪
- 按状态、异常类型、来源、关键词筛选
- 分页支持
- 即将超时工单醒目提示
- 详情页展示完整审批历史（审计日志）

### 模块五：跨系统接口与数据一致性
- 接口同步监控页（最近同步时间/成功率/调用日志）
- 数据来源标注（"实时获取自 V2"或"本地缓存，同步于 XX 时间"）
- V2 不可用时的降级方案（本地快照兜底）
- Request ID 链路追踪（SyncLog 表）

---

## 技术架构

```
┌─────────────────────────────────────────────┐
│              V3 前端 (Next.js)               │
│  /scan /tickets /approval /sync /rules       │
│  /tickets/new (异常上报+AI分类)               │
└──────────┬──────────┬───────────────────────┘
           │ HTTP     │ HTTP
┌──────────▼──────────▼───────────────────────┐
│           V3 API Routes (Next.js)            │
│  /api/scan /api/tickets /api/approval ...    │
│  /api/sync /api/rules /api/users             │
│  /api/waybills                               │
└──────────┬──────────┬───────────────────────┘
           │ Prisma    │ fetch
┌──────────▼──────────▼───────────────────────┐
│   Neon PostgreSQL      V2 HTTP API           │
│   (独立数据库实例)       ideakaoshi.vercel.app │
│   V3 自有数据           /api/v2/orders/*      │
└─────────────────────────────────────────────┘
```

---

## 大模型接入

| 项目 | 说明 |
|------|------|
| 模型 | **agnes-2.0-flash** |
| API 地址 | `https://apihub.agnes-ai.com/v1` |
| AI 辅助分类 | `/tickets/new` 页面，输入描述→自动推荐异常类型+严重度 |
| AI 审批建议 | 工单详情页，自动生成审批建议并附依据说明 |
| 降级方案 | LLM 超时/失败时降级到关键词匹配，不阻塞主流程 |

---

## 环境变量

```env
DATABASE_URL="postgresql://..."
V2_API_BASE_URL="https://ideakaoshi.vercel.app"
V2_API_KEY="dev-key"
NEXT_PUBLIC_LLM_URL="https://apihub.agnes-ai.com/v1"
NEXT_PUBLIC_LLM_KEY="sk-..."
NEXT_PUBLIC_LLM_MODEL="agnes-2.0-flash"
```

---

## 快速开始

```bash
# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 初始化数据库（创建 V3 表 + 默认用户 + 审批配置）
npx tsx scripts/init-db.ts

# 启动开发服务器
npm run dev
```

---

## 部署

项目已部署到 Vercel（独立项目，与 V2 分离）：

- **V3 正式地址：** https://atom-code-waybill-v3.vercel.app
- **V2 API 地址：** https://ideakaoshi.vercel.app

---

## 文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 系统间接口文档 | [`docs/API-CONTRACT.md`](./docs/API-CONTRACT.md) | V3↔V2 接口列表、入参出参、鉴权、超时重试、降级方案 |
| 需求理解与假设说明 | [`docs/ASSUMPTIONS.md`](./docs/ASSUMPTIONS.md) | 9 项留白规则说明、边界情况、反思题 |
| 大模型调用说明 | [`docs/LLM-USAGE.md`](./docs/LLM-USAGE.md) | 模型信息、Prompt 设计、AI 建议确认原则 |

---

## 数据模型

| 表名 | 说明 |
|------|------|
| WaybillSnapshot | V2 运单本地只读快照/缓存 |
| SyncLog | V2 接口调用日志（Request ID 追踪） |
| Ticket | 异常工单（含状态机、审批层级、金额） |
| ApprovalRecord | 审批记录（含 token 幂等性） |
| PaymentRecord | 赔付记录（含 direction 赔付方向） |
| Inventory | 库存（含 lockedQty 品控暂扣） |
| InventoryLog | 库存变更日志 |
| ScanRecord | 扫描记录（含 batchStatus 批次状态） |
| QcRule | 品控规则（可配置触发条件） |
| ApprovalLevelConfig | 分级审批金额阈值配置 |
| User | 用户/角色表（5 种角色） |
