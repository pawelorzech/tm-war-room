'use client';

import { useState, useEffect } from 'react';

interface Template {
  id: number;
  name: string;
  title_template: string;
  body_template: string;
  url_template: string | null;
  variables: string; // JSON array
}

interface SendNotificationProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function SendNotification({ adminFetch }: SendNotificationProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [targetType, setTargetType] = useState<string>('all');
  const [targetValue, setTargetValue] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [members, setMembers] = useState<{ player_id: number; name: string }[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);

  useEffect(() => {
    adminFetch<{ templates: Template[] }>('/api/admin/push/templates').then(d => setTemplates(d.templates)).catch(() => {});
    adminFetch<{ groups: { id: number; name: string }[] }>('/api/admin/push/groups').then(d => setGroups(d.groups)).catch(() => {});
    adminFetch<{ keys: { player_id: number; player_name: string }[] }>('/api/admin/keys').then(d => setMembers(d.keys.map(k => ({ player_id: k.player_id, name: k.player_name })))).catch(() => {});
  }, [adminFetch]);

  useEffect(() => {
    const handleClick = () => setShowPlayerDropdown(false);
    if (showPlayerDropdown) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showPlayerDropdown]);

  const handleTemplateChange = (id: string) => {
    const tid = id === '' ? null : Number(id);
    setSelectedTemplate(tid);
    if (tid) {
      const tmpl = templates.find(t => t.id === tid);
      if (tmpl) {
        setTitle(tmpl.title_template);
        setBody(tmpl.body_template);
        setUrl(tmpl.url_template || '');
        const vars = JSON.parse(tmpl.variables) as string[];
        setVariables(Object.fromEntries(vars.map(v => [v, variables[v] || ''])));
      }
    }
  };

  const resolvePreview = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const resp = await adminFetch<{ event_id: number }>('/api/admin/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate,
          title, body, url: url || undefined,
          target_type: targetType,
          target_value: targetValue || undefined,
          variables,
        }),
      });
      setResult(`Sent! Event #${resp.event_id}`);
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    setSending(true);
    setResult(null);
    try {
      await adminFetch('/api/admin/push/test', { method: 'POST' });
      setResult('Test notification sent to you!');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const detectedVars = [...new Set([...(title + body + url).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Send Notification</h3>

      {/* Template selector */}
      <div>
        <label className="text-xs text-text-muted block mb-1">Template</label>
        <select value={selectedTemplate ?? ''} onChange={e => handleTemplateChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">Custom (no template)</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Title & Body */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs text-text-muted block mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
            placeholder="Notification title..." />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary resize-none"
            placeholder="Notification body..." />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">URL (optional)</label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
            placeholder="/wars, /chain, or https://www.torn.com/..." />
        </div>
      </div>

      {/* Variables */}
      {detectedVars.length > 0 && (
        <div className="bg-bg-elevated rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-text-muted font-medium">Variables</p>
          {detectedVars.map(v => (
            <div key={v} className="flex items-center gap-2">
              <span className="text-xs text-text-secondary font-mono w-32">{`{{${v}}}`}</span>
              <input value={variables[v] || ''} onChange={e => setVariables(prev => ({ ...prev, [v]: e.target.value }))}
                className="flex-1 px-2 py-1 text-xs bg-bg-card border border-border rounded text-text-primary"
                placeholder={`Value for ${v}`} />
            </div>
          ))}
        </div>
      )}

      {/* Target */}
      <div>
        <label className="text-xs text-text-muted block mb-1">Send to</label>
        <div className="space-y-2">
          {[
            { value: 'all', label: 'All subscribers' },
            { value: 'player', label: 'Specific player' },
            { value: 'role', label: 'By role' },
            { value: 'group', label: 'By group' },
            { value: 'preference', label: 'By preference' },
          ].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="target" value={value} checked={targetType === value}
                onChange={e => { setTargetType(e.target.value); setTargetValue(''); setPlayerSearch(''); setShowPlayerDropdown(false); }}
                className="text-torn-green focus:ring-torn-green/50" />
              <span className="text-sm text-text-primary">{label}</span>
            </label>
          ))}
        </div>

        {targetType === 'player' && (
          <div className="mt-2 relative">
            <input
              value={playerSearch}
              onChange={e => {
                setPlayerSearch(e.target.value);
                setShowPlayerDropdown(true);
                // If it's a pure number, set as target directly
                if (/^\d+$/.test(e.target.value.trim())) {
                  setTargetValue(e.target.value.trim());
                }
              }}
              onFocus={() => setShowPlayerDropdown(true)}
              className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
              placeholder="Search by name or enter Player ID..."
            />
            {targetValue && (
              <div className="text-[10px] text-torn-green mt-1">
                Selected: {members.find(m => String(m.player_id) === targetValue)?.name || 'Player'} [{targetValue}]
              </div>
            )}
            {showPlayerDropdown && playerSearch && (
              <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-bg-surface border border-border rounded-lg shadow-lg">
                {members
                  .filter(m => {
                    const q = playerSearch.toLowerCase();
                    return m.name.toLowerCase().includes(q) || String(m.player_id).startsWith(q);
                  })
                  .slice(0, 20)
                  .map(m => (
                    <button
                      key={m.player_id}
                      type="button"
                      onClick={() => {
                        setTargetValue(String(m.player_id));
                        setPlayerSearch(m.name);
                        setShowPlayerDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-bg-elevated text-text-primary flex justify-between"
                    >
                      <span>{m.name}</span>
                      <span className="text-text-muted text-xs">[{m.player_id}]</span>
                    </button>
                  ))}
                {members.filter(m => {
                  const q = playerSearch.toLowerCase();
                  return m.name.toLowerCase().includes(q) || String(m.player_id).startsWith(q);
                }).length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-muted">No members found. Type a raw ID to send to anyone.</div>
                )}
              </div>
            )}
          </div>
        )}
        {targetType === 'role' && (
          <select value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
            <option value="">Select role...</option>
            <option value="admin">Admins</option>
            <option value="member">All members</option>
          </select>
        )}
        {targetType === 'group' && (
          <select value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
            <option value="">Select group...</option>
            {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
        )}
        {targetType === 'preference' && (
          <select value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
            <option value="">Select preference...</option>
            <option value="loot_level4">Loot Level 4+</option>
            <option value="war_start">War Started</option>
            <option value="stakeout_change">Stakeout Alert</option>
          </select>
        )}
      </div>

      {/* Preview */}
      {(title || body) && (
        <div className="bg-bg-elevated rounded-lg border border-border p-3">
          <p className="text-[10px] text-text-muted uppercase mb-2">Preview</p>
          <p className="text-sm font-medium text-text-primary">{resolvePreview(title)}</p>
          <p className="text-xs text-text-secondary mt-1">{resolvePreview(body)}</p>
          {url && <p className="text-[10px] text-torn-blue mt-1">{resolvePreview(url)}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors disabled:opacity-50">
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
        <button onClick={handleTestSend} disabled={sending}
          className="px-4 py-2 text-sm rounded-lg text-text-secondary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors disabled:opacity-50">
          Send Test to Me
        </button>
      </div>

      {result && (
        <p className={`text-xs ${result.startsWith('Error') ? 'text-torn-red' : 'text-torn-green'}`}>{result}</p>
      )}
    </div>
  );
}
