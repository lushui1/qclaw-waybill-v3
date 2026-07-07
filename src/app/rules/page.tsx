'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

const SEVERITY_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高', critical: '严重' };
const SUBTYPE_LABELS: Record<string, string> = {
  qty_mismatch: '数量不符', appearance_damage: '外观破损',
  spec_error: '规格不符', label_error: '标签错误', batch_error: '批次异常',
};

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', anomalySubtype: 'qty_mismatch', severity: 'medium',
    field: 'qty_diff', operator: '>', threshold: '0.1',
    autoLevel: '1', enabled: true, description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRules(); }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      setRules(Array.isArray(data) ? data : data.rules || []);
    } catch {
      setRules([]);
    }
  };

  const openNew = () => {
    setEditingRule(null);
    setShowForm(true);
    setForm({ name: '', anomalySubtype: 'qty_mismatch', severity: 'medium', field: 'qty_diff', operator: '>', threshold: '0.1', autoLevel: '1', enabled: true, description: '' });
  };

  const openEdit = (rule: any) => {
    setEditingRule(rule);
    setShowForm(true);
    const cond = JSON.parse(rule.condition || '{}');
    setForm({
      name: rule.name, anomalySubtype: rule.anomalySubtype, severity: rule.severity,
      field: cond.field || 'qty_diff', operator: cond.operator || '>',
      threshold: String(cond.threshold || ''), autoLevel: String(rule.autoLevel),
      enabled: rule.enabled, description: rule.description || '',
    });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingRule(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const condition = JSON.stringify({
        field: form.field,
        operator: form.operator,
        threshold: ['>', '<', '>=', '<=', '==', '!='].includes(form.operator) ? parseFloat(form.threshold) : form.threshold,
      });
      const res = await fetch('/api/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRule?.id, name: form.name, anomalySubtype: form.anomalySubtype,
          condition, severity: form.severity, autoLevel: parseInt(form.autoLevel),
          enabled: form.enabled, description: form.description,
        }),
      });
      if (res.ok) { setEditingRule(null); setShowForm(false); fetchRules(); }
      else { const data = await res.json(); toast(data.error || '保存失败'); }
    } catch (err: any) { toast(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此规则？')) return;
    try {
      const res = await fetch(`/api/rules?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchRules();
      else { const d = await res.json(); toast(d.error || '删除失败'); }
    } catch (err: any) { toast(err.message); }
  };

  const handleToggle = async (rule: any) => {
    await fetch('/api/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: rule.id, name: rule.name, anomalySubtype: rule.anomalySubtype,
        condition: rule.condition, severity: rule.severity, autoLevel: rule.autoLevel,
        enabled: !rule.enabled, description: rule.description,
      }),
    });
    fetchRules();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ 品控规则管理</div>
          <div className="page-subtitle">可配置规则引擎 · 不硬编码 · 共 {rules.length} 条规则</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ 新建规则</button>
      </div>

      {/* 规则列表 */}
      <div className="table-wrapper" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>规则名称</th>
              <th>异常子类型</th>
              <th>触发条件</th>
              <th>严重度</th>
              <th>审批层级</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => {
              const sevCls = rule.severity === 'high' || rule.severity === 'critical' ? 'tag-error' : rule.severity === 'medium' ? 'tag-warning' : 'tag-info';
              return (
                <tr key={rule.id}>
                  <td style={{ fontWeight: 500 }}>{rule.name}</td>
                  <td>{SUBTYPE_LABELS[rule.anomalySubtype] || rule.anomalySubtype}</td>
                  <td style={{ fontSize: 12, maxWidth: 200 }}><code>{rule.condition}</code></td>
                  <td><span className={`tag ${sevCls}`}>{SEVERITY_LABELS[rule.severity] || rule.severity}</span></td>
                  <td>第{rule.autoLevel}级</td>
                  <td>
                    <button className={`${rule.enabled ? 'tag tag-success' : 'tag tag-error'}`}
                      onClick={() => handleToggle(rule)} style={{ cursor: 'pointer', border: 'none' }}>
                      {rule.enabled ? '启用' : '禁用'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => openEdit(rule)}>编辑</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rule.id)}>删除</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rules.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无规则，点击"新建规则"添加</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 编辑表单 */}
      {showForm && (
        <div className="card">
          <div className="card-title">{editingRule ? `编辑规则: ${editingRule.name}` : '新建品控规则'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="filter-group">
              <label>规则名称</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：数量差异检测" />
            </div>
            <div className="filter-group">
              <label>异常子类型</label>
              <select className="input" value={form.anomalySubtype} onChange={e => setForm(f => ({ ...f, anomalySubtype: e.target.value }))}>
                {Object.entries(SUBTYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>触发条件</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} style={{ maxWidth: 100 }}>
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                  <option value="==">==</option>
                  <option value="contains">包含</option>
                </select>
                <input className="input" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} placeholder="阈值" />
              </div>
            </div>
            <div className="filter-group">
              <label>严重度</label>
              <select className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="critical">严重</option>
              </select>
            </div>
            <div className="filter-group">
              <label>进入审批层级</label>
              <select className="input" value={form.autoLevel} onChange={e => setForm(f => ({ ...f, autoLevel: e.target.value }))}>
                <option value="1">一级审批</option>
                <option value="2">二级审批</option>
              </select>
            </div>
            <div className="filter-group">
              <label>状态</label>
              <select className="input" value={form.enabled ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, enabled: e.target.value === 'yes' }))}>
                <option value="yes">启用</option>
                <option value="no">禁用</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="filter-group">
                <label>描述</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="规则说明" />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? '保存中...' : '保存规则'}
            </button>
            <button className="btn" onClick={() => { cancelForm; }}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
