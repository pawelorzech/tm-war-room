'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCompanyDirector } from '@/hooks/useCompanyDirector';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { CompanyTrendsChart } from '@/components/company/CompanyTrendsChart';
import type {
  CompanyEmployee,
  CompanyApplication,
  CompanyStockItem,
  CompanyTrendRow,
  CompanyStockTrendRow,
  DirectorNewsEntry,
} from '@/types/company-director';

type Tab = 'overview' | 'employees' | 'applications' | 'stock' | 'news' | 'trends' | 'faction';

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
    me, faction, news, trends,
    loading, newsLoading, trendsLoading, error,
    refresh, loadNews, loadTrends,
  } = useCompanyDirector();
  const [tab, setTab] = useState<Tab>('overview');
  const [trendsDays, setTrendsDays] = useState<number>(30);

  const isDirector = me?.is_director === true;

  useEffect(() => {
    if (tab === 'trends' && isDirector && !trends && !trendsLoading) {
      loadTrends(trendsDays);
    }
  }, [tab, isDirector, trends, trendsLoading, trendsDays, loadTrends]);

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

  const TABS: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'overview', label: 'Overview', disabled: !isDirector },
    { id: 'employees', label: `Employees${employees.length ? ` (${employees.length})` : ''}`, disabled: !isDirector },
    { id: 'applications', label: `Applications${applications.length ? ` (${applications.length})` : ''}`, disabled: !isDirector },
    { id: 'stock', label: 'Stock', disabled: !isDirector },
    { id: 'news', label: 'News', disabled: !isDirector },
    { id: 'trends', label: 'Trends', disabled: !isDirector },
    { id: 'faction', label: 'TM Companies' },
  ];

  // If viewer is not a director and is on a director-only tab, redirect to faction
  const effectiveTab: Tab = !isDirector && tab !== 'faction' ? 'faction' : tab;

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

        {!loading && !isDirector && (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-sm text-text-secondary">
            <strong className="text-text-primary">Not a director.</strong> Director
            selections require a director&apos;s own API key. Meanwhile, see
            what companies our faction runs below — the benchmark tab is open
            to everyone.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-text-secondary/15 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => !t.disabled && setTab(t.id)}
              disabled={t.disabled}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                effectiveTab === t.id
                  ? 'text-torn-green border-b-2 border-torn-green'
                  : t.disabled
                    ? 'text-text-muted/40 cursor-not-allowed'
                    : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <CardSkeleton count={4} />
        ) : (
          <>
            {effectiveTab === 'overview' && isDirector && me?.detailed && (
              <OverviewTab me={me} />
            )}

            {effectiveTab === 'employees' && isDirector && (
              <EmployeesTab employees={employees} />
            )}

            {effectiveTab === 'applications' && isDirector && (
              <ApplicationsTab applications={applications} />
            )}

            {effectiveTab === 'stock' && isDirector && (
              <StockTab stockItems={stockItems} />
            )}

            {effectiveTab === 'news' && isDirector && (
              <NewsTab
                news={news?.news ?? null}
                loading={newsLoading}
                onLoad={() => loadNews({ limit: 100 })}
              />
            )}

            {effectiveTab === 'trends' && isDirector && (
              <TrendsTab
                companyRows={trends?.company ?? []}
                stockRows={trends?.stock ?? []}
                loading={trendsLoading}
                days={trendsDays}
                onDaysChange={(d) => {
                  setTrendsDays(d);
                  loadTrends(d);
                }}
              />
            )}

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
                    target="_blank"
                    rel="noopener"
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

function ApplicationsTab({ applications }: { applications: [string, CompanyApplication][] }) {
  if (applications.length === 0) {
    return <div className="text-text-muted text-sm">No pending applications.</div>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {applications.map(([id, a]) => (
        <div key={id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <a
              href={`https://www.torn.com/profiles.php?XID=${a.userID}`}
              target="_blank"
              rel="noopener"
              className="font-semibold hover:text-torn-green"
            >
              {a.name}
            </a>
            <span className="text-[10px] text-text-muted">Lvl {a.level}</span>
          </div>
          {a.stats && (
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className="bg-bg-elevated rounded px-2 py-1">
                <div className="text-text-muted uppercase">Man</div>
                <div className="text-text-primary font-semibold">{a.stats.manual_labor.toLocaleString()}</div>
              </div>
              <div className="bg-bg-elevated rounded px-2 py-1">
                <div className="text-text-muted uppercase">Int</div>
                <div className="text-text-primary font-semibold">{a.stats.intelligence.toLocaleString()}</div>
              </div>
              <div className="bg-bg-elevated rounded px-2 py-1">
                <div className="text-text-muted uppercase">End</div>
                <div className="text-text-primary font-semibold">{a.stats.endurance.toLocaleString()}</div>
              </div>
            </div>
          )}
          {a.message && (
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{a.message}</p>
          )}
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span className="uppercase">{a.status}</span>
            <span>expires {formatRelative(a.expires)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StockTab({ stockItems }: { stockItems: [string, CompanyStockItem][] }) {
  if (stockItems.length === 0) {
    return <div className="text-text-muted text-sm">No stock data.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted text-xs uppercase tracking-wide border-b border-text-secondary/15">
            <th className="py-2 px-2">Product</th>
            <th className="py-2 px-2 text-right">In stock</th>
            <th className="py-2 px-2 text-right">On order</th>
            <th className="py-2 px-2 text-right">Price</th>
            <th className="py-2 px-2 text-right">Cost</th>
            <th className="py-2 px-2 text-right">Margin</th>
            <th className="py-2 px-2 text-right">Sold (lifetime)</th>
          </tr>
        </thead>
        <tbody>
          {stockItems.map(([name, s]) => {
            const margin = s.price > 0 ? ((s.price - s.cost) / s.price) * 100 : 0;
            const marginClass = margin > 30 ? 'text-torn-green' : margin > 15 ? 'text-yellow-400' : 'text-danger';
            const stockClass = s.in_stock === 0 ? 'text-danger font-semibold' : 'text-text-primary';
            return (
              <tr key={name} className="border-b border-text-secondary/10">
                <td className="py-2 px-2 text-text-primary">{name}</td>
                <td className={`py-2 px-2 text-right ${stockClass}`}>{s.in_stock.toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-text-secondary">{s.on_order.toLocaleString()}</td>
                <td className="py-2 px-2 text-right">{formatMoney(s.price)}</td>
                <td className="py-2 px-2 text-right text-text-muted">{formatMoney(s.cost)}</td>
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
            dangerouslySetInnerHTML={{ __html: n.news }}
          />
        </div>
      ))}
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
                  target="_blank"
                  rel="noopener"
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
                  target="_blank"
                  rel="noopener"
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

