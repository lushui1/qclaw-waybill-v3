'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function SyncMonitorPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [latestSummary, setLatestSummary] = useState<any>(null);
  const [recentStats, setRecentStats] = useState<any>({ total: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);
  const [filterSuccess, setFilterSuccess] = useState<string>('');
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  const [waybillCount, setWaybillCount] = useState(0);

  const fetchLogs = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (filterSuccess) params.set('success', filterSuccess);
    fetch(`/api/sync?${params}`).then(r => r.json()).then(data => {
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setLatestSummary(data.latestSummary);
      if (data.recentStats) setRecentStats(data.recentStats);
    }).catch(() => {});
  };

  useEffect(() => { fetchLogs(); fetchWaybillCount(); }, [page, filterSuccess]);

  const fetchWaybillCount = async () => {
    try {
      const r = await fetch('/api/waybills?pageSize=1');
      const d = await r.json();
      if (d.total !== undefined) setWaybillCount(d.total);
    } catch {}
  };

  const handleSync = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const r = await fetch('/api/sync', { method: 'POST', body: JSON.stringify({ page: 1 }) });
      const d = await r.json();
      setLastSyncResult(d);
      fetchLogs();
      fetchWaybillCount();
      if (d.synced !== undefined) toast.success(`同步完成，已处理 ${d.synced} 条`);
    } catch {}
    setSyncing(false);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🔄 接口同步监控</div>
          <div className="page-subtitle">追踪 V3 ↔ V2 接口调用状态</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {latestSummary && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              最新: {latestSummary.success ? '✓' : '✗'} {new Date(latestSummary.createdAt).toLocaleTimeString()}
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? '同步中...' : '🔄 手动同步'}
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{total}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>总调用次数</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>
            {total > 0 ? `${Math.round((total - recentStats.failed) / total * 100)}%` : '—'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>总成功率</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{recentStats.total}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>24h 调用</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--error)' }}>{recentStats.failed}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>24h 失败</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{waybillCount}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>本地快照</div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>状态筛选</label>
            <select className="input" value={filterSuccess}
              onChange={e => { setFilterSuccess(e.target.value); setPage(1); }} style={{ maxWidth: 200 }}>
              <option value="">全部状态</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary" onClick={fetchLogs}>🔍 查询</button>
          </div>
        </div>
      </div>

      {/* 日志表格 */}
      <div className="table-wrapper">
        <div style={{ overflow: 'auto', maxHeight: '55vh' }}>
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>接口</th>
                <th>状态</th>
                <th className="cell-num">耗时</th>
                <th>参数</th>
                <th>错误信息</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td><code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.requestId?.substring(0, 20)}...</code></td>
                  <td>{log.endpoint}</td>
                  <td>
                    {log.success ? <span className="tag tag-success">成功</span> : <span className="tag tag-error">失败</span>}
                  </td>
                  <td className="cell-num">{log.durationMs ? `${log.durationMs}ms` : '-'}</td>
                  <td style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.params || '-'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--error)', maxWidth: 200, overflow: 'hidden' }}>
                    {log.errorMsg || '-'}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无同步记录，点击"手动同步"触发</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination-bar">
            <span>共 {total} 条，第 {page}/{totalPages} 页</span>
            <div className="pagination-actions">
              <button className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>上一页</button>
              <button className="btn btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>下一页</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
