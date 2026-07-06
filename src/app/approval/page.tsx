'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STATUS_LABELS: Record<string, string> = {
  pending_approval: '待审批', level1_approving: '一级审批中', level2_approving: '二级审批中',
  executing: '执行中', completed: '已完成', rejected: '已拒绝',
  resubmitted: '重新提交', timeout_auto_rejected: '超时驳回', fast_released: '快速放行',
};

const ANOMALY_LABELS: Record<string, string> = {
  lost: '丢件', damaged: '破损', rejected: '客户拒收', timeout: '超时未签收', wrong_address: '地址错误',
  qty_mismatch: '数量不符', appearance_damage: '外观破损', spec_error: '规格不符',
  label_error: '标签错误', batch_error: '批次异常',
};

export default function ApprovalPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      if (users.length > 0) setCurrentUser(users[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchPending = () => {
    if (!currentUser) return;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      approverId: currentUser.id,
      approverRole: currentUser.role,
    });

    fetch(`/api/approval?${params}`).then(r => r.json()).then(data => {
      setTickets(data.tickets || []);
      setTotal(data.total || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, [page, currentUser]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ minHeight: '100vh', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>✅ 我的审批</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
              {currentUser ? `${currentUser.name} · ${currentUser.role}` : '请先配置用户'} · 待处理 {total} 条
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <select className="input" style={{ maxWidth: 200 }} value={currentUser?.id || ''} onChange={e => {
              const user = tickets.find((t: any) => t.id === e.target.value);
              // 简化处理，用户切换通过刷新页面实现
            }}>
              <option value="">选择用户（测试用）</option>
              {/* 用户选择会在 seed 后生效 */}
            </select>
            <Link href="/" className="btn-outline">← 首页</Link>
          </div>
        </div>

        {/* 待审批列表 */}
        <div className="table-container" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>工单号</th>
                <th>类型</th>
                <th>来源</th>
                <th>当前状态</th>
                <th>层级</th>
                <th>金额</th>
                <th>上报人</th>
                <th>超时时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t: any) => (
                <tr key={t.id} style={t.isUrgent ? { background: 'var(--warning-bg)' } : {}}>
                  <td><code style={{ fontSize: 12 }}>{t.ticketNo}</code></td>
                  <td style={{ fontSize: 13 }}>{ANOMALY_LABELS[t.anomalyType] || t.anomalyType}</td>
                  <td style={{ fontSize: 13 }}>{t.source === 'scan_auto' ? '📷 扫描' : '✋ 手工'}</td>
                  <td style={{ fontSize: 13 }}>{STATUS_LABELS[t.status] || t.status}</td>
                  <td style={{ fontSize: 13 }}>第{t.currentLevel}级</td>
                  <td style={{ fontSize: 13 }}>{t.estimatedAmount ? `¥${(t.estimatedAmount / 100).toFixed(2)}` : '-'}</td>
                  <td style={{ fontSize: 13 }}>{t.reporterName || '-'}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t.isUrgent ? (
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>
                        ⚠️ {t.timeLeft}h
                      </span>
                    ) : t.timeLeft !== null ? (
                      <span style={{ color: 'var(--text-muted)' }}>{t.timeLeft}h</span>
                    ) : '-'}
                  </td>
                  <td>
                    <Link href={`/tickets/${t.id}`} className="btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                      处理
                    </Link>
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && !loading && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无待审批工单</td></tr>
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
