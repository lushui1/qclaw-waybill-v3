// 测试 V2 API 的 SKU 校验是否正常工作
// 运行: npx tsx scripts/test-sku.ts
async function main() {
  const V2 = 'https://ideakaoshi.vercel.app';
  const V3 = 'https://atom-code-waybill-v3.vercel.app';
  const KEY = 'dev-key';

  // 测试1: V2 API 直接调用
  console.log('=== 测试1: V2 API 校验 SKU ===');
  const r1 = await fetch(`${V2}/api/v2/orders/1500/skus?skuCode=ZBWP0185`, {
    headers: { 'x-api-key': KEY }
  });
  const d1 = await r1.json();
  console.log('  V2 orders/1500 + ZBWP0185:', r1.status, JSON.stringify(d1));

  // 测试2: V2 API 用不同ID
  const r2 = await fetch(`${V2}/api/v2/orders/116/skus?skuCode=ZBWP0185`, {
    headers: { 'x-api-key': KEY }
  });
  const d2 = await r2.json();
  console.log('  V2 orders/116 + ZBWP0185:', r2.status, JSON.stringify(d2));

  // 测试3: V3 scan API 模拟提交
  const body = {
    waybillId: 'PS2605290247',
    skuCode: 'ZBWP0185',
    skuName: 'ZBWP0185',
    operatorId: 'user-admin',
    operatorName: '管理员',
    expectedQty: 5,
    actualQty: 5,
  };
  const r3 = await fetch(`${V3}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d3 = await r3.json();
  console.log('\n  V3 scan API:', r3.status, JSON.stringify(d3).substring(0, 200));
}
main().catch(console.error);
