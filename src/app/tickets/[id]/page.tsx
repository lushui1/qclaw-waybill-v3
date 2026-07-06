'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

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

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [comment, setComment] = useState('');
  const [amount, setAmount] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const fetchTicket = () => {
    fetch(`/api/tickets?searchId=${ticketId}`).then(r => r.json()).then(data => {
      setTicket(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const fetchUser = () => {
    fetch('/api/users').then(r => r.json()).then(users => {
      if (users.length > 0) setCurrentUser(users[0]);
    }).catch(() => {});
  };

  useEffect(() => { fetchTicket(); fetchUser(); }, [ticketId]);

  const handleApprove = async () => {
    if (!currentUser) return alert('请先配置用户');
    setActionLoading('approve');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverId: currentUser.id,
          approverName: currentUser.name,
          approverRole: currentUser.role,
          comment,
          amount: amount || null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchTicket();
      setComment('');
      setAmount('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleReject = async () => {
    if (!currentUser) return alert('请先配置用户');
    setActionLoading('reject');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverId: currentUser.id,
          approverName: currentUser.name,
          approverRole: currentUser.role,
          comment,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchTicket();
      setComment('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleFastRelease = async () => {
    if (!currentUser) return alert('请先配置用户');
    if (!confirm('确认快速放行此工单？此操作将跳过完整审批流程。')) return;
    setActionLoading('fast_release');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/fast-release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverId: currentUser.id,
          approverName: currentUser.name,
          approverRole: currentUser.role,
          comment: comment,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchTicket();
      setComment('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  if (!ticket) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--error)' }}>工单不存在</div>;

  const canApprove = ['pending_approval', 'level1_approving', 'level2_approving'].includes(ticket.status);
  const canFastRelease = ticket.source === 'scan_auto' && canApprove;

  return (
    <div style={{ minHeight: '100vh', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>
              工单详情
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
              {ticket.ticketNo}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-outline" onClick={() => router.push('/tickets')}>← 返回列表</button>
          </div>
        </div>

        {/* 基本信息 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>工单信息</h3>
            <InfoRow label="状态" value={STATUS_LABELS[ticket.status] || ticket.status} />
            <InfoRow label="异常类型" value={ANOMALY_LABELS[ticket.anomalyType] || ticket.anomalyType} />
            <InfoRow label="来源" value={ticket.source === 'scan_auto' ? '📷 扫描自动触发' : '✋ 手工上报'} />
            <InfoRow label="严重度" value={ticket.severity} />
            <InfoRow label="当前层级" value={`第 ${ticket.currentLevel} 级`} />
            <InfoRow label="上报人" value={ticket.reporterName || '-'} />
            <InfoRow label="上报时间" value={new Date(ticket.createdAt).toLocaleString()} />
          </div>
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>运单信息</h3>
            <InfoRow label="外部编码" value={ticket.waybill?.externalCode || '-'} />
            <InfoRow label="收件人" value={ticket.waybill?.receiverName || '-'} />
            <InfoRow label="运单金额" value={ticket.waybill?.totalAmount ? `¥${Number(ticket.waybill.totalAmount).toFixed(2)}` : '-'} />
            <InfoRow label="预估金额" value={ticket.estimatedAmount ? `¥${(ticket.estimatedAmount / 100).toFixed(2)}` : '-'} />
            <InfoRow label="核定金额" value={ticket.actualAmount ? `¥${(ticket.actualAmount / 100).toFixed(2)}` : '-'} />
            <InfoRow label="描述" value={ticket.description || '-'} />
          </div>
        </div>

        {/* 审批操作区 */}
        {canApprove && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>审批操作</h3>
            <div style={{ marginBottom: 12 }}>
              <textarea
                className="input"
                placeholder="审批意见（必填）"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="input"
                type="number"
                placeholder="核定金额（可选，审核通过时填写）"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ maxWidth: 300 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-primary" onClick={handleApprove} disabled={!!actionLoading || !comment}>
                {actionLoading === 'approve' ? '处理中...' : '✅ 通过'}
              </button>
              <button className="btn-danger" onClick={handleReject} disabled={!!actionLoading || !comment}>
                {actionLoading === 'reject' ? '处理中...' : '❌ 拒绝'}
              </button>
              {canFastRelease && currentUser?.role === 'qc_supervisor' && (
                <button className="btn-outline" onClick={handleFastRelease} disabled={!!actionLoading || !comment}>
                  {actionLoading === 'fast_release' ? '处理中...' : '⚡ 快速放行（品控主管）'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 审批历史 */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>审批历史</h3>
          {ticket.approvals?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ticket.approvals.map((a: any) => (
                <div key={a.id} style={{
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  background: a.action === 'fast_release' ? 'var(--primary-light)' : a.action === 'rejected' ? 'var(--error-bg)' : '#fff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>
                      {a.action === 'approved' ? '✅ 通过' : a.action === 'rejected' ? '❌ 拒绝' : a.action === 'fast_release' ? '⚡ 快速放行' : '🔄 转交'}
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                        (第{a.level}级) {a.approverName}
                      </span>
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {a.comment && <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{a.comment}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>暂无审批记录</p>
          )}
        </div>

        {/* 赔付记录 */}
        {ticket.payments?.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>赔付记录</h3>
            <div style={{ fontSize: 13 }}>
              {ticket.payments.map((p: any) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>¥{Number(p.amount).toFixed(2)}</span>
                  <span>{p.direction === 'to_customer' ? '赔付客户' : '向供应商追偿'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
