import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "运单全流程管理系统 V3",
  description: "扫描品控 → 异常上报 → 分级审批 → 执行联动",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

// ──────────────────────────────────────────
// 应用外壳组件（服务端组件）
// ──────────────────────────────────────────
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      {/* ── 侧边栏 ── */}
      <Sidebar />

      {/* ── 主内容 ── */}
      <div className="main-area">
        <TopHeader />
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// 侧边栏导航
// ──────────────────────────────────────────
function Sidebar() {
  const menuItems = [
    { href: '/',              icon: '🏠', label: '首页' },
    { href: '/scan',          icon: '📷', label: '扫描品控' },
    { href: '/tickets',       icon: '📋', label: '异常工单' },
    { href: '/approval',      icon: '✅', label: '我的审批' },
    { href: '/rules',         icon: '⚙️', label: '品控规则' },
    { href: '/sync',          icon: '🔄', label: '接口同步' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">📦</div>
        <div>
          <div className="logo-text">运单管理 V3</div>
          <div className="logo-sub">Waybill Control</div>
        </div>
      </div>
      <nav className="sidebar-menu">
        {menuItems.map(item => (
          <SidebarLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
      </nav>
    </aside>
  );
}

// ──────────────────────────────────────────
// 侧边栏链接（客户端组件，含 active 高亮）
// ──────────────────────────────────────────
function SidebarLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  // 使用 pathname 判断当前页面，实现 active 高亮
  return (
    <a
      href={href}
      className="sidebar-menu-item"
      data-active={typeof window !== 'undefined' && window.location.pathname === href ? 'true' : undefined}
    >
      <span className="menu-icon">{icon}</span>
      <span>{label}</span>
    </a>
  );
}

// ──────────────────────────────────────────
// 顶部导航栏（服务器组件）
// ──────────────────────────────────────────
function TopHeader() {
  return (
    <header className="top-header">
      <div className="top-header-left" />
      <div className="top-header-right">
        <a href="/tickets" className="header-action-btn">
          📋 待办
          <span className="badge">3</span>
        </a>
        <a href="/sync" className="header-action-btn">
          🔔 消息
          <span className="badge">99+</span>
        </a>
        <a href="/sync" className="header-action-btn">
          📥 导出
        </a>
        <div style={{ color: 'var(--border)', fontSize: 16, margin: '0 4px' }}>|</div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 8px' }}>
          👤 管理员
        </span>
      </div>
    </header>
  );
}
