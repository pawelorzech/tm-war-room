'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { TableSkeleton } from '@/components/layout/LoadingSkeleton';
import { ItemMultiSelect } from '@/components/ui/ItemMultiSelect';

/* ── Types ──────────────────────────────────────────── */

interface Competition {
  id: number;
  name: string;
  category: string;
  items: string | null;
  status: string;
  start_ts: number;
  end_ts: number;
  created_by: number | null;
  prize_text: string | null;
}

interface LeaderboardEntry {
  rank: number;
  player_id: number;
  player_name: string;
  total: number;
  deposits: number;
  last_deposit: number;
}

interface LeaderboardData {
  competition: {
    id: number;
    name: string;
    category: string;
    status: string;
    start_ts: number;
    end_ts: number;
    prize_text: string | null;
  };
  leaderboard: LeaderboardEntry[];
  total_deposited: number;
  participants: number;
}

/* ── Helpers ────────────────────────────────────────── */

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  blood_bags:    { label: 'Blood Bags', icon: '\u{1FA78}' },
  temporary:     { label: 'Temporary Items', icon: '\u{1F489}' },
  alcohol:       { label: 'Alcohol', icon: '\u{1F37A}' },
  medical:       { label: 'Medical', icon: '\u{1FA79}' },
  drugs:         { label: 'Drugs', icon: '\u{1F48A}' },
  energy_drinks: { label: 'Energy Drinks', icon: '\u{26A1}' },
  candy:         { label: 'Candy', icon: '\u{1F36C}' },
};

function categoryDisplay(cat: string) {
  const cats = cat.split(',').map(c => c.trim()).filter(Boolean);
  if (cats.length === 0) return { label: '', icon: '' };
  if (cats.length === 1) {
    return CATEGORY_META[cats[0]] || { label: cat, icon: '\u{1F6E1}\uFE0F' };
  }
  const labels = cats.map(c => CATEGORY_META[c]?.label || c);
  const icons = cats.map(c => CATEGORY_META[c]?.icon || '');
  return { label: labels.join(' + '), icon: icons.filter(Boolean).join('') };
}

