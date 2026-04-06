'use client';

import { useState, useEffect } from 'react';

interface Template {
  id: number;
  name: string;
  title_template: string;
  body_template: string;
  url_template: string | null;
  variables: string;
  created_at: string;
}

interface TemplateManagerProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function TemplateManager({ adminFetch }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', title_template: '', body_template: '', url_template: '' });

  const load = () => {
    adminFetch<{ templates: Template[] }>('/api/admin/push/templates').then(d => setTemplates(d.templates)).catch(() => {});
  };

  useEffect(() => { load(); }, [adminFetch]);

  const handleSave = async () => {
    if (editing) {
      await adminFetch(`/api/admin/push/templates/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await adminFetch('/api/admin/push/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    setEditing(null);
    setCreating(false);
    setForm({ name: '', title_template: '', body_template: '', url_template: '' });
    load();
  };

  const handleDelete = async (id: number) => {
    await adminFetch(`/api/admin/push/templates/${id}`, { method: 'DELETE' });
    load();
  };

  const startEdit = (t: Template) => {
    setEditing(t);
    setCreating(true);
    setForm({ name: t.name, title_template: t.title_template, body_template: t.body_template, url_template: t.url_template || '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Templates</h3>
        {!creating && (
          <button onClick={() => { setCreating(true); setEditing(null); setForm({ name: '', title_template: '', body_template: '', url_template: '' }); }}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
            + New Template
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-bg-elevated rounded-lg border border-border p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Template name" />
          <input value={form.title_template} onChange={e => setForm(p => ({ ...p, title_template: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Title template (use {{var}})" />
          <textarea value={form.body_template} onChange={e => setForm(p => ({ ...p, body_template: e.target.value }))} rows={2}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary resize-none" placeholder="Body template" />
          <input value={form.url_template} onChange={e => setForm(p => ({ ...p, url_template: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="URL template (optional)" />
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }}
              className="px-3 py-1.5 text-xs rounded-lg text-text-secondary border border-text-secondary/20">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.map(t => (
          <div key={t.id} className="bg-bg-elevated rounded-lg border border-border p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">{t.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{t.title_template}</p>
              {t.variables && t.variables !== '[]' && (
                <p className="text-[10px] text-text-muted mt-0.5">Variables: {JSON.parse(t.variables).join(', ')}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(t)} className="text-xs text-text-secondary hover:text-text-primary">Edit</button>
              <button onClick={() => handleDelete(t.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
