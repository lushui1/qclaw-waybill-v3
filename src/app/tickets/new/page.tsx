'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { classifyAnomaly, getTopSuggestion } from '@/lib/ai-classifier';
import { toast } from 'sonner';

const ANOMALY_TYPES = [
  { value: 'lost', label: '丢件', category: 'logistics' },
  { value: 'damaged', label: '破损', category: 'logistics' },
  { value: 'rejected', label: '客户拒收', category: 'logistics' },
  { value: 'timeout', label: '超时未签收', category: 'logistics' },
  { value: 'wrong_address', label: '地址错误', category: 'logistics' },
  { value: 'qty_mismatch', label: '数量不符', category: 'qc' },
  { value: 'appearance_damage', label: '外观破损', category: 'qc' },
  { value: 'spec_error', label: '规格不符', category: 'qc' },
  { value: 'label_error', label: '标签错误', category: 'qc' },
  { value: 'batch_error', label: '批次异常', category: 'qc' },
];

export default function NewTicketPage() {
  const [waybillCode, setWaybillCode] = useState('');
  const [description, setDescription] = useState('');
  const [anomalyType, setAnomalyType] = useState('lost');
  const [severity, setSeverity] = useState('medium');
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [waybillVerified, setWaybillVerified] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(users => {
      setAllUsers(users);
      const saved = localStorage.getItem('currentUser');
      const found = saved ? users.find((u: any) => u.id === saved) : null;
      setCurrentUser(found || users[0]);
    }).catch(() => {});
  }, []);

  const handleAiClassify = async () => {
    if (!description.trim()) toast.error('请先填写异常描述');
    setAiLoading(true);
    try {
      const suggestion = await getTopSuggestion(description);
      if (suggestion) {
        setAiResult(suggestion);
        setAnomalyType(suggestion.type);
        setSeverity(suggestion.severity);
      } else {
        setAiResult({ type: '', typeLabel: '未识别', severity: 'medium', confidence: 0 });
      }
    } catch {
      setAiResult(null);
    }
    setAiLoading(false);
  };

  const handleVerifyWaybill = async () => {
    if (!waybillCode.trim()) return;
    try {
      const res = await fetch(`/api/waybills?keyword=${encodeURIComponent(waybillCode)}&pageSize=1`);
      const data = await res.json();
      if (data.waybills && data.waybills.length > 0) {
        setWaybillVerified(true);
      } else {
        toast('未找到该运单，请先同步数据');
        setWaybillVerified(false);
      }
    } catch {
      toast('校验失败');
    }
  };

  const handleSubmit = async () => {
    if (!waybillCode.trim() || !description.trim()) { toast.error('请填写运单号和异常描述'); return; }
    if (!currentUser) { toast.error('请先选择用户'); return; }

    setSubmitting(true);
    try {
      // 先查 waybill
      const wbRes = await fetch(`/api/waybills?keyword=${encodeURIComponent(waybillCode)}&pageSize=1`);
      const wbData = await wbRes.json();
      const waybill = wbData.waybills?.[0];
      if (!waybill) { toast.error('运单不存在，请先同步数据'); setSubmitting(false); return; }

      // 创建工单
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waybillId: waybill.id,
          anomalyType,
          description,
          amount: 0,
          reporterId: currentUser.id,
          reporterName: currentUser.name,
          severity,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/tickets/${data.id}`);
    } catch (err: any) {
      toast(err.message);
    }
    setSubmitting(false);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">异常上报</div>
          <div className="page-subtitle">手工上报物流/品控异常</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        {/* 用户切换 */}
        <div className="filter-group" style={{ marginBottom: 16 }}>
          <label>上报人</label>
          <select className="input" value={currentUser?.id || ''}
            onChange={e => {
              const u = allUsers.find(x => x.id === e.target.value);
              if (u) { setCurrentUser(u); localStorage.setItem('currentUser', u.id); }
            }}>
            {allUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>

        {/* 运单号 */}
        <div className="filter-group" style={{ marginBottom: 16 }}>
          <label>运单号 *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="V2 运单号，如 PS2605290250"
              value={waybillCode} onChange={e => { setWaybillCode(e.target.value); setWaybillVerified(false); }}
              onBlur={handleVerifyWaybill} />
            {waybillVerified && <span style={{ color: 'var(--success)', lineHeight: '36px' }}>✓</span>}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>将通过 V2 接口实时校验运单真实性</p>
        </div>

        {/* 异常描述 */}
        <div className="filter-group" style={{ marginBottom: 16 }}>
          <label>异常描述 *</label>
          <textarea className="input" placeholder="请描述异常情况，输入后可使用 AI 辅助分类"
            value={description} onChange={e => setDescription(e.target.value)}
            rows={4} style={{ minHeight: 100, resize: 'vertical' }} />
        </div>

        {/* AI 辅助分类 */}
        <div style={{ marginBottom: 16 }}>
          <button className="btn" onClick={handleAiClassify} disabled={aiLoading || !description.trim()}
            style={{ borderColor: aiResult ? 'var(--primary)' : undefined }}>
            {aiLoading ? '🤖 AI 分析中...' : aiResult ? '🤖 重新 AI 分析' : '🤖 AI 辅助分类'}
          </button>

          {aiResult && (
            <div style={{
              marginTop: 8, padding: 12, borderRadius: 8,
              background: 'var(--primary-light)', border: '1px solid var(--primary)',
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 500, color: 'var(--primary-dark)' }}>
                🤖 AI 建议 — 需人工确认
              </div>
              <div style={{ marginTop: 4, lineHeight: 1.8 }}>
                推荐类型: <strong>{ANOMALY_TYPES.find(t => t.value === aiResult.type)?.label || aiResult.typeLabel}</strong>
                &nbsp;| 置信度: {aiResult.confidence}%
                &nbsp;| 匹配关键词: "{aiResult.matchedKeyword}"
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                AI 建议仅供参考，最终决策由审批人确认
              </div>
            </div>
          )}
        </div>

        {/* 异常类型（可人工修改） */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="filter-group">
            <label>异常类型 *（可修改）</label>
            <select className="input" value={anomalyType} onChange={e => setAnomalyType(e.target.value)}>
              <optgroup label="物流类">
                {ANOMALY_TYPES.filter(t => t.category === 'logistics').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="品控类">
                {ANOMALY_TYPES.filter(t => t.category === 'qc').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="filter-group">
            <label>严重度</label>
            <select className="input" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="critical">严重</option>
            </select>
          </div>
        </div>

        {/* 提交 */}
        <button className="btn btn-primary" style={{ width: '100%' }}
          onClick={handleSubmit} disabled={submitting || !waybillCode || !description}>
          {submitting ? '提交中...' : '提交上报'}
        </button>
      </div>
    </>
  );
}
