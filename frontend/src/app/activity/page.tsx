'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface RawMember {
  id: number;
  name: string;
  level: number;
  days_in_faction: number;
  last_action: unknown;
  status: unknown;
  position: string;
  is_on_wall: boolean;
  is_revivable: boolean;
  is_in_oc: boolean;
}

interface Member {
  id: number;
  name: string;
  level: number;
  days_in_faction: number;
  last_action: string;
  status: string;
  position: string;
  is_on_wall: boolean;
  is_revivable: boolean;
  is_in_oc: boolean;
}

function normalizeMember(m: RawMember): Member {
  const status = typeof m.status === 'string' ? m.status :
    (m.status && typeof m.status === 'object') ? ((m.status as Record<string, string>).description || (m.status as Record<string, string>).state || 'Unknown') : 'Unknown';
  const lastAction = typeof m.last_action === 'string' ? m.last_action :
    (m.last_action && typeof m.last_action === 'object') ? ((m.last_action as Record<string, string>).relative || (m.last_action as Record<string, string>).status || '') : '';
  return { ...m, status, last_action: lastAction };
}

type SortCol = 'name' | 'last_action_ts' | 'level' | 'days_in_faction' | 'status';
type StatusFilter = 'all' | 'online' | 'idle' | 'offline' | 'hospital' | 'traveling' | 'jail';

function parseLastAction(s: string): number {
  // "5 minutes ago" → timestamp estimate
  if (!s) return 0;
  const now = Date.now() / 1000;
  const match = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/i);
  if (!match) return now; // "Online" or unknown
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    second: 1, minute: 60, hour: 3600, day: 86400,
    week: 604800, month: 2592000, year: 31536000,
  };
  return now - n * (multipliers[unit] || 60);
}

function activityCategory(lastAction: string, status: string): StatusFilter {
  const s = (status || '').toLowerCase();
  if (s.includes('hospital')) return 'hospital';
  if (s.includes('travel') || s.includes('abroad')) return 'traveling';
  if (s.includes('jail')) return 'jail';

  const la = (lastAction || '').toLowerCase();
  if (la.includes('online') || la === '') return 'online';
  const match = la.match(/(\d+)\s+(second|minute|hour|day)/i);
  if (match) {
    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'second' || (unit === 'minute' && n <= 5)) return 'online';
    if (unit === 'minute' && n <= 30) return 'idle';
  }
  return 'offline';
}

const CAT_COLORS: Record<StatusFilter, { text: string; bg: string; label: string }> = {
  all:       { text: 'text-text-primary',   bg: 'bg-bg-elevated', label: 'All' },
  online:    { text: 'text-torn-green',     bg: 'bg-torn-green/15', label: 'Online' },
  idle:      { text: 'text-torn-yellow',    bg: 'bg-torn-yellow/15', label: 'Idle' },
  offline:   { text: 'text-text-muted',     bg: 'bg-bg-elevated', label: 'Offline' },
  hospital:  { text: 'text-torn-red',       bg: 'bg-torn-red/15', label: 'Hospital' },
  traveling: { text: 'text-torn-blue',      bg: 'bg-torn-blue/15', label: 'Traveling' },
  jail:      { text: 'text-warning',        bg: 'bg-warning/15', label: 'Jail' },
};

function tornProfile(id: number) {
  return `https://www.torn.com/profiles.php?XID=${id}`;
}

export default function ActivityPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sortCol, setSortCol] = useState<SortCol>('last_action_ts');
  const [sortAsc, setSortAsc] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    api.overview()
      .then(d => {
        const raw = (d.members || []) as unknown as RawMember[];
        setMembers(raw.map(normalizeMember));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute counts per category
  const counts: Record<StatusFilter, number> = { all: members.length, online: 0, idle: 0, offline: 0, hospital: 0, traveling: 0, jail: 0 };
  members.forEach(m => {
    const cat = activityCategory(m.last_action, m.status);
    counts[cat]++;
  });

  // Filter + sort
  const displayMembers = (() => {
    let list = members;
    if (filter !== 'all') {
      list = list.filter(m => activityCategory(m.last_action, m.status) === filter);
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortCol === 'last_action_ts') cmp = parseLastAction(a.last_action) - parseLastAction(b.last_action);
      else if (sortCol === 'level') cmp = a.level - b.level;
      else if (sortCol === 'days_in_faction') cmp = a.days_in_faction - b.days_in_faction;
      else if (sortCol === 'status') cmp = a.status.localeCompare(b.status);
      return sortAsc ? cmp : -cmp;
    });
  })();

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === 'name'); }
  };
  const Arrow = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-0.5 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Faction Activity</h1>
            <p className="text-text-secondary text-sm mt-1">{members.length} members</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="activity" title="Faction Activity — What's here?" bullets={[
          "Activity monitoring shows every faction member's current state: online, idle, offline, in hospital, traveling abroad, or in jail. This is your faction's real-time pulse.",
          "During wars, activity tracking is essential for coordination — you need to know how many members are available to fight, who's hospitalized and needs reviving, and who's offline.",
          "'Idle' means a player hasn't performed any action for 5+ minutes — they may be AFK or just reading. 'Offline' means they haven't been active in over 30 minutes.",
          "Use activity data for chain planning: you need active members online to maintain a chain. If half your faction is offline or traveling, it's not the right time to start a big chain.",
        ]} dataSources={["Torn API v2 faction members endpoint", "Status updates every 30s via background scheduler", "Activity snapshots stored for historical trends"]} links={[["Torn Wiki: Factions", "https://wiki.torn.com/wiki/Faction"]]} />

        {/* Status summary cards */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(['online', 'idle', 'offline', 'hospital', 'traveling', 'jail'] as const).map(cat => {
            const c = CAT_COLORS[cat];
            return (
              <button key={cat} onClick={() => setFilter(filter === cat ? 'all' : cat)}
                className={`rounded-lg p-2 text-center transition-all border ${
                  filter === cat ? `${c.bg} border-current ${c.text}` : 'border-transparent hover:bg-bg-elevated'
                }`}>
                <p className={`text-xl font-bold ${c.text}`}>{counts[cat]}</p>
                <p className="text-[10px] text-text-muted uppercase">{c.label}</p>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-text-secondary text-sm animate-pulse">Loading member data...</p>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('name')}>
                      Member<Arrow col="name" />
                    </th>
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('level')}>
                      Level<Arrow col="level" />
                    </th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('last_action_ts')}>
                      Last Action<Arrow col="last_action_ts" />
                    </th>
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('days_in_faction')}>
                      Days<Arrow col="days_in_faction" />
                    </th>
                    <th className="py-2 px-3">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {displayMembers.map(m => {
                    const cat = activityCategory(m.last_action, m.status);
                    const c = CAT_COLORS[cat];
                    return (
                      <tr key={m.id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                        <td className="py-1.5 px-3">
                          <a href={tornProfile(m.id)} target="_blank"
                            className="font-medium text-text-primary hover:text-torn-green transition-colors">
                            {m.name}
                          </a>
                          <span className="ml-1 text-[10px] text-text-muted">[{m.id}]</span>
                        </td>
                        <td className="py-1.5 px-3 text-text-secondary">{m.level}</td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${c.bg} ${c.text}`}>
                            {c.label}
                          </span>
                          {m.status && m.status !== 'Okay' && (
                            <span className="ml-1 text-xs text-text-muted">{m.status}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-text-muted text-xs">{m.last_action || '—'}</td>
                        <td className="py-1.5 px-3 text-text-secondary tabular-nums">{m.days_in_faction}</td>
                        <td className="py-1.5 px-3 text-text-muted text-xs">{m.position || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