function competitionScope(comp: Competition): { label: string; icon: string } {
  const parts: string[] = [];
  const icons: string[] = [];
  if (comp.category) {
    const cats = comp.category.split(',').map(c => c.trim()).filter(Boolean);
    parts.push(...cats.map(c => CATEGORY_META[c]?.label || c));
    icons.push(...cats.map(c => CATEGORY_META[c]?.icon || '').filter(Boolean));
  }
  if (comp.items) {
    const items = comp.items.split(',').map(i => i.trim()).filter(Boolean);
    if (items.length <= 3) {
      parts.push(...items);
    } else {
      parts.push(`${items.slice(0, 2).join(', ')} +${items.length - 2} more`);
    }
    icons.push('\u{1F4E6}');
  }
  return {
    label: parts.join(' + ') || 'All items',
    icon: icons.length > 0 ? icons[0] : '\u{1F6E1}\uFE0F',
  };
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDatetime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function countdown(endTs: number): string {
  const diff = Math.max(0, endTs - Math.floor(Date.now() / 1000));
  if (diff === 0) return 'Ended';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function rankDecoration(rank: number): { medal: string; color: string } {
  if (rank === 1) return { medal: '\u{1F947}', color: 'text-yellow-400' };
  if (rank === 2) return { medal: '\u{1F948}', color: 'text-gray-400' };
  if (rank === 3) return { medal: '\u{1F949}', color: 'text-orange-400' };
  return { medal: '', color: 'text-text-secondary' };
}

/* ── Page ───────────────────────────────────────────── */

export default function ArmouryPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [activeBoards, setActiveBoards] = useState<Map<number, LeaderboardData>>(new Map());
  const [pastBoards, setPastBoards] = useState<Map<number, LeaderboardData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCategories, setFormCategories] = useState<string[]>(['blood_bags']);
  const [formItems, setFormItems] = useState<string[]>([]);
  const [formPrizeText, setFormPrizeText] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmEndId, setConfirmEndId] = useState<number | null>(null);
  const [categoryItemsMap, setCategoryItemsMap] = useState<Record<string, string[]>>({});
  const [, setTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myPid = typeof window !== 'undefined' ? localStorage.getItem('myKeyPlayer') : null;
  const role = typeof window !== 'undefined' ? localStorage.getItem('myKeyRole') : null;
  const isAdmin = role === 'admin' || role === 'superadmin';

  /* Load all competitions + active leaderboard */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.armouryCompetitions();
      setCompetitions(res.competitions);
      const actives = res.competitions.filter(c => c.status === 'active');
      const boards = new Map<number, LeaderboardData>();
      await Promise.all(actives.map(async (c) => {
        const lb = await api.armouryLeaderboard(c.id);
        boards.set(c.id, lb);
      }));
      setActiveBoards(boards);
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* Fetch category item lists for tooltips */
  useEffect(() => {
    api.armouryCategories().then(res => setCategoryItemsMap(res.categories)).catch(() => {});
  }, []);

  /* Auto-refresh every 60s */
  useEffect(() => {
    const iv = setInterval(loadData, 60_000);
    return () => clearInterval(iv);
  }, [loadData]);

  /* Countdown timer — update display every 60s */
  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  /* Load a past competition leaderboard */
  const loadPastBoard = useCallback(async (id: number) => {
    if (pastBoards.has(id)) return;
    try {
      const lb = await api.armouryLeaderboard(id);
      setPastBoards(prev => new Map(prev).set(id, lb));
    } catch {
      /* swallow */
    }
  }, [pastBoards]);

  const pastCompetitions = competitions.filter(c => c.status === 'ended');

  /* Expand past section & load all boards */
  const togglePast = () => {
    const next = !showPast;
    setShowPast(next);
    if (next) {
      pastCompetitions.forEach(c => loadPastBoard(c.id));
    }
  };

  /* Admin: create competition */
  const handleCreate = async () => {
    setFormError('');
    if (!formName.trim()) { setFormError('Name is required'); return; }
    if (formCategories.length === 0 && formItems.length === 0) { setFormError('Select at least one category or item'); return; }
    if (!formStart || !formEnd) { setFormError('Start and end dates are required'); return; }
    const startTs = Math.floor(new Date(formStart).getTime() / 1000);
    const endTs = Math.floor(new Date(formEnd).getTime() / 1000);
    if (endTs <= startTs) { setFormError('End must be after start'); return; }
    setSubmitting(true);
    try {
      await api.armouryCreateCompetition({
        name: formName.trim(),
        categories: formCategories,
        items: formItems.length > 0 ? formItems : undefined,
        start_ts: startTs,
        end_ts: endTs,
        prize_text: formPrizeText || undefined,
      });
      setShowForm(false);
      setFormName('');
      setFormCategories(['blood_bags']);
      setFormItems([]);
      setFormPrizeText('');
      setFormStart('');
      setFormEnd('');
      await loadData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create competition');
    } finally {
      setSubmitting(false);
    }
  };

  /* Admin: end competition */
  const handleEnd = async (id: number) => {
    try {
      await api.armouryEndCompetition(id);
      setConfirmEndId(null);
      await loadData();
    } catch {
      /* swallow */
    }
  };

  const activeComps = competitions.filter(c => c.status === 'active');

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{'\u{1F6E1}\uFE0F'} Armoury Competitions</h1>
            <p className="text-text-secondary text-sm mt-1">
              Track who deposits the most items to the faction armoury
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="armoury" title="Armoury Competitions — How it works" bullets={[
          'Faction leadership creates competitions around restocking specific item categories (blood bags, temporary items, or alcohol).',
          'Every deposit you make to the faction armoury during the competition window is tracked automatically via the Torn API.',
          'The leaderboard shows who has deposited the most items. Prizes are announced by leadership for each competition.',
          'Leaderboard refreshes every 60 seconds. Keep depositing to climb the ranks!',
          'Data: Torn API v2 armoury logs, scanned every data refresh cycle.',
        ]} />

        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : activeComps.length > 0 ? (
          activeComps.map(comp => {
            const board = activeBoards.get(comp.id);
            return (
              <div key={comp.id} className="space-y-4">
                {/* Active competition banner */}
                <div className="bg-bg-card border border-torn-green/20 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{competitionScope(comp).icon}</span>
                      <div>
                        <h2 className="text-lg font-bold">{comp.name}</h2>
                        <p className="text-xs text-text-muted">
                          {competitionScope(comp).label} &middot; {formatDate(comp.start_ts)} &ndash; {formatDate(comp.end_ts)}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 text-xs font-bold rounded-full bg-torn-green/20 text-torn-green">
                      {countdown(comp.end_ts)}
                    </span>
                  </div>

                  {/* Stats bar */}
                  {board && (
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-text-muted text-xs">Total deposited</span>
                        <p className="font-bold text-torn-green tabular-nums">{board.total_deposited.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-text-muted text-xs">Participants</span>
                        <p className="font-bold tabular-nums">{board.participants}</p>
                      </div>
                      <div>
                        <span className="text-text-muted text-xs">Your rank</span>
                        <p className="font-bold tabular-nums">
                          {myPid
                            ? (board.leaderboard.find(e => String(e.player_id) === myPid)?.rank
                                ? `#${board.leaderboard.find(e => String(e.player_id) === myPid)!.rank}`
                                : '—')
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Prize info */}
                  <div className="bg-bg-elevated/50 rounded-lg p-3 text-xs text-text-secondary">
                    {'\u{1F3C6}'} <span className="font-semibold text-text-primary">Prizes:</span>{' '}
                    {comp.prize_text || 'Top 3 win Xanax \u2014 1st: 3 days, 2nd: 2 days, 3rd: 1 day'}
                  </div>

                  {isAdmin && (
                    confirmEndId === comp.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-danger font-medium">End this competition?</span>
                        <button onClick={() => handleEnd(comp.id)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-danger text-white hover:bg-danger/80 transition-colors font-bold">
                          Yes, end it
                        </button>
                        <button onClick={() => setConfirmEndId(null)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors font-medium">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmEndId(comp.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors font-medium">
                        End Competition
                      </button>
                    )
                  )}
                </div>

                {/* Leaderboard table */}
                {board && board.leaderboard.length > 0 ? (
                  <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                            <th className="py-2 px-3 w-12">Rank</th>
                            <th className="py-2 px-3">Player</th>
                            <th className="py-2 px-3 text-right">Total Deposited</th>
                            <th className="py-2 px-3 text-right hidden sm:table-cell"># Deposits</th>
                            <th className="py-2 px-3 text-right hidden sm:table-cell">Last Deposit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {board.leaderboard.map(entry => {
                            const { medal, color } = rankDecoration(entry.rank);
                            const isMe = myPid && String(entry.player_id) === myPid;
                            return (
                              <tr key={entry.player_id}
                                className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${isMe ? 'bg-torn-green/10' : ''}`}>
                                <td className={`py-2 px-3 font-bold tabular-nums ${color}`}>
                                  {medal ? `${medal} ` : ''}{entry.rank}
                                </td>
                                <td className="py-2 px-3">
                                  <a href={`https://www.torn.com/profiles.php?XID=${entry.player_id}`} target="_blank"
                                    className="font-medium text-text-primary hover:text-torn-green transition-colors">
                                    {entry.player_name || `#${entry.player_id}`}
                                  </a>
                                  {isMe && (
                                    <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded bg-torn-green/20 text-torn-green font-bold uppercase">
                                      You
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-torn-green tabular-nums">
                                  {entry.total.toLocaleString()}
                                </td>
                                <td className="py-2 px-3 text-right text-text-secondary tabular-nums hidden sm:table-cell">
                                  {entry.deposits}
                                </td>
                                <td className="py-2 px-3 text-right text-text-muted text-xs hidden sm:table-cell">
                                  {entry.last_deposit ? relativeTime(entry.last_deposit) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                    No deposits yet. Be the first to contribute!
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Empty state — no active competition */
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-8 text-center space-y-2">
            <p className="text-3xl">{'\u{1F6E1}\uFE0F'}</p>
            <p className="text-text-secondary font-medium">No active competitions</p>
            <p className="text-text-muted text-sm">Check back soon or ask leadership to start one!</p>
          </div>
        )}

        {/* Past competitions */}
        {pastCompetitions.length > 0 && (
          <div>
            <button onClick={togglePast}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              <span className={`transition-transform ${showPast ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
              Past Competitions ({pastCompetitions.length})
            </button>

            {showPast && (
              <div className="mt-3 space-y-4">
                {pastCompetitions.map(comp => {
                  const board = pastBoards.get(comp.id);
                  const { label, icon } = competitionScope(comp);
                  return (
                    <div key={comp.id} className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                      <div className="p-3 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{icon}</span>
                          <div>
                            <p className="font-semibold text-sm">{comp.name}</p>
                            <p className="text-[10px] text-text-muted">
                              {label} &middot; {formatDatetime(comp.start_ts)} &ndash; {formatDatetime(comp.end_ts)}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-bg-elevated text-text-muted font-medium">Ended</span>
                      </div>
                      {board ? (
                        board.leaderboard.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                                  <th className="py-2 px-3 w-12">Rank</th>
                                  <th className="py-2 px-3">Player</th>
                                  <th className="py-2 px-3 text-right">Total</th>
                                  <th className="py-2 px-3 text-right hidden sm:table-cell"># Deposits</th>
                                </tr>
                              </thead>
                              <tbody>
                                {board.leaderboard.slice(0, 5).map(entry => {
                                  const { medal, color } = rankDecoration(entry.rank);
                                  return (
                                    <tr key={entry.player_id} className="border-b border-border-light">
                                      <td className={`py-1.5 px-3 font-bold tabular-nums ${color}`}>
                                        {medal ? `${medal} ` : ''}{entry.rank}
                                      </td>
                                      <td className="py-1.5 px-3">
                                        <a href={`https://www.torn.com/profiles.php?XID=${entry.player_id}`} target="_blank"
                                          className="text-text-primary hover:text-torn-green transition-colors">
                                          {entry.player_name || `#${entry.player_id}`}
                                        </a>
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-semibold text-torn-green tabular-nums">
                                        {entry.total.toLocaleString()}
                                      </td>
                                      <td className="py-1.5 px-3 text-right text-text-secondary tabular-nums hidden sm:table-cell">
                                        {entry.deposits}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="p-3 text-center text-text-muted text-sm">No deposits recorded.</p>
                        )
                      ) : (
                        <p className="p-3 text-center text-text-muted text-sm">Loading...</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Admin section */}
        {isAdmin && (
          <div className="space-y-3">
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">Admin Controls</h3>
              <button onClick={() => setShowForm(f => !f)}
                className="px-4 py-2 text-sm rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30 transition-colors font-medium">
                {showForm ? 'Cancel' : '+ New Competition'}
              </button>
            </div>

            {showForm && (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Competition Name</label>
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. April Blood Bag Drive"
                    className="w-full bg-bg-elevated border border-text-secondary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Categories</label>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(CATEGORY_META).map(([key, { label, icon }]) => (
                      <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer group relative">
                        <input type="checkbox"
                          checked={formCategories.includes(key)}
                          onChange={() => setFormCategories(prev =>
                            prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
                          )}
                          className="rounded border-text-secondary/40 text-torn-green focus:ring-torn-green/50" />
                        <span title={categoryItemsMap[key]?.join(', ') || ''}>{icon} {label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">Hover a category to see its items</p>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Specific Items (optional)</label>
                  <ItemMultiSelect selected={formItems} onChange={setFormItems} placeholder="Type to search items..." />
                  <p className="text-[10px] text-text-muted mt-1">Add specific items in addition to or instead of categories</p>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Prizes (optional)</label>
                  <input type="text" value={formPrizeText} onChange={e => setFormPrizeText(e.target.value)}
                    placeholder="e.g. Top 3 win Xanax — 1st: 3 days, 2nd: 2 days, 3rd: 1 day"
                    className="w-full bg-bg-elevated border border-text-secondary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Start</label>
                    <input type="datetime-local" value={formStart} onChange={e => setFormStart(e.target.value)}
                      className="w-full bg-bg-elevated border border-text-secondary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-torn-green/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">End</label>
                    <input type="datetime-local" value={formEnd} onChange={e => setFormEnd(e.target.value)}
                      className="w-full bg-bg-elevated border border-text-secondary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-torn-green/50" />
                  </div>
                </div>
                {formError && (
                  <p className="text-danger text-xs">{formError}</p>
                )}
                <button onClick={handleCreate} disabled={submitting}
                  className="bg-torn-green text-black font-bold px-4 py-2 rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Competition'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Data source footer */}
        <p className="text-[10px] text-text-muted text-center">
          Data: Torn API v2 armoury logs &middot; Refreshes every 60s
        </p>
      </div>
    </div>
  );
}
