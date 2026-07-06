'use client';

import { useState, useEffect } from 'react';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending_approval:       { label: '待审批',    cls: 'tag-warning' },
  level1_approving:       { label: '一级审批中', cls: 'tag-info' },
  level2_approving:       { label: '二级审批中', cls: 'tag-info' },
  executing:              { label: '执行中',     cls: 'tag-info' },
  completed:              { label: '已完成',     cls: 'tag-success' },
  rejected:               { label: '已拒绝',     cls: 'tag-error' },
  resubmitted:            { label: '重新提交',   cls: 'tag-warning' },
  timeout_auto_rejected:  { label: '超时驳回',   cls: 'tag-error' },
  fast_released:          { label: '快速放行',   cls: 'tag-success' },
};

const ANOMALY_LABELS: Record<string, string> = {
  lost: '丢件', damaged: '破损', rejected: '客户拒收',
  timeout: '超时未签收', wrong_address: '地址错误',
  qty_mismatch: '数量不符', appearance_damage: '外观破损',
  spec_error: '规格不符', label_error: '标签错误', batch_error: '批次异常',
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', anomalyType: '', source: '', keyword: '' });
  const [loading, setLoading] = useState(false);

  const fetchTickets = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (filters.status) params.set('status', filters.status);
    if (filters.anomalyType) params.set('anomalyType', filters.anomalyType);
    if (filters.source) params.set('source', filters.source);
    if (filters.keyword) params.set('keyword', filters.keyword);

    fetch(`/api/tickets?${params}`).then(r => r.json()).then(data => {
      setTickets(data.tickets || []);
      setTotal(data.total || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(); }, [page, filters]);

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📋 异常工单</div>
          <div className="page-subtitle">共 {total} 条记录</div>
        </div>
      </div>

      {/* 筛选条件 */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label>状态</label>
            <select className="input" value={filters.status}
              onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}>
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>异常类型</label>
            <select className="input" value={filters.anomalyType}
              onChange={e => { setFilters(f => ({ ...f, anomalyType: e.target.value })); setPage(1); }}>
              <option value="">全部类型</option>
              {Object.entries(ANOMALY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>来源</label>
            <select className="input" value={filters.source}
              onChange={e => { setFilters(f => ({ ...f, source: e.target.value })); setPage(1); }}>
              <option value="">全部来源</option>
              <option value="manual_report">手工上报</option>
              <option value="scan_auto">扫描触发</option>
            </select>
          </div>
          <div className="filter-group" style={{ minWidth: 220 }}>
            <label>搜索</label>
            <input className="input" placeholder="工单号/上报人/描述" value={filters.keyword}
              onChange={e => { setFilters(f => ({ ...f, keyword: e.target.value })); setPage(1); }} />
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary" onClick={fetchTickets}>🔍 查询</button>
            <button className="btn" onClick={() => { setFilters({ status: '', anomalyType: '', source: '', keyword: '' }); setPage(1); }}>
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="table-wrapper">
        <div style={{ overflow: 'auto', maxHeight: '65vh' }}>
          <table>
            <thead>
              <tr>
                <th>工单号</th>
                <th>类型</th>
                <th>来源</th>
                <th>状态</th>
                <th>运单号</th>
                <th className="cell-num">金额</th>
                <th>上报人</th>
                <th>上报时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const st = STATUS_LABELS[t.status] || { label: t.status, cls: '' };
                return (
                  <tr key={t.id}>
                    <td><code style={{ fontSize: 12 }}>{t.ticketNo}</code></td>
                    <td>{ANOMALY_LABELS[t.anomalyType] || t.anomalyType}</td>
                    <td>{t.source === 'scan_auto' ? '📷 扫描' : '✋ 手工'}</td>
                    <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                    <td style={{ fontSize: 12 }}>{t.waybill?.externalCode || '-'}</td>
                    <td className="cell-num">{t.estimatedAmount ? `¥${(t.estimatedAmount / 100).toFixed(2)}` : '-'}</td>
                    <td>{t.reporterName || '-'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>
                      <a href={`/tickets/${t.id}`} className="btn btn-sm">详情</a>
                    </td>
                  </tr>
                );
              })}
              {tickets.length === 0 && !loading && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无工单</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
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
