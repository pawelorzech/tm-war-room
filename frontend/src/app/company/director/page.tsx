'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import { useCompanyDirector } from '@/hooks/useCompanyDirector';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { CompanyTrendsChart } from '@/components/company/CompanyTrendsChart';
import type {
  CompanyEmployee,
  CompanyApplication,
  CompanyStockItem,
  CompanyStockRunwayResponse,
  CompanyTrendRow,
  CompanyStockTrendRow,
  DirectorNewsEntry,
  ApplicationsRankedResponse,
} from '@/types/company-director';
import { WeeklyComparisonView } from '@/components/company/WeeklyComparisonView';
import { TrainsAlertConfig } from '@/components/company/TrainsAlertConfig';

type Tab = 'overview' | 'employees' | 'applications' | 'stock' | 'news' | 'trends' | 'comparison' | 'faction';

function formatMoney(n: number | undefined | null): string {
  if (n == null) return '$—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatRelative(timestamp: number | undefined): string {
  if (!timestamp) return '—';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function CompanyDirectorPage() {
  const {
    me, faction, news, trends, stockRunway, ranked, comparison, pinned, trainsAlerts,
    loading, newsLoading, trendsLoading, stockRunwayLoading, rankedLoading, comparisonLoading, pinnedLoading, alertsLoading, error,
    refresh, loadNews, loadTrends, loadStockRunway, loadRanked,
    loadComparison, loadPinned, pinWeek, unpinWeek,
    loadTrainsAlerts, toggleTrainsAlert,
  } = useCompanyDirector();
  const [tab, setTab] = useState<Tab>('overview');
  const [trendsDays, setTrendsDays] = useState<number>(30);
  const [compareScope, setCompareScope] = useState<'same_type' | 'all'>('same_type');

  const isDirector = me?.is_director === true;

  useEffect(() => {
    if (tab === 'trends' && isDirector && !trends && !trendsLoading) {
      loadTrends(trendsDays);
    }
  }, [tab, isDirector, trends, trendsLoading, trendsDays, loadTrends]);

  useEffect(() => {
    if (tab === 'stock' && isDirector && !stockRunway && !stockRunwayLoading) {
      loadStockRunway();
    }
  }, [tab, isDirector, stockRunway, stockRunwayLoading, loadStockRunway]);

  useEffect(() => {
    if (tab === 'comparison' && isDirector && !comparison && !comparisonLoading) {
      loadComparison({ scope: compareScope });
      if (!pinned.length && !pinnedLoading) loadPinned();
    }
  }, [tab, isDirector, comparison, comparisonLoading, compareScope, loadComparison, pinned.length, pinnedLoading, loadPinned]);

  useEffect(() => {
    if (tab === 'employees' && isDirector && !trainsAlerts.length && !alertsLoading) {
      loadTrainsAlerts();
    }
  }, [tab, isDirector, trainsAlerts.length, alertsLoading, loadTrainsAlerts]);

  // Precompute sorted/derived lists
  const employees = useMemo(() => {
    if (!me?.employees) return [];
    return Object.entries(me.employees)
      .map(([id, e]): [string, CompanyEmployee] => [id, e])
      .sort(
        ([, a], [, b]) =>
          (b.effectiveness?.total ?? 0) - (a.effectiveness?.total ?? 0),
      );
  }, [me]);

  const applications = useMemo(() => {
    if (!me?.applications) return [];
    return Object.entries(me.applications)
      .map(([id, a]): [string, CompanyApplication] => [id, a]);
  }, [me]);

  const stockItems = useMemo(() => {
    if (!me?.stock) return [];
    return Object.entries(me.stock).map(([name, item]): [string, CompanyStockItem] => [name, item]);
  }, [me]);

  const factionCompanies = faction?.companies ?? [];

  const TABS: { id: Tab; label: string; directorOnly?: boolean }[] = [
    { id: 'overview', label: 'Overview', directorOnly: true },
    {
      id: 'employees',
      label: `Employees${isDirector && employees.length ? ` (${employees.length})` : ''}`,
      directorOnly: true,
    },
    {
      id: 'applications',
      label: `Applications${isDirector && applications.length ? ` (${applications.length})` : ''}`,
      directorOnly: true,
    },
    { id: 'stock', label: 'Stock', directorOnly: true },
    { id: 'news', label: 'News', directorOnly: true },
    { id: 'trends', label: 'Trends', directorOnly: true },
    { id: 'comparison', label: 'Comparison', directorOnly: true },
    { id: 'faction', label: 'TM Companies' },
  ];

  const effectiveTab: Tab = tab;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Company Director</h1>
            <p className="text-text-secondary text-sm mt-1">
              {isDirector && me?.company_name
                ? `Cockpit for ${me.company_name}`
                : 'Director cockpit — unlock with a director\'s key'}
            </p>
          </div>
          <RefreshButton onRefresh={refresh} />
        </div>

        <PageExplainer
          id="company-director"
          title="What is this?"
          bullets={[
            'Director-only dashboard: financials, employee effectiveness, applications pipeline, stock & sales, and a news feed — all pulled live from Torn.',
            'Popularity drives daily customers. Efficiency drives income per customer. Environment drives employee happiness (and effectiveness).',
            'Effectiveness is capped by addiction, inactivity, merits, director education, settled-in time, and working stats. Train your employees to boost their working stats component.',
            'Stock zero = lost sales. Watch in_stock vs. sold_amount to plan re-orders. Margin = (price − cost) / price.',
            'If you are not a director, scroll to "TM Companies" — it works for everyone and shows every company our faction runs.',
          ]}
          dataSources={[
            'Torn API /company/?selections=detailed,employees,applications,stock,news',
            'Torn API /company/{ID}?selections=profile',
          ]}
          links={[
            ['Torn Wiki: Companies', 'https://wiki.torn.com/wiki/Company'],
            ['Torn Wiki: Employee Effectiveness', 'https://wiki.torn.com/wiki/Company#Employee_effectiveness'],
          ]}
        />

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-text-secondary/15 overflow-x-auto">
          {TABS.map((t) => {
            const locked = t.directorOnly && !isDirector;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                  effectiveTab === t.id
                    ? 'text-torn-green border-b-2 border-torn-green'
                    : locked
                      ? 'text-text-muted hover:text-text-secondary'
                      : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {locked && <span className="text-[10px]" aria-hidden>🔒</span>}
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <CardSkeleton count={4} />
        ) : (
          <>
            {effectiveTab === 'overview' && (isDirector && me?.detailed
              ? <OverviewTab me={me} />
              : <DirectorTeaser tab="overview" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'employees' && (isDirector
              ? (
                <div className="space-y-4">
                  <EmployeesTab employees={employees} />
                  <TrainsAlertConfig
                    employees={employees}
                    alerts={trainsAlerts}
                    onToggle={toggleTrainsAlert}
                  />
                </div>
              )
              : <DirectorTeaser tab="employees" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'applications' && (isDirector
              ? <ApplicationsTab
                  applications={applications}
                  ranked={ranked}
                  rankedLoading={rankedLoading}
                  onRank={loadRanked}
                />
              : <DirectorTeaser tab="applications" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'stock' && (isDirector
              ? <StockTab
                  stockItems={stockItems}
                  runway={stockRunway}
                  runwayLoading={stockRunwayLoading}
                  onLoadRunway={loadStockRunway}
                />
              : <DirectorTeaser tab="stock" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'news' && (isDirector
              ? <NewsTab
                  news={news?.news ?? null}
                  loading={newsLoading}
                  onLoad={() => loadNews({ limit: 100 })}
                />
              : <DirectorTeaser tab="news" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'trends' && (isDirector
              ? <TrendsTab
                  companyRows={trends?.company ?? []}
                  stockRows={trends?.stock ?? []}
                  loading={trendsLoading}
                  days={trendsDays}
                  onDaysChange={(d) => {
                    setTrendsDays(d);
                    loadTrends(d);
                  }}
                />
              : <DirectorTeaser tab="trends" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'comparison' && (isDirector
              ? <WeeklyComparisonView
                  comparison={comparison}
                  comparisonLoading={comparisonLoading}
                  pinned={pinned}
                  scope={compareScope}
                  onScopeChange={(s) => { setCompareScope(s); loadComparison({ scope: s }); }}
                  onPinCurrent={async (label, note) => {
                    if (!comparison) return;
                    await pinWeek(comparison.week_start_ts, label, note);
                  }}
                  onUnpin={unpinWeek}
                  onReload={() => loadComparison({ scope: compareScope })}
                />
              : <DirectorTeaser tab="comparison" onSeeFaction={() => setTab('faction')} />)}

            {effectiveTab === 'faction' && (
              <FactionTab companies={factionCompanies} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Tab components ----------------

function Stat({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-muted flex items-center gap-1">
        {label}
        {help && <span title={help} className="cursor-help">ⓘ</span>}
      </div>
      <div className="text-xl font-semibold text-text-primary mt-1">{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function OverviewTab({ me }: { me: NonNullable<ReturnType<typeof useCompanyDirector>['me']> }) {
  const d = me.detailed!;
  const p = me.profile;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Company funds" value={formatMoney(d.company_funds)} help="Cash available for wages, orders, ads" />
      <Stat label="Company bank" value={formatMoney(d.company_bank)} help="Savings — earns daily interest" />
      <Stat label="Ad budget" value={formatMoney(d.advertising_budget)} help="Drives popularity which drives customers" />
      <Stat label="Company value" value={formatMoney(d.value)} help="Sale price if you sold the company today" />
      <Stat label="Popularity" value={d.popularity.toLocaleString()} help="Higher = more daily customers" />
      <Stat label="Efficiency" value={d.efficiency.toLocaleString()} help="Higher = more income per customer" />
      <Stat label="Environment" value={d.environment.toLocaleString()} help="Higher = happier employees → better effectiveness" />
      <Stat label="Trains available" value={String(d.trains_available)} help="Employee stat trainings you can spend today" />
      {p && <Stat label="Rating" value={`${p.rating}★`} sub={`${p.days_old}d old`} />}
      {p && <Stat label="Daily income" value={formatMoney(p.daily_income)} sub={`${p.daily_customers.toLocaleString()} customers`} />}
      {p && <Stat label="Weekly income" value={formatMoney(p.weekly_income)} sub={`${p.weekly_customers.toLocaleString()} customers`} />}
      {p && (
        <Stat
          label="Staffing"
          value={`${p.employees_hired} / ${p.employees_capacity}`}
          sub={p.employees_hired < p.employees_capacity ? 'Understaffed' : 'Full'}
        />
      )}
    </div>
  );
}

function EmployeesTab({ employees }: { employees: [string, CompanyEmployee][] }) {
  if (employees.length === 0) {
    return <div className="text-text-muted text-sm">No employees.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted text-xs uppercase tracking-wide border-b border-text-secondary/15">
            <th className="py-2 px-2">Name</th>
            <th className="py-2 px-2">Position</th>
            <th className="py-2 px-2 text-right">Effectiveness</th>
            <th className="py-2 px-2 text-right">Days</th>
            <th className="py-2 px-2 text-right">Wage</th>
            <th className="py-2 px-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(([id, e]) => {
            const eff = e.effectiveness?.total ?? 0;
            const effClass = eff >= 80 ? 'text-torn-green' : eff >= 60 ? 'text-yellow-400' : 'text-danger';
            return (
              <tr key={id} className="border-b border-text-secondary/10 hover:bg-bg-elevated/40">
                <td className="py-2 px-2">
                  <a
                    href={`https://www.torn.com/profiles.php?XID=${id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-text-primary hover:text-torn-green"
                  >
                    {e.name}
                  </a>
                </td>
                <td className="py-2 px-2 text-text-secondary">{e.position}</td>
                <td className={`py-2 px-2 text-right font-semibold ${effClass}`} title={
                  e.effectiveness
                    ? [
                        `working_stats: ${e.effectiveness.working_stats ?? 0}`,
                        `addiction: ${e.effectiveness.addiction ?? 0}`,
                        `inactivity: ${e.effectiveness.inactivity ?? 0}`,
                        `merits: ${e.effectiveness.merits ?? 0}`,
                        `director_education: ${e.effectiveness.director_education ?? 0}`,
                        `settled_in: ${e.effectiveness.settled_in ?? 0}`,
                      ].join('\n')
                    : ''
                }>
                  {eff}
                </td>
                <td className="py-2 px-2 text-right text-text-secondary">{e.days_in_company}</td>
                <td className="py-2 px-2 text-right text-text-secondary">{formatMoney(e.wage)}</td>
                <td className="py-2 px-2 text-text-muted text-xs">
                  {e.last_action?.status ?? '—'} · {e.last_action?.relative ?? ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationsTab({
  applications,
  ranked,
  rankedLoading,
  onRank,
}: {
  applications: [string, CompanyApplication][];
  ranked: ApplicationsRankedResponse | null;
  rankedLoading: boolean;
  onRank: () => void;
}) {
  const topIds = useMemo(() => {
    if (!ranked?.applicants) return new Set<number>();
    return new Set(ranked.applicants.slice(0, 3).map((a) => a.userID));
  }, [ranked]);

  if (applications.length === 0) {
    return <div className="text-text-muted text-sm">No pending applications.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          {ranked ? (
            <>
              Ranked by predicted efficiency across all positions (TornStats).
              {!ranked.tornstats_enabled && (
                <span className="text-yellow-400"> TornStats key not set — rankings unavailable.</span>
              )}
            </>
          ) : (
            <>Click below to predict each applicant&apos;s efficiency at every position using TornStats.</>
          )}
        </p>
        {!ranked && (
          <button
            onClick={onRank}
            disabled={rankedLoading}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30 disabled:opacity-50"
          >
            {rankedLoading ? 'Ranking…' : 'Rank applicants'}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(ranked?.applicants ?? applications.map(([, a]) => ({
          userID: a.userID,
          name: a.name,
          level: a.level,
          message: a.message,
          status: a.status,
          expires: a.expires,
          stats: a.stats ?? { manual_labor: 0, intelligence: 0, endurance: 0 },
          stats_hidden: !a.stats,
          efficiency: null,
          best_position: null,
          best_score: null,
        }))).map((a) => {
          const isTop = topIds.has(a.userID);
          return (
            <div
              key={a.userID}
              className={`bg-bg-card border rounded-xl p-3 space-y-2 ${
                isTop
                  ? 'border-torn-green/60 shadow-lg shadow-torn-green/10'
                  : 'border-text-secondary/15'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.torn.com/profiles.php?XID=${a.userID}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-semibold hover:text-torn-green"
                  >
                    {a.name}
                  </a>
                  {isTop && (
                    <span className="text-[10px] bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full font-semibold uppercase">
                      Top pick
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-text-muted">Lvl {a.level}</span>
              </div>

              {a.best_position && a.best_score != null && (
                <div className="bg-torn-green/10 border border-torn-green/20 rounded-lg px-2 py-1.5 text-xs">
                  Best as <strong className="text-torn-green">{a.best_position}</strong> · score{' '}
                  {a.best_score.toLocaleString()}
                </div>
              )}

              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div className="bg-bg-elevated rounded px-2 py-1">
                  <div className="text-text-muted uppercase">Man</div>
                  <div className="text-text-primary font-semibold">
                    {a.stats.manual_labor.toLocaleString()}
                  </div>
                </div>
                <div className="bg-bg-elevated rounded px-2 py-1">
                  <div className="text-text-muted uppercase">Int</div>
                  <div className="text-text-primary font-semibold">
                    {a.stats.intelligence.toLocaleString()}
                  </div>
                </div>
                <div className="bg-bg-elevated rounded px-2 py-1">
                  <div className="text-text-muted uppercase">End</div>
                  <div className="text-text-primary font-semibold">
                    {a.stats.endurance.toLocaleString()}
                  </div>
                </div>
              </div>
              {a.stats_hidden && (
                <p className="text-[10px] text-yellow-400">
                  Applicant hid their work stats — ranking skipped.
                </p>
              )}

              {a.message && (
                <p className="text-xs text-text-secondary whitespace-pre-wrap">{a.message}</p>
              )}

              <div className="flex items-center justify-between text-[10px] text-text-muted">
                <span className="uppercase">{a.status}</span>
                <span>expires {formatRelative(a.expires)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockTab({
  stockItems,
  runway,
  runwayLoading,
  onLoadRunway,
}: {
  stockItems: [string, CompanyStockItem][];
  runway: CompanyStockRunwayResponse | null;
  runwayLoading: boolean;
  onLoadRunway: () => void;
}) {
  const runwayByProduct = useMemo(() => {
    const m = new Map<string, CompanyStockRunwayResponse['products'][number]>();
    for (const item of runway?.products ?? []) m.set(item.product_name, item);
    return m;
  }, [runway]);

  const sortedStockItems = useMemo(() => {
    const priority: Record<string, number> = { shortage: 0, low: 1, ok: 2 };
    return stockItems.slice().sort(([nameA], [nameB]) => {
      const a = runwayByProduct.get(nameA);
      const b = runwayByProduct.get(nameB);
      const pa = priority[a?.status ?? 'ok'] ?? 9;
      const pb = priority[b?.status ?? 'ok'] ?? 9;
      if (pa !== pb) return pa - pb;
      if ((b?.shortage ?? 0) !== (a?.shortage ?? 0)) return (b?.shortage ?? 0) - (a?.shortage ?? 0);
      return nameA.localeCompare(nameB);
    });
  }, [stockItems, runwayByProduct]);

  const runwaySummary = useMemo(() => {
    const products = runway?.products ?? [];
    return {
      shortages: products.filter((p) => p.status === 'shortage').length,
      low: products.filter((p) => p.status === 'low').length,
      shortageUnits: products.reduce((sum, p) => sum + p.shortage, 0),
    };
  }, [runway]);

  if (stockItems.length === 0) {
    return <div className="text-text-muted text-sm">No stock data.</div>;
  }
  return (
    <div className="space-y-4">
      <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Stock runway to Sunday</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Uses sales pace since Monday 00:00 TCT and live in-stock + on-order counts.
            </p>
          </div>
          <button
            onClick={onLoadRunway}
            disabled={runwayLoading}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30 disabled:opacity-50"
          >
            {runwayLoading ? 'Checking...' : runway ? 'Refresh runway' : 'Check runway'}
          </button>
        </div>

        {runway ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-bg-elevated rounded px-2 py-1.5">
                <div className="text-text-muted">Shortage products</div>
                <div className="text-danger font-semibold">{runwaySummary.shortages}</div>
              </div>
              <div className="bg-bg-elevated rounded px-2 py-1.5">
                <div className="text-text-muted">Low buffer</div>
                <div className="text-yellow-400 font-semibold">{runwaySummary.low}</div>
              </div>
              <div className="bg-bg-elevated rounded px-2 py-1.5">
                <div className="text-text-muted">Missing units</div>
                <div className="text-text-primary font-semibold">{runwaySummary.shortageUnits.toLocaleString()}</div>
              </div>
              <div className="bg-bg-elevated rounded px-2 py-1.5">
                <div className="text-text-muted">Days left</div>
                <div className="text-text-primary font-semibold">{runway.days_remaining.toFixed(1)}</div>
              </div>
            </div>
            {!runway.history_complete && (
              <p className="text-[11px] text-yellow-400">
                Partial week: at least one product has no snapshot before Monday 00:00 TCT, so its average uses the earliest snapshot we have this week.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-text-muted">
            Runway will load automatically when this tab opens. It needs one or more stock snapshots to estimate the weekly pace.
          </p>
        )}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted text-xs uppercase tracking-wide border-b border-text-secondary/15">
              <th className="py-2 px-2">Product</th>
              <th className="py-2 px-2 text-right">Status</th>
              <th className="py-2 px-2 text-right">In stock</th>
              <th className="py-2 px-2 text-right">On order</th>
              <th className="py-2 px-2 text-right">Available</th>
              <th className="py-2 px-2 text-right">Sold since Mon</th>
              <th className="py-2 px-2 text-right">Avg/day</th>
              <th className="py-2 px-2 text-right">Need to Sunday</th>
              <th className="py-2 px-2 text-right">Shortage</th>
              <th className="py-2 px-2 text-right">Margin</th>
              <th className="py-2 px-2 text-right">Sold (lifetime)</th>
            </tr>
          </thead>
          <tbody>
            {sortedStockItems.map(([name, s]) => {
              const runwayItem = runwayByProduct.get(name);
              const margin = s.price > 0 ? ((s.price - s.cost) / s.price) * 100 : 0;
              const marginClass = margin > 30 ? 'text-torn-green' : margin > 15 ? 'text-yellow-400' : 'text-danger';
              const stockClass = s.in_stock === 0 ? 'text-danger font-semibold' : 'text-text-primary';
              const status = runwayItem?.status ?? 'ok';
              const statusClass = status === 'shortage'
                ? 'bg-danger/15 text-danger'
                : status === 'low'
                  ? 'bg-yellow-400/15 text-yellow-400'
                  : 'bg-torn-green/15 text-torn-green';
              return (
                <tr key={name} className={`border-b border-text-secondary/10 ${status === 'shortage' ? 'bg-danger/5' : status === 'low' ? 'bg-yellow-400/5' : ''}`}>
                  <td className="py-2 px-2 text-text-primary">{name}</td>
                  <td className="py-2 px-2 text-right">
                    {runwayItem ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold ${statusClass}`}>
                        {status === 'shortage' ? 'short' : status}
                      </span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                  <td className={`py-2 px-2 text-right ${stockClass}`}>{s.in_stock.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-text-secondary">{s.on_order.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-text-secondary">
                    {runwayItem?.available_stock.toLocaleString() ?? (s.in_stock + s.on_order).toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right text-text-secondary">
                    {runwayItem?.sold_since_monday.toLocaleString() ?? '-'}
                  </td>
                  <td className="py-2 px-2 text-right text-text-secondary">
                    {runwayItem ? runwayItem.avg_daily_sold.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'}
                  </td>
                  <td className="py-2 px-2 text-right text-text-secondary">
                    {runwayItem?.projected_until_sunday.toLocaleString() ?? '-'}
                  </td>
                  <td className={`py-2 px-2 text-right font-semibold ${runwayItem?.shortage ? 'text-danger' : 'text-text-muted'}`}>
                    {runwayItem ? runwayItem.shortage.toLocaleString() : '-'}
                  </td>
                  <td className={`py-2 px-2 text-right font-semibold ${marginClass}`}>{margin.toFixed(1)}%</td>
                  <td className="py-2 px-2 text-right text-text-secondary">
                    {s.sold_amount.toLocaleString()} · {formatMoney(s.sold_worth)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewsTab({
  news,
  loading,
  onLoad,
}: {
  news: DirectorNewsEntry[] | null;
  loading: boolean;
  onLoad: () => void;
}) {
  if (!news) {
    return (
      <button
        onClick={onLoad}
        className="px-3 py-1.5 text-sm rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30"
      >
        {loading ? 'Loading…' : 'Load news'}
      </button>
    );
  }
  if (news.length === 0) {
    return <div className="text-text-muted text-sm">No news.</div>;
  }
  return (
    <div className="space-y-2">
      {news.map((n) => (
        <div
          key={n.id}
          className="bg-bg-card border border-text-secondary/10 rounded-lg p-3 text-sm flex items-start gap-3"
        >
          <span className="text-[10px] text-text-muted shrink-0 mt-0.5 w-20">
            {formatRelative(n.timestamp)}
          </span>
          <span
            className="text-text-secondary flex-1 [&_a]:text-torn-green [&_a]:hover:underline"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(n.news, {
                ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'br', 'span'],
                ALLOWED_ATTR: ['href', 'title', 'class'],
                ALLOWED_URI_REGEXP: /^(?:(?:https?:\/\/)(?:www\.)?torn\.com\/|[^/:]+(?:\/|$))/,
              }),
            }}
          />
        </div>
      ))}
    </div>
  );
}

const TEASER_CONTENT: Record<Exclude<Tab, 'faction'>, {
  icon: string;
  title: string;
  blurb: string;
  bullets: string[];
}> = {
  overview: {
    icon: '📊',
    title: 'Company cockpit at a glance',
    blurb: 'For directors: live financial + operational dashboard pulled straight from Torn.',
    bullets: [
      'Company funds, bank balance, ad budget, total value',
      'Popularity, efficiency, environment — the three levers that drive income',
      'Trains available today + upgrade state',
      'Daily/weekly income + customer counts with staffing fill rate',
    ],
  },
  employees: {
    icon: '👥',
    title: 'Every employee, every effectiveness bucket',
    blurb: 'Sortable table of your team with the full effectiveness breakdown.',
    bullets: [
      'Name, position, wage, days in company',
      'Effectiveness total + sub-scores (addiction, inactivity, merits, director education, settled-in, working stats)',
      'Last action + online status',
      'Flag under-performers automatically (red when effectiveness < 60% or inactive > 3d)',
    ],
  },
  applications: {
    icon: '📮',
    title: 'Hire smarter, not harder',
    blurb: 'Every pending applicant — ranked by TornStats predicted efficiency at every position.',
    bullets: [
      'Applicant stats (man / int / end), level, personal message',
      'Auto-ranking via TornStats /efficiency — top-3 "Top pick" badges',
      '"Best as X" recommendation per applicant',
      'TornStats spy fallback if stats were hidden',
    ],
  },
  stock: {
    icon: '📦',
    title: 'Stock + sales intelligence',
    blurb: 'In-stock, on-order, sold-lifetime, margin %. Zero-stock alerts.',
    bullets: [
      'Per-product in_stock + on_order',
      'Cost vs. price → margin % with colour coding (green > 30%, red < 15%)',
      'Lifetime sold_amount + sold_worth',
      'Red highlight when in_stock = 0 (lost sales)',
    ],
  },
  news: {
    icon: '📰',
    title: 'Your company activity feed',
    blurb: 'Last 25 (up to 100) news events — hires, fires, trains, deposits, withdrawals.',
    bullets: [
      'Chronological timeline with relative timestamps',
      'Click any player reference to open their Torn profile',
      '"Load more" extends to 100 entries',
      'Audit trail for who did what and when',
    ],
  },
  trends: {
    icon: '📈',
    title: 'Daily time-series nobody else stores',
    blurb: 'We snapshot your company every day. After a week you have real trend charts.',
    bullets: [
      'Funds / bank / ad-budget over time',
      'Daily + weekly income trajectory',
      'Popularity / efficiency / environment — spot regressions',
      'Aggregated stock sales across all products',
    ],
  },
  comparison: {
    icon: '🏆',
    title: 'Compare your week against every other company',
    blurb: 'Weekly ranking against every class-10 company we track — anchored to Mon 18:00 TCT, not Torn\'s rolling 7-day blur.',
    bullets: [
      'Rank within your company type + overall (all class-10)',
      'Pin any past week (e.g. "Halloween 2025") to overlay in future comparisons',
      'Your own anchored weekly sales (diff from daily stock snapshots)',
      'Rival data = Torn public rolling 7-day (only metric exposed for other companies)',
    ],
  },
};

function DirectorTeaser({
  tab,
  onSeeFaction,
}: {
  tab: Exclude<Tab, 'faction'>;
  onSeeFaction: () => void;
}) {
  const c = TEASER_CONTENT[tab];
  return (
    <div className="space-y-4">
      <div className="bg-torn-green/5 border border-torn-green/20 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <span className="text-4xl shrink-0">{c.icon}</span>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-text-primary">{c.title}</h2>
              <span className="text-[10px] uppercase tracking-wider bg-torn-green/20 text-torn-green px-2 py-0.5 rounded-full font-semibold">
                Directors only
              </span>
            </div>
            <p className="text-sm text-text-secondary">{c.blurb}</p>
          </div>
        </div>
        <ul className="space-y-1.5 pl-4">
          {c.bullets.map((b, i) => (
            <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
              <span className="text-torn-green mt-0.5 shrink-0">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">How to unlock</h3>
        <ol className="text-sm text-text-secondary space-y-1.5 list-decimal list-inside">
          <li>
            Be a director of a Torn company. See{' '}
            <a
              href="https://wiki.torn.com/wiki/Company"
              target="_blank" rel="noopener noreferrer"
              className="text-torn-green hover:underline"
            >
              Torn Wiki: Companies
            </a>{' '}
            for how to buy or take over one.
          </li>
          <li>
            Link your director&apos;s API key in{' '}
            <Link href="/settings" className="text-torn-green hover:underline">
              Settings
            </Link>
            . This tool calls the limited-access director selections using your own key — no
            other member can see your company data.
          </li>
        </ol>
        <div className="pt-2 flex flex-wrap gap-2">
          <button
            onClick={onSeeFaction}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/20 text-torn-green hover:bg-torn-green/30 font-medium"
          >
            See TM Companies →
          </button>
          <a
            href="/company"
            className="px-3 py-1.5 text-xs rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary"
          >
            Browse all company types
          </a>
        </div>
      </div>
    </div>
  );
}

function TrendsTab({
  companyRows,
  stockRows,
  loading,
  days,
  onDaysChange,
}: {
  companyRows: CompanyTrendRow[];
  stockRows: CompanyStockTrendRow[];
  loading: boolean;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  // Aggregate stock rows per day (sum sold_amount/sold_worth across products)
  const stockAggregate = useMemo(() => {
    const byDate = new Map<string, { sold_amount: number; sold_worth: number; in_stock: number }>();
    for (const r of stockRows) {
      const d = r.snapshot_date;
      const entry = byDate.get(d) ?? { sold_amount: 0, sold_worth: 0, in_stock: 0 };
      entry.sold_amount += r.sold_amount ?? 0;
      entry.sold_worth += r.sold_worth ?? 0;
      entry.in_stock += r.in_stock ?? 0;
      byDate.set(d, entry);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([snapshot_date, v]) => ({ snapshot_date, ...v }));
  }, [stockRows]);

  if (loading) {
    return <CardSkeleton count={2} />;
  }

  if (companyRows.length === 0) {
    return (
      <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-muted text-sm">
        No snapshots yet — the daily collector started with this release. Come back tomorrow for your first data point. After a week or two you&apos;ll see meaningful trends.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Window:</span>
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-2 py-1 rounded transition-colors ${
                days === d
                  ? 'bg-torn-green/20 text-torn-green'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {d === 365 ? '1y' : `${d}d`}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-text-muted">{companyRows.length} data points</span>
      </div>

      <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Financials</h3>
        <CompanyTrendsChart
          rows={companyRows}
          metrics={['company_funds', 'company_bank', 'advertising_budget']}
        />
      </section>

      <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Income & customers</h3>
        <CompanyTrendsChart rows={companyRows} metrics={['daily_income', 'weekly_income']} />
      </section>

      <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Operational health</h3>
        <CompanyTrendsChart
          rows={companyRows}
          metrics={['popularity', 'efficiency', 'environment']}
        />
      </section>

      {stockAggregate.length > 0 && (
        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Stock (summed across products)
          </h3>
          <CompanyTrendsChart
            rows={stockAggregate.map((r) => ({
              snapshot_date: r.snapshot_date,
              company_funds: r.sold_worth,
              company_bank: null,
              advertising_budget: null,
              popularity: r.in_stock,
              efficiency: null,
              environment: null,
              daily_income: null,
              weekly_income: null,
              employees_hired: null,
            }))}
            metrics={['company_funds', 'popularity']}
          />
          <p className="text-[10px] text-text-muted">
            Green = total sold value (lifetime, cumulative). Purple = units in stock across all products.
          </p>
        </section>
      )}
    </div>
  );
}

function FactionTab({ companies }: { companies: import('@/types/company-director').FactionCompanyEntry[] }) {
  if (companies.length === 0) {
    return <div className="text-text-muted text-sm">No TM company data yet. Members need registered API keys.</div>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {companies.map((c) => {
        const p = c.profile;
        return (
          <div key={c.company_id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <a
                  href={`https://www.torn.com/joblist.php#!p=corpinfo&ID=${c.company_id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-text-primary hover:text-torn-green"
                >
                  {p?.name ?? c.company_name}
                </a>
                {p && (
                  <div className="text-[10px] text-text-muted">
                    {p.rating}★ · {p.days_old}d old
                  </div>
                )}
              </div>
              <span className="text-[10px] text-text-muted shrink-0">
                {p ? `${p.employees_hired}/${p.employees_capacity}` : `${c.members.length} member${c.members.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {p && (
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="bg-bg-elevated rounded px-2 py-1">
                  <div className="text-text-muted">Daily</div>
                  <div className="text-text-primary font-semibold">{formatMoney(p.daily_income)}</div>
                </div>
                <div className="bg-bg-elevated rounded px-2 py-1">
                  <div className="text-text-muted">Weekly</div>
                  <div className="text-text-primary font-semibold">{formatMoney(p.weekly_income)}</div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1 pt-1 border-t border-border-light">
              {c.members.map((m) => (
                <a
                  key={m.player_id}
                  href={`https://www.torn.com/profiles.php?XID=${m.player_id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-2 py-0.5 text-[10px] rounded-full bg-bg-elevated text-text-secondary hover:text-torn-green"
                >
                  {m.player_name} <span className="text-text-muted">({m.position})</span>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
