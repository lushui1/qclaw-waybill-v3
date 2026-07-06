'use client';

import { useState, useEffect } from 'react';

export default function HomePage() {
  const [stats, setStats] = useState([
    { label: '待审批工单', value: '—', cls: '' },
    { label: '品控暂扣中', value: '—', cls: 'negative' },
    { label: '今日上报',   value: '—', cls: '' },
    { label: '本月赔付',   value: '—', cls: '' },
  ]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [pendingRes, lockedRes, todayRes, payRes] = await Promise.all([
          fetch('/api/tickets?pageSize=1&status=pending_approval').then(r => r.json()),
          fetch('/api/scan?pageSize=1').then(r => r.json()),
          fetch('/api/tickets?pageSize=1').then(r => r.json()),
          fetch('/api/payments?pageSize=1').then(r => r.json()),
        ]);
        setStats([
          { label: '待审批工单', value: String(pendingRes.total ?? '—'), cls: '' },
          { label: '品控暂扣中', value: String(lockedRes.total ?? '—'), cls: 'negative' },
          { label: '今日上报',   value: String(todayRes.total ?? '—'), cls: '' },
          { label: '本月赔付',   value: `¥${payRes.total ?? '—'}`, cls: '' },
        ]);
      } catch {}
    };
    loadStats();
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">首页仪表盘</div>
          <div className="page-subtitle">运单全流程管理系统 · 关键指标概览</div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="stats-bar" style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: 16 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.cls === 'negative' ? 'var(--error)' : 'var(--primary)', marginBottom: 4 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 快捷入口 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { href: '/scan', icon: '📷', label: '扫描品控', desc: '扫描录入 → 规则检测 → 批次锁定' },
          { href: '/tickets', icon: '📋', label: '异常工单', desc: '工单列表 · 筛选 · 详情 · 审批' },
          { href: '/approval', icon: '✅', label: '我的审批', desc: '待处理工单 · 通过/拒绝 · 分级审批' },
          { href: '/rules', icon: '⚙️', label: '品控规则', desc: '可配置规则引擎 · 触发阈值管理' },
          { href: '/sync', icon: '🔄', label: '接口同步', desc: 'V2 同步状态 · 调用日志 · Request ID 追踪' },
        ].map((m, i) => (
          <a key={i} href={m.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ cursor: 'pointer', transition: 'all 0.15s', height: '100%' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
