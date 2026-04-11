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

interface LootNPC {
  id: number;
  name: string;
  level: number;
  status: string;
  reservations: { player_name: string }[];
}

// Helper to safely extract status string from member data
function getStatusStr(m: Record<string, unknown>): string {
  const s = m.status;
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') return (s as Record<string, unknown>).description as string || (s as Record<string, unknown>).state as string || '';
  return '';
}

function getLastActionStr(m: Record<string, unknown>): string {
  const la = m.last_action;
  if (typeof la === 'string') return la;
  if (la && typeof la === 'object') return (la as Record<string, unknown>).relative as string || (la as Record<string, unknown>).status as string || '';
  return '';
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

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.overview().catch(() => null),
      api.lootTimers().catch(() => null),
      api.chainList().catch(() => null),
      api.bounties().catch(() => null),
      api.ocOverview('planning').catch(() => null),
      api.chatUnread().catch(() => null),
      api.chatChannels().catch(() => null),
    ]).then(([overview, lootData, chainData, bountyData, ocData, chatUnreadData, chatChannelsData]) => {
      api.status().then((s) => setStatus(s)).catch(() => {});

      if (overview) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const members = ((overview as any).members || []) as Record<string, unknown>[];
        const total = members.length;
        const online = members.filter(m => {
          const la = getLastActionStr(m).toLowerCase();
          return la.includes('online') || la.match(/^\d+\s+second/) || (la.match(/^(\d+)\s+minute/) && parseInt(la) <= 5);
        }).length;
        const hospital = members.filter(m => getStatusStr(m).toLowerCase().includes('hospital')).length;
        const traveling = members.filter(m => {
          const s = getStatusStr(m).toLowerCase();
          return s.includes('travel') || s.includes('abroad');
        }).length;
        const onWall = members.filter(m => !!m.is_on_wall).length;
        setMemberCounts({ total, online, hospital, traveling, onWall });
      }

      if (lootData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const npcs = (lootData as any).npcs as LootNPC[] || [];
        const best = npcs.reduce((a: LootNPC | null, b: LootNPC) =>
          !a || b.level > a.level ? b : a, null);
        setTopLoot(best);
      }

      if (chainData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cd = chainData as any;
        setChainCount(cd.total_chains || 0);
        setAttackCount(cd.attacks_in_db || 0);
      }

      if (bountyData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bd = bountyData as any;
        const bounties = bd.bounties || [];
        const easy = bounties.filter((b: { threat_label: string }) => b.threat_label === 'easy').length;
        setEasyBounties(easy);
        setBountyValue(bd.total_value || 0);
      }

      if (ocData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const od = ocData as any;
        const crimes = od.crimes || [];
        setOcTotal(crimes.length);
        // Count crimes where all participants have planning_complete
        const ready = crimes.filter((c: { participants: { planning_complete: boolean }[] }) =>
          c.participants.length > 0 && c.participants.every((p: { planning_complete: boolean }) => p.planning_complete)
        ).length;
        setOcReady(ready);
      }

      if (chatUnreadData) {
        setChatUnread(chatUnreadData as { channels: Record<string, number>; total: number });
      }
      if (chatChannelsData) {
        const nameMap: Record<number, string> = {};
        for (const ch of (chatChannelsData as { channels: { id: number; name: string }[] }).channels) {
          nameMap[ch.id] = ch.name;
        }
        setChatChannelNames(nameMap);
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

        {chatUnread && chatUnread.total > 0 && !chatBannerDismissed && (
          <div className="flex items-center gap-3 bg-torn-blue/10 border border-torn-blue/30 rounded-xl px-4 py-3">
            <span className="text-lg">💬</span>
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
                <span className="text-2xl">💰</span>
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
                <span className="text-2xl">🕴️</span>
              </div>
            </Widget>
          )}
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
              <span>{link.icon}</span>
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
