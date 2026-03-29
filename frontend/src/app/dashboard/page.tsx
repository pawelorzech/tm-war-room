'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import Link from 'next/link';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';

interface StatusData {
  war_active: boolean;
  poll_interval: number;
  refresh_cycle: number;
}

interface OverviewMember {
  id: number;
  name: string;
  status: string;
  last_action: string;
  is_on_wall: boolean;
}

interface LootNPC {
  id: number;
  name: string;
  level: number;
  next_level_at: number | null;
  status: string;
  reservations: { player_name: string }[];
}

function Widget({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 hover:border-torn-green/30 transition-all block">
      <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </Link>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [memberCounts, setMemberCounts] = useState({ total: 0, online: 0, hospital: 0, traveling: 0, onWall: 0 });
  const [topLoot, setTopLoot] = useState<LootNPC | null>(null);
  const [chainCount, setChainCount] = useState(0);
  const [attackCount, setAttackCount] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.overview().catch(() => null),
      fetch('/api/status').then(r => r.json()).catch(() => null),
      fetch('/api/loot').then(r => r.json()).catch(() => null),
      fetch('/api/chain/chains').then(r => r.json()).catch(() => null),
    ]).then(([overview, statusData, lootData, chainData]) => {
      if (statusData) setStatus(statusData);

      if (overview) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const members = ((overview as any).members || []) as OverviewMember[];
        const now = members.length;
        const online = members.filter(m => {
          const la = (m.last_action || '').toLowerCase();
          return la.includes('online') || la.match(/(\d+)\s+second/) || (la.match(/(\d+)\s+minute/) && parseInt(la) <= 5);
        }).length;
        const hospital = members.filter(m => (m.status || '').toLowerCase().includes('hospital')).length;
        const traveling = members.filter(m => {
          const s = (m.status || '').toLowerCase();
          return s.includes('travel') || s.includes('abroad');
        }).length;
        const onWall = members.filter(m => m.is_on_wall).length;
        setMemberCounts({ total: now, online, hospital, traveling, onWall });
      }

      if (lootData?.npcs) {
        const best = lootData.npcs.reduce((a: LootNPC | null, b: LootNPC) =>
          !a || b.level > a.level ? b : a, null);
        setTopLoot(best);
      }

      if (chainData) {
        setChainCount(chainData.total_chains || 0);
        setAttackCount(chainData.attacks_in_db || 0);
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6"><CardSkeleton count={4} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* War alert */}
        {status?.war_active && (
          <div className="bg-torn-red/15 border border-torn-red/40 rounded-xl p-4 text-center" style={{ animation: 'tm-countdown-pulse 2s infinite' }}>
            <p className="text-torn-red font-bold text-lg uppercase">Active War</p>
            <p className="text-torn-red/70 text-xs">Data refreshing every {status.poll_interval}s</p>
          </div>
        )}

        {/* Quick stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Widget title="Members Online" href="/activity">
            <p className="text-3xl font-bold text-torn-green">{memberCounts.online}</p>
            <p className="text-xs text-text-muted">of {memberCounts.total} total</p>
          </Widget>
          <Widget title="In Hospital" href="/activity">
            <p className="text-3xl font-bold text-torn-red">{memberCounts.hospital}</p>
            <p className="text-xs text-text-muted">{memberCounts.onWall > 0 ? `${memberCounts.onWall} on wall` : 'none on wall'}</p>
          </Widget>
          <Widget title="Traveling" href="/travel">
            <p className="text-3xl font-bold text-torn-blue">{memberCounts.traveling}</p>
            <p className="text-xs text-text-muted">members abroad</p>
          </Widget>
          <Widget title="Attacks Tracked" href="/chain">
            <p className="text-3xl font-bold text-text-primary">{attackCount}</p>
            <p className="text-xs text-text-muted">{chainCount} chains detected</p>
          </Widget>
        </div>

        {/* NPC Loot quick status */}
        {topLoot && (
          <Widget title="Best NPC Loot Right Now" href="/loot">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{topLoot.name}</p>
                <p className="text-xs text-text-muted">
                  {topLoot.reservations?.length > 0 && `${topLoot.reservations.length} reserved · `}
                  {topLoot.status}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${
                  topLoot.level >= 4 ? 'text-torn-yellow' : topLoot.level >= 3 ? 'text-torn-green' : 'text-text-muted'
                }`}>Lv {topLoot.level}</p>
              </div>
            </div>
          </Widget>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: 'Our Team', href: '/team', icon: '👥' },
            { label: 'Enemies', href: '/enemies', icon: '⚔️' },
            { label: 'Chain Tracker', href: '/chain', icon: '🔗' },
            { label: 'Awards', href: '/awards', icon: '🏆' },
            { label: 'Stocks', href: '/stocks', icon: '📉' },
            { label: 'Market', href: '/market', icon: '🛒' },
            { label: 'OC Planner', href: '/oc', icon: '🕴️' },
            { label: 'Revives', href: '/revives', icon: '💚' },
            { label: 'War Reports', href: '/wars', icon: '📊' },
          ].map(link => (
            <Link key={link.href} href={link.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-bg-card border border-text-secondary/10 hover:border-torn-green/30 hover:bg-bg-elevated/50 transition-all text-sm">
              <span>{link.icon}</span>
              <span className="text-text-primary">{link.label}</span>
            </Link>
          ))}
        </div>

        {/* System status */}
        {status && (
          <div className="text-[10px] text-text-muted text-center">
            Background refresh: cycle #{status.refresh_cycle} · {status.war_active ? 'War mode' : 'Peace mode'} · {status.poll_interval}s interval
          </div>
        )}
      </div>
    </div>
  );
}
