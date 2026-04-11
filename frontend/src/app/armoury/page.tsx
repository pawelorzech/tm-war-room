'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import { usePageVisible } from '@/hooks/usePageVisible';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { TableSkeleton } from '@/components/layout/LoadingSkeleton';
import { ItemMultiSelect } from '@/components/ui/ItemMultiSelect';

/* -- Types -------------------------------------------------- */

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

/* -- Helpers ------------------------------------------------- */

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  blood_bags:    { label: 'Blood Bags', icon: '\u{1FA78}' },
  temporary:     { label: 'Temporary Items', icon: '\u{1F489}' },
  alcohol:       { label: 'Alcohol', icon: '\u{1F37A}' },
  medical:       { label: 'Medical', icon: '\u{1FA79}' },
  drugs:         { label: 'Drugs', icon: '\u{1F48A}' },
  energy_drinks: { label: 'Energy Drinks', icon: '\u{26A1}' },
  candy:         { label: 'Candy', icon: '\u{1F36C}' },
};

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

/* -- Leaderboard Table (shared between active & past) ------- */

function LeaderboardTable({ board, myPid, compact }: {
  board: LeaderboardData;
  myPid: string | null;
  compact?: boolean;
}) {
  if (board.leaderboard.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted text-sm">
        No deposits recorded.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
            <th className="py-2 px-3 w-12">Rank</th>
            <th className="py-2 px-3">Player</th>
            <th className="py-2 px-3 text-right">Total</th>
            <th className="py-2 px-3 text-right hidden sm:table-cell"># Deps</th>
            {!compact && <th className="py-2 px-3 text-right hidden sm:table-cell">Last</th>}
          </tr>
        </thead>
        <tbody>
          {board.leaderboard.map(entry => {
            const { medal, color } = rankDecoration(entry.rank);
            const isMe = myPid && String(entry.player_id) === myPid;
            return (
              <tr key={entry.player_id}
                className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${isMe ? 'bg-torn-green/10' : ''}`}>
                <td className={`${compact ? 'py-1.5' : 'py-2'} px-3 font-bold tabular-nums ${color}`}>
                  {medal ? `${medal} ` : ''}{entry.rank}
                </td>
                <td className={`${compact ? 'py-1.5' : 'py-2'} px-3`}>
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
                <td className={`${compact ? 'py-1.5' : 'py-2'} px-3 text-right font-semibold text-torn-green tabular-nums`}>
                  {entry.total.toLocaleString()}
                </td>
                <td className={`${compact ? 'py-1.5' : 'py-2'} px-3 text-right text-text-secondary tabular-nums hidden sm:table-cell`}>
                  {entry.deposits}
                </td>
                {!compact && (
                  <td className="py-2 px-3 text-right text-text-muted text-xs hidden sm:table-cell">
                    {entry.last_deposit ? relativeTime(entry.last_deposit) : '\u2014'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-text-muted">
        {board.participants} participant{board.participants !== 1 ? 's' : ''} &middot; all shown
      </p>
    </div>
  );
}

/* -- Past Competition Card (collapsed preview, expandable) -- */

function PastCompetitionCard({ comp, myPid, isAdmin, onDelete }: {
  comp: Competition;
  myPid: string | null;
  isAdmin: boolean;
  onDelete?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !board) {
      setLoading(true);
      try {
        const lb = await api.armouryLeaderboard(comp.id);
        setBoard(lb);
      } catch { /* swallow */ }
      finally { setLoading(false); }
    }
  };

  const { label, icon } = competitionScope(comp);
  const top3 = board?.leaderboard.slice(0, 3) ?? [];

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
      <button onClick={handleToggle}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-bg-elevated/30 transition-colors">
        <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{comp.name}</p>
            <span className="shrink-0 px-2 py-0.5 text-[10px] rounded-full bg-bg-elevated text-text-muted font-medium">Ended</span>
          </div>
          <p className="text-[10px] text-text-muted truncate">
            {label} &middot; {formatDatetime(comp.start_ts)} &ndash; {formatDatetime(comp.end_ts)}
          </p>
          {/* Top-3 preview when collapsed */}
          {!expanded && board && top3.length > 0 && (
            <p className="text-[11px] text-text-secondary mt-1 truncate">
              {top3.map((e, i) => {
                const { medal } = rankDecoration(e.rank);
                return `${medal} ${e.player_name} ${e.total.toLocaleString()}`;
              }).join('  ')}
              {(board.participants > 3) && `  +${board.participants - 3} more`}
            </p>
          )}
        </div>
      </button>

      {expanded && (
        loading ? (
          <div className="p-3 text-center text-text-muted text-sm">Loading...</div>
        ) : board ? (
          <div className="border-t border-border">
            <LeaderboardTable board={board} myPid={myPid} compact />
          </div>
        ) : (
          <div className="p-3 text-center text-text-muted text-sm">Failed to load.</div>
        )
      )}
      {expanded && isAdmin && onDelete && (
        <div className="border-t border-border p-3 flex justify-end">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Delete this competition and all its data?</span>
              <button onClick={() => onDelete(comp.id)}
                className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors">
                Yes, delete
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 text-xs rounded bg-bg-elevated text-text-secondary hover:bg-bg-elevated/80 transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="px-3 py-1 text-xs rounded text-red-400 hover:bg-red-500/10 transition-colors">
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* -- Page --------------------------------------------------- */

export default function ArmouryPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [activeBoards, setActiveBoards] = useState<Map<number, LeaderboardData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
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

  const activeComps = competitions.filter(c => c.status === 'active');
  const pastComps = competitions.filter(c => c.status === 'ended');

  /* Load all competitions + active leaderboards */
  const loadData = useCallback(async (triggerPoll = false) => {
    setLoading(true);
    try {
      if (triggerPoll && isAdmin) {
        try { await api.armouryPoll(); } catch { /* non-critical */ }
      }
      const res = await api.armouryCompetitions();
      setCompetitions(res.competitions);
      const actives = res.competitions.filter((c: Competition) => c.status === 'active');
      const boards = new Map<number, LeaderboardData>();
      await Promise.all(actives.map(async (c: Competition) => {
        const lb = await api.armouryLeaderboard(c.id);
        boards.set(c.id, lb);
      }));
      setActiveBoards(boards);
      // Auto-select first active competition if none selected
      setSelectedCompId(prev => {
        if (prev && actives.some((c: Competition) => c.id === prev)) return prev;
        return actives.length > 0 ? actives[0].id : null;
      });
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const visible = usePageVisible();

  useEffect(() => { loadData(); }, [loadData]);

  /* Fetch category item lists for tooltips */
  useEffect(() => {
    api.armouryCategories().then(res => setCategoryItemsMap(res.categories)).catch(() => {});
  }, []);

  /* Auto-refresh every 60s — paused when tab is hidden */
  useEffect(() => {
    if (!visible) return;
    const iv = setInterval(loadData, 60_000);
    return () => clearInterval(iv);
  }, [loadData, visible]);

  /* Countdown timer -- update display every 60s — paused when tab is hidden */
  useEffect(() => {
    if (!visible) return;
    timerRef.current = setInterval(() => setTick(t => t + 1), 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible]);

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

  /* Admin: delete competition */
  const handleDelete = async (id: number) => {
    try {
      await api.armouryDeleteCompetition(id);
      await loadData();
    } catch {
      /* swallow */
    }
  };

  const selectedComp = activeComps.find(c => c.id === selectedCompId) ?? null;
  const selectedBoard = selectedCompId ? activeBoards.get(selectedCompId) ?? null : null;

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
          <RefreshButton onRefresh={() => loadData(true)} />
        </div>

        <PageExplainer id="armoury" title="Armoury Competitions \u2014 How it works" bullets={[
          'Faction leadership creates competitions around restocking specific item categories — blood bags, temporary items, alcohol, medical, drugs, energy drinks, candy, or specific items.',
          'Every deposit you make to the faction armoury during the competition window is tracked automatically via the Torn API.',
          'The leaderboard shows who has deposited the most qualifying items. Prizes are announced by leadership for each competition.',
          'Leaderboard refreshes every 60 seconds. Keep depositing to climb the ranks!',
          'Admins can create competitions with custom date ranges, categories, specific items, and prize descriptions.',
        ]} dataSources={['Torn API v2 armoury news logs', 'Polled every data refresh cycle (~30s)']} links={[['Torn Wiki: Armoury', 'https://wiki.torn.com/wiki/Faction_Armoury']]} />

        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : activeComps.length > 0 ? (
          <div className="space-y-4">
            {/* Competition pill tabs (horizontal scroll on mobile) */}
            {activeComps.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                {activeComps.map(comp => {
                  const { icon } = competitionScope(comp);
                  const isSelected = comp.id === selectedCompId;
                  return (
                    <button key={comp.id} onClick={() => setSelectedCompId(comp.id)}
                      className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                        ${isSelected
                          ? 'bg-torn-green/20 text-torn-green border border-torn-green/40 shadow-sm'
                          : 'bg-bg-card border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:border-text-secondary/40'
                        }`}>
                      <span>{icon}</span>
                      <span className="truncate max-w-[140px]">{comp.name}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-torn-green' : 'bg-torn-green/40'}`} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected competition details */}
            {selectedComp && (
              <>
                <div className="bg-bg-card border border-torn-green/20 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{competitionScope(selectedComp).icon}</span>
                      <div>
                        <h2 className="text-lg font-bold">{selectedComp.name}</h2>
                        <p className="text-xs text-text-muted">
                          {competitionScope(selectedComp).label} &middot; {formatDate(selectedComp.start_ts)} &ndash; {formatDate(selectedComp.end_ts)}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 text-xs font-bold rounded-full bg-torn-green/20 text-torn-green">
                      {countdown(selectedComp.end_ts)}
                    </span>
                  </div>

                  {/* Stats bar */}
                  {selectedBoard && (
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-text-muted text-xs">Total deposited</span>
                        <p className="font-bold text-torn-green tabular-nums">{selectedBoard.total_deposited.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-text-muted text-xs">Participants</span>
                        <p className="font-bold tabular-nums">{selectedBoard.participants}</p>
                      </div>
                      <div>
                        <span className="text-text-muted text-xs">Your rank</span>
                        <p className="font-bold tabular-nums">
                          {myPid
                            ? (selectedBoard.leaderboard.find(e => String(e.player_id) === myPid)?.rank
                                ? `#${selectedBoard.leaderboard.find(e => String(e.player_id) === myPid)!.rank}`
                                : '\u2014')
                            : '\u2014'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Prize info */}
                  <div className="bg-bg-elevated/50 rounded-lg p-3 text-xs text-text-secondary">
                    {'\u{1F3C6}'} <span className="font-semibold text-text-primary">Prizes:</span>{' '}
                    {selectedComp.prize_text || 'Top 3 win Xanax \u2014 1st: 3 days, 2nd: 2 days, 3rd: 1 day'}
                  </div>

                  {isAdmin && (
                    confirmEndId === selectedComp.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-danger font-medium">End this competition?</span>
                        <button onClick={() => handleEnd(selectedComp.id)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-danger text-white hover:bg-danger/80 transition-colors font-bold">
                          Yes, end it
                        </button>
                        <button onClick={() => setConfirmEndId(null)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors font-medium">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmEndId(selectedComp.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors font-medium">
                        End Competition
                      </button>
                    )
                  )}
                </div>

                {/* Leaderboard table */}
                {selectedBoard ? (
                  <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                    <LeaderboardTable board={selectedBoard} myPid={myPid} />
                  </div>
                ) : (
                  <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                    No deposits yet. Be the first to contribute!
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Empty state -- no active competition */
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-8 text-center space-y-2">
            <p className="text-3xl">{'\u{1F6E1}\uFE0F'}</p>
            <p className="text-text-secondary font-medium">No active competitions</p>
            <p className="text-text-muted text-sm">Check back soon or ask leadership to start one!</p>
          </div>
        )}

        {/* Past competitions */}
        {pastComps.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-secondary">
              Past Competitions ({pastComps.length})
            </h3>
            {pastComps.map(comp => (
              <PastCompetitionCard key={comp.id} comp={comp} myPid={myPid} isAdmin={isAdmin} onDelete={handleDelete} />
            ))}
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
                    placeholder="e.g. Top 3 win Xanax \u2014 1st: 3 days, 2nd: 2 days, 3rd: 1 day"
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
