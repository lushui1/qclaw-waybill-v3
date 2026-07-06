'use client';

import { useState, useEffect } from 'react';

export default function SyncMonitorPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [latestSummary, setLatestSummary] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [filterSuccess, setFilterSuccess] = useState<string>('');

  const fetchLogs = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (filterSuccess) params.set('success', filterSuccess);

    fetch(`/api/sync?${params}`).then(r => r.json()).then(data => {
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setLatestSummary(data.latestSummary);
    }).catch(() => {});
  };

  useEffect(() => { fetchLogs(); }, [page, filterSuccess]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST', body: JSON.stringify({ page: 1 }) });
      const data = await res.json();
      if (data.success) {
        fetchLogs();
      }
    } catch {}
    setSyncing(false);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ minHeight: '100vh', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>🔄 接口同步监控</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
              追踪 V3 ↔ V2 接口调用状态
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {latestSummary && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                最新同步: {latestSummary.success ? '✓' : '✗'} {new Date(latestSummary.createdAt).toLocaleTimeString()}
              </span>
            )}
            <button className="btn-primary" onClick={handleSync} disabled={syncing}>
              {syncing ? '同步中...' : '🔄 手动同步'}
            </button>
            <a href="/" className="btn-outline">← 首页</a>
          </div>
        </div>

        {/* 状态卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="card">
            <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{total}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>总调用次数</p>
          </div>
          <div className="card">
            <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>
              {logs.filter(l => l.success).length}/{logs.length}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>近期成功率</p>
          </div>
          <div className="card">
            <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-muted)' }}>
              {latestSummary ? new Date(latestSummary.createdAt).toLocaleString() : '—'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>最近一次同步</p>
          </div>
        </div>

        {/* 筛选 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <select
              className="input"
              value={filterSuccess}
              onChange={(e) => { setFilterSuccess(e.target.value); setPage(1); }}
              style={{ maxWidth: 200 }}
            >
              <option value="">全部状态</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </select>
            <input
              className="input"
              placeholder="搜索 Request ID..."
              style={{ maxWidth: 300 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // 简单前端过滤
                }
              }}
            />
          </div>
        </div>

        {/* 日志表格 */}
        <div className="table-container" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>接口</th>
                <th>状态</th>
                <th>耗时</th>
                <th>参数</th>
                <th>错误信息</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id}>
                  <td>
                    <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {log.requestId?.substring(0, 20)}...
                    </code>
                  </td>
                  <td style={{ fontSize: 13 }}>{log.endpoint}</td>
                  <td>
                    {log.success ? (
                      <span className="tag tag-success">成功</span>
                    ) : (
                      <span className="tag tag-error">失败</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{log.durationMs ? `${log.durationMs}ms` : '-'}</td>
                  <td style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.params || '-'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--error)', maxWidth: 200, overflow: 'hidden' }}>
                    {log.errorMsg || '-'}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    暂无同步记录，点击"手动同步"触发
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <button className="btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              上一页
            </button>
            <span style={{ lineHeight: '32px', fontSize: 13, color: 'var(--text-muted)' }}>
              第 {page}/{totalPages} 页
            </span>
            <button className="btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
