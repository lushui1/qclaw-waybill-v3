'use client';

import { useState, useEffect } from 'react';
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
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      setAllUsers(users);
      const saved = localStorage.getItem('currentUser');
      const found = saved ? users.find((u: any) => u.id === saved) : null;
      setCurrentUser(found || users[0] || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const fetchPending = () => {
    if (!currentUser) return;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), pageSize: '20',
      approverId: currentUser.id, approverRole: currentUser.role,
    });
    fetch(`/api/approval?${params}`).then(r => r.json()).then(data => {
      setTickets(data.tickets || []);
      setTotal(data.total || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, [page, currentUser]);

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">✅ 我的审批</div>
          <div className="page-subtitle">
            {currentUser ? `${currentUser.name} · ${currentUser.role}` : '请先选择角色'} · 待处理 {total} 条
          </div>
        </div>
        <select className="input" value={currentUser?.id || ''}
          onChange={e => {
            const u = allUsers.find(x => x.id === e.target.value);
            if (u) { setCurrentUser(u); localStorage.setItem('currentUser', u.id); }
          }}
          style={{ maxWidth: 200, fontSize: 13 }}>
          <option value="">切换角色</option>
          {allUsers.map((u: any) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
      </div>

      {/* 统计行 */}
      <div className="stats-bar">
        <div className="stats-item">
          <span className="label">待处理</span>
          <span className="value" style={{ color: 'var(--warning)' }}>{total}</span>
        </div>
        <div className="stats-item">
          <span className="label">当前用户</span>
          <span className="value">{currentUser?.name || '-'}</span>
        </div>
        <div className="stats-item">
          <span className="label">角色</span>
          <span className="value">{currentUser?.role || '-'}</span>
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
                <th>当前状态</th>
                <th>层级</th>
                <th className="cell-num">金额</th>
                <th>上报人</th>
                <th>超时</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id} style={t.isUrgent ? { background: 'var(--warning-bg)' } : {}}>
                  <td><code style={{ fontSize: 12 }}>{t.ticketNo}</code></td>
                  <td>{ANOMALY_LABELS[t.anomalyType] || t.anomalyType}</td>
                  <td>{t.source === 'scan_auto' ? '📷 扫描' : '✋ 手工'}</td>
                  <td>{STATUS_LABELS[t.status] || t.status}</td>
                  <td>第{t.currentLevel}级</td>
                  <td className="cell-num">{t.estimatedAmount ? `¥${(t.estimatedAmount / 100).toFixed(2)}` : '-'}</td>
                  <td>{t.reporterName || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {t.isUrgent ? (
                      <span style={{ color: 'var(--error)', fontWeight: 500 }}>⚠️ {t.timeLeft}h</span>
                    ) : t.timeLeft !== null ? (
                      <span style={{ color: 'var(--text-muted)' }}>{t.timeLeft}h</span>
                    ) : '-'}
                  </td>
                  <td>
                    <a href={`/tickets/${t.id}`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                      处理
                    </a>
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
