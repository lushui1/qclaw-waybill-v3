'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_approval:       { label: '待审批',    color: 'tag-warning' },
  level1_approving:       { label: '一级审批中', color: 'tag-info' },
  level2_approving:       { label: '二级审批中', color: 'tag-info' },
  executing:              { label: '执行中',     color: 'tag-info' },
  completed:              { label: '已完成',     color: 'tag-success' },
  rejected:               { label: '已拒绝',     color: 'tag-error' },
  resubmitted:            { label: '重新提交',   color: 'tag-warning' },
  timeout_auto_rejected:  { label: '超时驳回',   color: 'tag-error' },
  fast_released:          { label: '快速放行',   color: 'tag-success' },
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

  const handleDelete = async (id: string) => {
    // 软删除不可行，这里只做展示
  };

  return (
    <div style={{ minHeight: '100vh', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>📋 异常工单</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>共 {total} 条</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/" className="btn-outline">← 首页</Link>
          </div>
        </div>

        {/* 筛选 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <select className="input" value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }} style={{ maxWidth: 150 }}>
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input" value={filters.anomalyType} onChange={e => { setFilters(f => ({ ...f, anomalyType: e.target.value })); setPage(1); }} style={{ maxWidth: 150 }}>
              <option value="">全部类型</option>
              {Object.entries(ANOMALY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input" value={filters.source} onChange={e => { setFilters(f => ({ ...f, source: e.target.value })); setPage(1); }} style={{ maxWidth: 150 }}>
              <option value="">全部来源</option>
              <option value="manual_report">手工上报</option>
              <option value="scan_auto">扫描触发</option>
            </select>
            <input className="input" placeholder="搜索工单号/上报人..." value={filters.keyword} onChange={e => { setFilters(f => ({ ...f, keyword: e.target.value })); setPage(1); }} style={{ maxWidth: 250 }} />
          </div>
        </div>

        {/* 列表 */}
        <div className="table-container" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>工单号</th>
                <th>类型</th>
                <th>来源</th>
                <th>状态</th>
                <th>运单</th>
                <th>金额</th>
                <th>上报人</th>
                <th>上报时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t: any) => {
                const st = STATUS_LABELS[t.status] || { label: t.status, color: '' };
                return (
                  <tr key={t.id}>
                    <td><code style={{ fontSize: 12 }}>{t.ticketNo}</code></td>
                    <td style={{ fontSize: 13 }}>{ANOMALY_LABELS[t.anomalyType] || t.anomalyType}</td>
                    <td style={{ fontSize: 13 }}>{t.source === 'scan_auto' ? '📷 扫描' : '✋ 手工'}</td>
                    <td><span className={`tag ${st.color}`}>{st.label}</span></td>
                    <td style={{ fontSize: 13 }}>{t.waybill?.externalCode || '-'}</td>
                    <td style={{ fontSize: 13 }}>{t.estimatedAmount ? `¥${(t.estimatedAmount / 100).toFixed(2)}` : '-'}</td>
                    <td style={{ fontSize: 13 }}>{t.reporterName || '-'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>
                      <Link href={`/tickets/${t.id}`} className="btn-outline btn-sm" style={{ textDecoration: 'none' }}>
                        详情
                      </Link>
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

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <button className="btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>上一页</button>
            <span style={{ lineHeight: '32px', fontSize: 13, color: 'var(--text-muted)' }}>第 {page}/{totalPages} 页</span>
            <button className="btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
