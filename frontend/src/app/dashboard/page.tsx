'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePageVisible } from '@/hooks/usePageVisible';
import Link from 'next/link';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { TIPS, type Tip } from '@/data/tips';
import { AppIcon } from '@/components/ui/AppIcon';
import { ErrorBanner } from '@/components/layout/ErrorBanner';

function pickRandomTips(count: number): Tip[] {
  const shuffled = [...TIPS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

interface StatusData {
  war_active: boolean;
  poll_interval: number;
  refresh_cycle: number;
}

interface LootNPC {
  id: number;
  name: string;
  level: number;
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

  const [easyBounties, setEasyBounties] = useState(0);
  const [bountyValue, setBountyValue] = useState(0);
  const [ocReady, setOcReady] = useState(0);
  const [ocTotal, setOcTotal] = useState(0);
  const [chatUnread, setChatUnread] = useState<{ channels: Record<string, number>; total: number } | null>(null);
  const [chatChannelNames, setChatChannelNames] = useState<Record<number, string>>({});
  const [chatBannerDismissed, setChatBannerDismissed] = useState(false);
  const [shownTips, setShownTips] = useState<Tip[]>(() => pickRandomTips(3));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.dashboard().then((data) => {
      setStatus(data.status);

      // Members — use server-computed counts
      const mc = (data as Record<string, unknown>).member_counts as { total: number; online: number; hospital: number; traveling: number; on_wall: number };
      if (mc) {
        setMemberCounts({ total: mc.total, online: mc.online, hospital: mc.hospital, traveling: mc.traveling, onWall: mc.on_wall });
      }

      // Loot
      if (data.loot) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const npcs = ((data.loot as any).npcs as LootNPC[]) || [];
        const best = npcs.reduce((a: LootNPC | null, b: LootNPC) =>
          !a || b.level > a.level ? b : a, null);
        setTopLoot(best);
      }

      // Chain
      setChainCount(data.chain_summary?.total_chains || 0);
      setAttackCount(data.chain_summary?.attacks_in_db || 0);

      // Bounties — guard against null/undefined from upstream errors.
      const bounties = (data.bounties || []) as unknown[];
      if (bounties.length > 0) {
        const easy = bounties.filter((b: unknown) => (b as { threat_label: string }).threat_label === 'easy').length;
        setEasyBounties(easy);
        const totalValue = bounties.reduce((sum: number, b: unknown) => sum + ((b as { reward: number }).reward || 0), 0);
        setBountyValue(totalValue);
      }

      // OC — same defensive treatment. Torn occasionally returns crimes
      // without participants[] which used to crash the whole load.
      const crimes = (data.oc_crimes || []) as unknown[];
      setOcTotal(crimes.length);
      const ready = crimes.filter((c: unknown) => {
        const crime = c as { participants?: { planning_complete: boolean }[] };
        const participants = crime.participants || [];
        return participants.length > 0 && participants.every(p => p.planning_complete);
      }).length;
      setOcReady(ready);

      // Chat
      setChatUnread(data.chat_unread);
      const nameMap: Record<number, string> = {};
      for (const ch of (data.chat_channels || [])) {
        nameMap[ch.id] = ch.name;
      }
      setChatChannelNames(nameMap);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
    }).finally(() => setLoading(false));
  }, []);

  const visible = usePageVisible();

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load, visible]);

  if (loading) return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6"><CardSkeleton count={4} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {error && <ErrorBanner message={error} onRetry={load} />}

        {chatUnread && chatUnread.total > 0 && !chatBannerDismissed && (
          <div className="flex items-center gap-3 bg-torn-blue/10 border border-torn-blue/30 rounded-xl px-4 py-3">
            <AppIcon name="chat" size={19} className="text-torn-blue" />
            <Link
              href={`/chat?channel=${Object.entries(chatUnread.channels).find(([, v]) => v > 0)?.[0] || ""}`}
              className="flex-1 text-sm"
            >
              <span className="font-bold text-text-primary">{chatUnread.total} unread message{chatUnread.total !== 1 ? "s" : ""}</span>
              <span className="text-text-muted ml-1.5">
                in {Object.entries(chatUnread.channels)
                  .filter(([, v]) => v > 0)
                  .map(([id]) => `#${chatChannelNames[Number(id)] || id}`)
                  .join(", ")}
              </span>
            </Link>
            <button
              onClick={() => setChatBannerDismissed(true)}
              className="text-text-muted hover:text-text-primary transition-colors shrink-0 text-sm"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {status?.war_active && (
          <div className="bg-torn-red/15 border border-torn-red/40 rounded-xl p-4 text-center" style={{ animation: 'tm-countdown-pulse 2s infinite' }}>
            <p className="text-torn-red font-bold text-lg uppercase">Active War</p>
            <p className="text-torn-red/70 text-xs">Data refreshing every {status.poll_interval}s</p>
          </div>
        )}

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <p className={`text-2xl font-bold ${
                  topLoot.level >= 4 ? 'text-torn-yellow' : topLoot.level >= 3 ? 'text-torn-green' : 'text-text-muted'
                }`}>Lv {topLoot.level}</p>
              </div>
            </Widget>
          )}
          {easyBounties > 0 && (
            <Widget title="Easy Bounties Available" href="/bounties">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-torn-green">{easyBounties} easy targets</p>
                  <p className="text-xs text-text-muted">
                    ${(bountyValue / 1e6).toFixed(1)}M total on board
                  </p>
                </div>
                <AppIcon name="cash" size={24} className="text-torn-green" />
              </div>
            </Widget>
          )}
          {ocTotal > 0 && (
            <Widget title="OC Planning" href="/oc">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold">{ocTotal} crimes in planning</p>
                  <p className="text-xs text-text-muted">
                    {ocReady > 0 ? (
                      <span className="text-torn-green font-medium">{ocReady} ready to initiate!</span>
                    ) : 'none ready yet'}
                  </p>
                </div>
                <AppIcon name="oc" size={24} className="text-text-secondary" />
              </div>
            </Widget>
          )}
        </div>

        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AppIcon name="lightbulb" size={18} className="text-torn-yellow" />
              <h3 className="text-xs text-text-muted uppercase tracking-wider font-medium">Quick Tips</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShownTips(pickRandomTips(3))}
                className="text-sm text-text-muted hover:text-text-primary transition-colors"
                aria-label="Shuffle tips"
                title="Shuffle tips"
              >
                <AppIcon name="shuffle" size={16} />
              </button>
              <Link
                href="/guide"
                className="text-sm text-text-muted hover:text-torn-green transition-colors"
                title="Full Guide"
              >
                <AppIcon name="book-open" size={16} />
              </Link>
            </div>
          </div>
          <ul className="space-y-2">
            {shownTips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-secondary leading-snug">
                <span className="text-text-muted shrink-0">•</span>
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>

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
              <AppIcon name={link.icon} size={16} />
              <span className="text-text-primary">{link.label}</span>
            </Link>
          ))}
        </div>

        {status && (
          <div className="text-[10px] text-text-muted text-center">
            Background refresh: cycle #{status.refresh_cycle} · {status.war_active ? 'War mode' : 'Peace mode'} · {status.poll_interval}s interval
          </div>
        )}
      </div>
    </div>
  );
}
