'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ScanPage() {
  const [waybills, setWaybills] = useState<any[]>([]);
  const [selectedWaybillId, setSelectedWaybillId] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [expectedQty, setExpectedQty] = useState('');
  const [actualQty, setActualQty] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      if (users.length > 0) setCurrentUser(users[0]);
    }).catch(() => {});

    fetch('/api/sync', { method: 'POST', body: JSON.stringify({ page: 1 }) }).then(r => r.json()).then(() => {
      // 同步后加载运单列表
      fetch('/api/tickets?pageSize=5').then(r => r.json()).then(() => {});
    }).catch(() => {});

    fetchRecentScans();
  }, []);

  const fetchRecentScans = () => {
    fetch('/api/scan?pageSize=5').then(r => r.json()).then(data => {
      setRecentScans(data.records || []);
    }).catch(() => {});
  };

  const handleScan = async () => {
    if (!selectedWaybillId || !skuCode || !actualQty) {
      alert('请填写完整扫描信息');
      return;
    }
    if (!currentUser) {
      alert('请先配置用户');
      return;
    }

    setScanning(true);
    setResult(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waybillId: selectedWaybillId,
          skuCode,
          skuName: skuCode,
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
      setSkuCode('');
      setActualQty('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !scanning) {
      handleScan();
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>📷 扫描品控</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
              扫描录入 → 规则检测 → 批次锁定
            </p>
          </div>
          <Link href="/" className="btn-outline">← 首页</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* 扫描表单 */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>扫描录入</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>运单</label>
                <select
                  className="input"
                  value={selectedWaybillId}
                  onChange={(e) => setSelectedWaybillId(e.target.value)}
                >
                  <option value="">选择运单</option>
                  {waybills.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.externalCode || w.v2OrderId}</option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="或输入 V2 运单号"
                  style={{ marginTop: 8 }}
                  onBlur={(e) => {
                    if (e.target.value) {
                      // 根据运单号查选
                    }
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                  SKU 编码
                </label>
                <input
                  className="input"
                  placeholder="扫描或输入 SKU 编码"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>应发数量</label>
                  <input className="input" type="number" placeholder="0" value={expectedQty} onChange={(e) => setExpectedQty(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>实际数量</label>
                  <input className="input" type="number" placeholder="0" value={actualQty} onChange={(e) => setActualQty(e.target.value)} onKeyDown={handleKeyDown} />
                </div>
              </div>

              <button className="btn-primary" onClick={handleScan} disabled={scanning} style={{ marginTop: 8 }}>
                {scanning ? '扫描检测中...' : '📷 扫描检测'}
              </button>
            </div>
          </div>

          {/* 检测结果 */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>检测结果</h3>
            {result ? (
              <div>
                {result.qcResult?.passed ? (
                  <div style={{
                    padding: 16, borderRadius: 8, background: '#F0FFF4',
                    border: '1px solid #9AE6B4', textAlign: 'center', marginBottom: 12,
                  }}>
                    <p style={{ fontSize: 24, marginBottom: 4 }}>✅</p>
                    <p style={{ fontWeight: 600, color: 'var(--success)' }}>品控通过</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{result.qcResult.description}</p>
                  </div>
                ) : (
                  <div style={{
                    padding: 16, borderRadius: 8, background: 'var(--error-bg)',
                    border: '1px solid #FEB2B2', marginBottom: 12,
                  }}>
                    <p style={{ fontSize: 24, marginBottom: 4 }}>⚠️</p>
                    <p style={{ fontWeight: 600, color: 'var(--error)' }}>品控异常</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      命中规则: {result.qcResult?.hitRuleName || '-'}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                      {result.qcResult?.description}
                    </p>
                  </div>
                )}

                {result.ticket && (
                  <div style={{
                    padding: 12, borderRadius: 8, background: 'var(--primary-light)',
                    border: '1px solid #B2F5EA', marginBottom: 12,
                  }}>
                    <p style={{ fontWeight: 500, fontSize: 13 }}>📋 已自动创建异常工单</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      工单号: {result.ticket.ticketNo}
                    </p>
                    <button
                      className="btn-outline btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => router.push(`/tickets/${result.ticket.id}`)}
                    >
                      查看工单
                    </button>
                  </div>
                )}

                {result.isDuplicate && (
                  <div style={{
                    padding: 12, borderRadius: 8, background: 'var(--warning-bg)',
                    border: '1px solid #FEEBC8', marginBottom: 12,
                  }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>🔁 {result.warning}</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                <p style={{ fontSize: 48, marginBottom: 8 }}>📦</p>
                <p style={{ fontSize: 14 }}>扫描后在此显示结果</p>
              </div>
            )}
          </div>
        </div>

        {/* 最近扫描记录 */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>最近扫描记录</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
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
                    <td style={{ fontSize: 13 }}>{s.skuCode}</td>
                    <td>
                      {s.qcResult === 'pass' ? (
                        <span className="tag tag-success">通过</span>
                      ) : (
                        <span className="tag tag-error">异常</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {s.batchStatus === 'locked' ? <span style={{ color: 'var(--error)' }}>🔒 锁定</span> :
                       s.batchStatus === 'unlocked' ? <span style={{ color: 'var(--success)' }}>✓ 已解锁</span> :
                       <span style={{ color: 'var(--text-muted)' }}>正常</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>{s.operatorName || '-'}</td>
                    <td style={{ fontSize: 12 }}>{new Date(s.scanTime).toLocaleString()}</td>
                    <td>
                      {s.ticket ? (
                        <a href={`/tickets/${s.ticketId}`} style={{ fontSize: 12, color: 'var(--primary)' }}>
                          {s.ticket?.ticketNo || '查看'}
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                {recentScans.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无扫描记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Need to import Link
import Link from 'next/link';
