'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function ScanPage() {
  const [waybills, setWaybills] = useState<any[]>([]);
  const [selectedWaybill, setSelectedWaybill] = useState<any>(null);
  const [skuOptions, setSkuOptions] = useState<any[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [expectedQty, setExpectedQty] = useState('');
  const [actualQty, setActualQty] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [v2OrderId, setV2OrderId] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      if (users.length > 0) setCurrentUser(users[0]);
    }).catch(() => {});
    fetchWaybills();
    fetchRecentScans();
  }, []);

  const fetchWaybills = async () => {
    try {
      const res = await fetch('/api/waybills?pageSize=100');
      const data = await res.json();
      if (data.waybills) {
        // 按 externalCode 去重，合并同运单下的所有 SKU
        const seen = new Map<string, any[]>();
        for (const w of data.waybills) {
          const key = w.externalCode || w.v2OrderId;
          if (!seen.has(key)) seen.set(key, []);
          seen.get(key)!.push(w);
        }
        const merged = Array.from(seen.entries()).map(([code, items]) => {
          let allSkus: any[] = [];
          for (const item of items) {
            if (item.skuSummary) {
              try {
                const skus = JSON.parse(item.skuSummary);
                if (Array.isArray(skus)) allSkus = allSkus.concat(skus);
              } catch {}
            }
          }
          return { ...items[0], _allWaybills: items, _mergedSkus: allSkus };
        });
        setWaybills(merged);
      }
    } catch {}
  };

  const fetchRecentScans = () => {
    fetch('/api/scan?pageSize=5').then(r => r.json()).then(data => {
      setRecentScans(data.records || []);
    }).catch(() => {});
  };

  // 选中运单 → 自动带出V2运单号 + SKU下拉选项 + 应发数量
  const handleWaybillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    if (!code) {
      setSelectedWaybill(null);
      setV2OrderId('');
      setSkuOptions([]);
      setSelectedSku('');
      setExpectedQty('');
      return;
    }
    const wb = waybills.find(w => (w.externalCode || w.v2OrderId) === code) || null;
    setSelectedWaybill(wb);
    setV2OrderId(wb?.v2OrderId || '');

    const skus = wb?._mergedSkus || [];
    setSkuOptions(skus);
    if (skus.length > 0) {
      setSelectedSku(skus[0].skuCode || '');
      setExpectedQty(skus[0].qty || '');
    } else {
      setSelectedSku('');
      setExpectedQty('');
    }
  };

  // SKU 选择（输入 + 自动更新应发数量）
  const handleSkuSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setSelectedSku(val);
    // 找到匹配的 SKU 自动填充应发数量
    const matched = skuOptions.find(s => s.skuCode === val);
    if (matched) setExpectedQty(matched.qty || '');
  };

  const handleScan = async () => {
    const firstWaybill = selectedWaybill?._allWaybills?.[0];
    const actualId = firstWaybill?.id || v2OrderId;
    if (!actualId || !selectedSku || !actualQty) { toast.error('请填写完整扫描信息'); return; }
    if (!currentUser) { toast.error('请先配置用户'); return; }

    setScanning(true);
    setResult(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waybillId: actualId,
          skuCode: selectedSku,
          skuName: selectedSku,
          operatorId: currentUser.id,
          operatorName: currentUser.name,
          expectedQty: parseInt(expectedQty) || 0,
          actualQty: parseInt(actualQty) || 0,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      fetchRecentScans();
      setSelectedSku('');
      setActualQty('');
      setExpectedQty('');
    } catch (err: any) {
      toast(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !scanning) handleScan();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📷 扫描品控</div>
          <div className="page-subtitle">扫描录入 → 规则检测 → 批次锁定</div>
        </div>
      </div>

      {/* 扫描表单 */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group" style={{ minWidth: 220 }}>
            <label>运单（支持输入或选择）</label>
            <input className="input" list="wbList" placeholder="输入运单号或从列表选择"
              value={selectedWaybill ? (selectedWaybill.externalCode || selectedWaybill.v2OrderId) : v2OrderId}
              onChange={e => {
                const val = e.target.value;
                setV2OrderId(val);
                const matched = waybills.find(w => (w.externalCode || w.v2OrderId) === val);
                setSelectedWaybill(matched || null);
              }} />
            <datalist id="wbList">
              {waybills.map((w: any) => (
                <option key={w.id} value={w.externalCode || w.v2OrderId} />
              ))}
            </datalist>
          </div>
          <div className="filter-group" style={{ minWidth: 160 }}>
            <label>V2 运单号</label>
            <input className="input" placeholder="可手动输入" value={v2OrderId}
              onChange={e => setV2OrderId(e.target.value)} />
          </div>
          <div className="filter-group" style={{ minWidth: 180 }}>
            <label>SKU 编码</label>
            <input className="input" placeholder="手动输入 SKU"
              value={selectedSku} onChange={e => setSelectedSku(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown} autoFocus />
          </div>
          <div className="filter-group" style={{ minWidth: 100 }}>
            <label>应发数量</label>
            <input className="input" type="number" placeholder="0" value={expectedQty}
              onChange={e => setExpectedQty(e.target.value)} />
          </div>
          <div className="filter-group" style={{ minWidth: 100 }}>
            <label>实际数量</label>
            <input className="input" type="number" placeholder="0" value={actualQty}
              onChange={e => setActualQty(e.target.value)} onKeyDown={handleKeyDown} />
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
              {scanning ? '检测中...' : '📷 扫描检测'}
            </button>
          </div>
        </div>
      </div>

      {/* 检测结果 */}
      {result && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">检测结果</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {result.qcResult?.passed ? (
              <div style={{ flex: 1, padding: 16, borderRadius: 8, background: 'var(--success-light)', border: '1px solid #A9DFBF' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
                <div style={{ fontWeight: 600, color: 'var(--success)' }}>品控通过</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{result.qcResult.description}</div>
              </div>
            ) : (
              <div style={{ flex: 1, padding: 16, borderRadius: 8, background: 'var(--error-bg)', border: '1px solid #F5B7B1' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️</div>
                <div style={{ fontWeight: 600, color: 'var(--error)' }}>品控异常</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  命中规则: {result.qcResult?.hitRuleName || '-'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{result.qcResult?.description}</div>
              </div>
            )}
            {result.ticket && (
              <div style={{ flex: 1, padding: 16, borderRadius: 8, background: 'var(--primary-light)', border: '1px solid #AED6F1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>📋 已自动创建异常工单</span>
                  <span style={{ fontSize: 11, background: 'var(--primary)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                    📷 扫描触发
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>工单号: {result.ticket.ticketNo}</div>
                <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => router.push(`/tickets/${result.ticket.id}`)}>查看工单</button>
              </div>
            )}
            {result.isDuplicate && (
              <div style={{ padding: 16, borderRadius: 8, background: 'var(--warning-bg)', border: '1px solid #F9E79F' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>🔁 {result.warning}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 最近扫描记录 */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>运单号</th>
              <th>SKU</th>
              <th>结果</th>
              <th>批次状态</th>
              <th>操作人</th>
              <th>时间</th>
              <th>关联工单</th>
            </tr>
          </thead>
          <tbody>
            {recentScans.map((s: any) => (
              <tr key={s.id}>
                <td style={{ fontSize: 12 }}>{s.waybill?.externalCode || '-'}</td>
                <td>{s.skuCode}</td>
                <td>{s.qcResult === 'pass' ? <span className="tag tag-success">通过</span> : <span className="tag tag-error">异常</span>}</td>
                <td>{s.batchStatus === 'locked' ? <span style={{ color: 'var(--error)' }}>🔒 锁定</span> :
                  s.batchStatus === 'unlocked' ? <span style={{ color: 'var(--success)' }}>✓ 已解锁</span> :
                  <span style={{ color: 'var(--text-muted)' }}>正常</span>}
                </td>
                <td>{s.operatorName || '-'}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(s.scanTime).toLocaleString()}</td>
                <td>{s.ticket ? (<a href={`/tickets/${s.ticketId}`} className="btn-link">{s.ticket?.ticketNo || '查看'}</a>) : '-'}</td>
              </tr>
            ))}
            {recentScans.length === 0 && (<tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无扫描记录</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
