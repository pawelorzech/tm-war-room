'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';

interface Target {
  id: number;
  player_id: number;
  player_name: string | null;
  added_by: number;
  added_by_name: string | null;
  tag: string;
  notes: string;
  difficulty: string;
  created_at: string;
  updated_at: string;
}

interface TargetsData {
  targets: Target[];
  count: number;
  tags: string[];
}

const DIFFICULTIES = ['unknown', 'easy', 'medium', 'hard', 'impossible'] as const;
const DIFF_COLORS: Record<string, string> = {
  easy: 'text-torn-green',
  medium: 'text-torn-yellow',
  hard: 'text-torn-red',
  impossible: 'text-text-muted',
  unknown: 'text-text-muted',
};

function tornProfile(id: number) {
  return `https://www.torn.com/profiles.php?XID=${id}`;
}

function tornAttack(id: number) {
  return `https://www.torn.com/loader.php?sid=attack&user2ID=${id}`;
}

export default function TargetsPage() {
  const [data, setData] = useState<TargetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addId, setAddId] = useState('');
  const [addName, setAddName] = useState('');
  const [addTag, setAddTag] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addDiff, setAddDiff] = useState('unknown');
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTag, setEditTag] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDiff, setEditDiff] = useState('unknown');

  const loadData = () => {
    setLoading(true);
    api.targetsList(activeTag || undefined).then(d => {
      setData(d as TargetsData);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [activeTag]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data.targets;
    const q = search.toLowerCase();
    return data.targets.filter(t =>
      (t.player_name || '').toLowerCase().includes(q) ||
      String(t.player_id).includes(q) ||
      t.tag.toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q)
    );
  }, [data, search]);

  const handleAdd = async () => {
    const pid = parseInt(addId);
    if (!pid) return;
    setSubmitting(true);
    try {
      await api.targetsAdd({
        player_id: pid,
        player_name: addName || undefined,
        tag: addTag,
        notes: addNotes,
        difficulty: addDiff,
      });
      setShowAdd(false);
      setAddId(''); setAddName(''); setAddTag(''); setAddNotes(''); setAddDiff('unknown');
      loadData();
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (pid: number) => {
    await api.targetsRemove(pid);
    loadData();
  };

  const startEdit = (t: Target) => {
    setEditingId(t.player_id);
    setEditTag(t.tag);
    setEditNotes(t.notes);
    setEditDiff(t.difficulty);
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    await api.targetsUpdate(editingId, { tag: editTag, notes: editNotes, difficulty: editDiff });
    setEditingId(null);
    loadData();
  };

  const inputClass = "w-full bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50";

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Target Lists</h1>
            <p className="text-text-secondary text-sm mt-1">
              Save and tag enemy targets for your faction.
              {data && <span className="ml-2 text-text-muted">({data.count} targets)</span>}
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="targets" title="Target Lists — What's here?" bullets={[
          "Add enemy player IDs with tags, notes, and difficulty ratings.",
          "Filter by tag to organize targets (e.g. 'war', 'chain', 'revenge').",
          "Quick attack links directly to Torn attack page.",
          "Shared across all faction members — everyone sees the same list.",
        ]} />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 text-sm rounded-lg bg-torn-green/20 text-torn-green font-semibold hover:bg-torn-green/30 transition-colors">
            + Add Target
          </button>

          {/* Tag filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setActiveTag(null)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${!activeTag ? 'bg-bg-elevated text-text-primary font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
              All
            </button>
            {data?.tags.map(tag => (
              <button key={tag} onClick={() => setActiveTag(tag)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${activeTag === tag ? 'bg-bg-elevated text-text-primary font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
                {tag}
              </button>
            ))}
          </div>

          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[140px] bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-bg-card border border-torn-green/20 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Add Target</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="number" placeholder="Player ID *" value={addId} onChange={e => setAddId(e.target.value)} className={inputClass} />
              <input type="text" placeholder="Player Name (optional)" value={addName} onChange={e => setAddName(e.target.value)} className={inputClass} />
              <input type="text" placeholder="Tag (e.g. war, chain)" value={addTag} onChange={e => setAddTag(e.target.value)} className={inputClass} />
              <select value={addDiff} onChange={e => setAddDiff(e.target.value)} className={inputClass}>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <input type="text" placeholder="Notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)} className={inputClass} />
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!addId || submitting}
                className="px-4 py-1.5 text-sm rounded-lg bg-torn-green text-white font-medium hover:bg-torn-green-dim transition-colors disabled:opacity-50">
                {submitting ? 'Adding...' : 'Add'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm rounded-lg text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Target list */}
        {loading ? (
          <CardSkeleton count={3} />
        ) : filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.player_id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 hover:border-text-secondary/30 transition-colors">
                {editingId === t.player_id ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input type="text" value={editTag} onChange={e => setEditTag(e.target.value)} placeholder="Tag" className={inputClass} />
                      <select value={editDiff} onChange={e => setEditDiff(e.target.value)} className={inputClass}>
                        {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" className={inputClass} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="text-xs text-torn-green hover:underline">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-text-muted hover:text-text-secondary">Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={tornProfile(t.player_id)} target="_blank"
                          className="text-sm font-semibold text-text-primary hover:text-torn-green transition-colors">
                          {t.player_name || `#${t.player_id}`}
                        </a>
                        <span className="text-[10px] text-text-muted">[{t.player_id}]</span>
                        {t.tag && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-secondary font-medium">{t.tag}</span>
                        )}
                        <span className={`text-[10px] font-medium uppercase ${DIFF_COLORS[t.difficulty]}`}>
                          {t.difficulty !== 'unknown' ? t.difficulty : ''}
                        </span>
                      </div>
                      {t.notes && <p className="text-xs text-text-muted mt-0.5">{t.notes}</p>}
                      <p className="text-[10px] text-text-muted mt-1">Added by {t.added_by_name || `#${t.added_by}`}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a href={tornAttack(t.player_id)} target="_blank"
                        className="px-2 py-1 text-xs rounded-md bg-torn-red/15 text-torn-red hover:bg-torn-red/25 transition-colors font-medium">
                        Attack
                      </a>
                      <button onClick={() => startEdit(t)} className="px-2 py-1 text-xs rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleRemove(t.player_id)} className="px-2 py-1 text-xs rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            {data?.count === 0 ? 'No targets yet. Add your first target above.' : 'No targets match your filters.'}
          </div>
        )}
      </div>
    </div>
  );
}
