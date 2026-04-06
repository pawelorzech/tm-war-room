'use client';

import { useState, useEffect } from 'react';

interface Group {
  id: number;
  name: string;
  description: string | null;
  member_count: number;
}

interface GroupManagerProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function GroupManager({ adminFetch }: GroupManagerProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', memberIds: '' });

  const load = () => {
    adminFetch<{ groups: Group[] }>('/api/admin/push/groups').then(d => setGroups(d.groups)).catch(() => {});
  };

  useEffect(() => { load(); }, [adminFetch]);

  const handleCreate = async () => {
    const ids = form.memberIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    await adminFetch('/api/admin/push/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, description: form.description || null, member_ids: ids }),
    });
    setCreating(false);
    setForm({ name: '', description: '', memberIds: '' });
    load();
  };

  const handleDelete = async (id: number) => {
    await adminFetch(`/api/admin/push/groups/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Custom Groups</h3>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
            + New Group
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-bg-elevated rounded-lg border border-border p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Group name" />
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Description (optional)" />
          <input value={form.memberIds} onChange={e => setForm(p => ({ ...p, memberIds: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary"
            placeholder="Player IDs (comma-separated, e.g. 123, 456, 789)" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium disabled:opacity-50">Create</button>
            <button onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-xs rounded-lg text-text-secondary border border-text-secondary/20">Cancel</button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-text-muted">No groups yet. Create one to target specific players.</p>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="bg-bg-elevated rounded-lg border border-border p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{g.name}</p>
                {g.description && <p className="text-xs text-text-muted mt-0.5">{g.description}</p>}
                <p className="text-[10px] text-text-muted mt-0.5">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => handleDelete(g.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
