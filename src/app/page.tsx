'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface StatCard {
  label: string;
  value: string;
  color: string;
}

const MODULES = [
  { href: '/scan',      label: '📷 扫描品控',     desc: '扫描录入 → 规则检测 → 批次锁定' },
  { href: '/tickets',   label: '📋 异常工单',     desc: '工单列表 · 筛选 · 详情 · 审批' },
  { href: '/approval',  label: '✅ 我的审批',     desc: '待处理工单 · 通过/拒绝 · 分级审批' },
  { href: '/rules',     label: '⚙️ 品控规则',     desc: '可配置规则引擎 · 触发阈值管理' },
  { href: '/sync',      label: '🔄 接口同步监控', desc: 'V2 同步状态 · 调用日志 · Request ID 追踪' },
];

export default function HomePage() {
  const [stats, setStats] = useState<StatCard[]>([
    { label: '待审批工单', value: '—', color: 'var(--warning)' },
    { label: '品控暂扣中', value: '—', color: 'var(--error)' },
    { label: '今日上报',   value: '—', color: 'var(--primary)' },
    { label: '本月赔付',   value: '—', color: 'var(--text-muted)' },
  ]);

  useEffect(() => {
    fetch('/api/tickets?status=pending_approval')
      .then(r => r.json())
      .then(d => {
        if (d.total !== undefined) {
          setStats(prev => prev.map((s, i) =>
            i === 0 ? { ...s, value: String(d.total) } : s
          ));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
            运单全流程管理系统 V3
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            扫描品控 → 异常上报 → 分级审批 → 执行联动
          </p>
        </div>

        {/* 统计卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {stats.map((s, i) => (
            <div key={i} className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* 模块入口 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {MODULES.map((m, i) => (
            <Link key={i} href={m.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                className="card"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  height: '100%',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
              >
                <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{m.label}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* 底部导航 */}
        <div style={{ textAlign: 'center', marginTop: 40, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>数据来源：V2 接口实时同步</span>
          <span style={{ margin: '0 12px' }}>·</span>
          <a href="/sync" style={{ color: 'var(--primary)' }}>同步状态</a>
        </div>
      </div>
    </div>
  );
}
