import { Pool } from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
if (!m) { console.error('no DATABASE_URL'); process.exit(1); }
const pool = new Pool({ connectionString: m[1] });

const rules = [
  { name: '数量差异超过50%', subtype: 'qty_mismatch', condition: '{"field":"qty_diff","operator":">","threshold":0.5}', severity: 'critical', autoLevel: 2 },
  { name: '严重外观破损', subtype: 'appearance_damage', condition: '{"field":"appearance","operator":"contains","threshold":"严重"}', severity: 'critical', autoLevel: 2 },
  { name: '商品过期检测', subtype: 'batch_error', condition: '{"field":"batch","operator":"contains","threshold":"过期"}', severity: 'critical', autoLevel: 2 },
  { name: '标签模糊', subtype: 'label_error', condition: '{"field":"label","operator":"contains","threshold":"模糊"}', severity: 'low', autoLevel: 1 },
  { name: '包装变形', subtype: 'appearance_damage', condition: '{"field":"appearance","operator":"contains","threshold":"变形"}', severity: 'medium', autoLevel: 1 },
  { name: '数量短缺>20%', subtype: 'qty_mismatch', condition: '{"field":"qty_diff","operator":"<","threshold":-0.2}', severity: 'high', autoLevel: 1 },
  { name: '数量溢出>20%', subtype: 'qty_mismatch', condition: '{"field":"qty_diff","operator":">=","threshold":0.2}', severity: 'medium', autoLevel: 1 },
  { name: '规格型号不符', subtype: 'spec_error', condition: '{"field":"spec","operator":"contains","threshold":"型号"}', severity: 'high', autoLevel: 2 },
];

async function main() {
  for (const r of rules) {
    const id = `rule-${Date.now()}-${Math.random().toString(36).substring(2,6)}`;
    await pool.query(
      `INSERT INTO "QcRule" (id, name, "anomalySubtype", condition, severity, "autoCreateTicket", "autoLevel", enabled, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,$6,true,NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [id, r.name, r.subtype, r.condition, r.severity, r.autoLevel]
    );
    console.log(`✅ ${r.name}`);
  }
  const count = await pool.query('SELECT COUNT(*) FROM "QcRule"');
  console.log(`\n共 ${count.rows[0].count} 条规则`);
  await pool.end();
}
main().catch(e => console.error('❌', e.message));
