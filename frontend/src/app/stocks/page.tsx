'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { StatCardsSkeleton, TableSkeleton } from '@/components/layout/LoadingSkeleton';

const StockPriceChart = dynamic(
  () => import('@/components/stocks/StockPriceChart').then(m => ({ default: m.StockPriceChart })),
  { ssr: false, loading: () => <div className="h-48 bg-bg-card rounded-lg animate-pulse" /> }
);

/* ── Types ── */

interface MarketStock {
  id: number;
  name: string;
  acronym: string;
  current_price: number;
  market_cap: number;
  total_shares: number;
  investors: number;
  benefit_type: string;
  benefit_desc: string;
  benefit_requirement: number;
}

interface Holding {
  stock_id: number;
  name: string;
  acronym: string;
  total_shares: number;
  current_price: number;
  current_value: number;
  cost_basis: number;
  profit: number;
  profit_pct: number;
  benefit_ready: boolean;
  benefit_progress: number;
  benefit_frequency: number;
  dividend_ready: boolean;
  dividend_progress: number;
  dividend_frequency: number;
}

interface PortfolioData {
  holdings: Holding[];
  count: number;
  total_value: number;
  total_cost: number;
  total_profit: number;
  total_profit_pct: number;
}

type Tab = 'portfolio' | 'market' | 'recommendations';

const CHART_PERIODS = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: 365 },
] as const;

/* ── Helpers ── */

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function profitClass(n: number): string {
  if (n > 0) return 'text-torn-green';
  if (n < 0) return 'text-danger';
  return 'text-text-muted';
}

interface StockROI {
  stock_id: number;
  acronym: string;
  name: string;
  benefit_desc: string;
  increment: number;
  shares_required: number;
  cost_total: number;
  payout_value: number;
  payout_freq_days: number;
  daily_value: number;
  days_to_breakeven: number;
  roi_annual_pct: number;
  owned_shares: number;
  shares_needed: number;
  cost_remaining: number;
  days_remaining: number;
  is_active: boolean;
}

/* ── Component ── */

export default function StocksPage() {
  const [tab, setTab] = useState<Tab>('portfolio');
  const [market, setMarket] = useState<MarketStock[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStock, setSelectedStock] = useState<{ id: number; name: string; acronym: string } | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ price: number; recorded_at: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartDays, setChartDays] = useState(30);
  const [roiData, setRoiData] = useState<StockROI[]>([]);

  const ownedIds = useMemo(() => {
    if (!portfolio) return new Set<number>();
    return new Set(portfolio.holdings.map(h => h.stock_id));
  }, [portfolio]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stockMarket(),
      api.stockPortfolio().catch(() => null),
      api.stockROI().catch(() => null),
    ]).then(([m, p, r]) => {
      const md = m as { stocks: MarketStock[] };
      setMarket(md.stocks);
      if (p) setPortfolio(p as PortfolioData);
      if (r) setRoiData((r as { recommendations: StockROI[] }).recommendations || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadChart = useCallback((id: number, days: number) => {
    setChartLoading(true);
    api.stockHistory(id, days)
      .then(d => setPriceHistory((d as { prices: { price: number; recorded_at: number }[] }).prices))
      .catch(() => setPriceHistory([]))
      .finally(() => setChartLoading(false));
  }, []);

  const selectStock = (id: number, name: string, acronym: string) => {
    if (selectedStock?.id === id) {
      setSelectedStock(null);
      setPriceHistory([]);
      return;
    }
    setSelectedStock({ id, name, acronym });
    setChartDays(30);
    loadChart(id, 30);
  };

  const changeChartPeriod = (days: number) => {
    setChartDays(days);
    if (selectedStock) {
      loadChart(selectedStock.id, days);
    }
  };

  const filteredMarket = search
    ? market.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.acronym.toLowerCase().includes(search.toLowerCase()))
    : market;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Stock Tracker</h1>
            <p className="text-text-secondary text-sm mt-1">Portfolio, market, and investment recommendations.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="stocks" title="Stock Tracker — How to use this" bullets={[
          "Torn stocks are about BENEFITS, not price trading. Each company offers a unique passive perk (free items, stat boosts, bank interest, etc.) when you hold enough shares.",
          "PORTFOLIO tab shows your current holdings with profit/loss. MARKET tab shows all stocks. RECOMMENDATIONS tab suggests what to buy next based on cheapest benefit cost.",
          "Click any stock row to see its price chart. Use the period selector (1D/7D/30D/90D) to spot trends and time your purchases.",
          "Stocks marked 'OWNED' in the market tab are ones you already hold. Green 'ACTIVE' means you have enough shares for the benefit.",
        ]}
        dataSources={["Torn API v2 stock market prices", "Your portfolio from Torn API via your key", "Historical prices collected every 30min"]}
        links={[["Torn Wiki: Stock Market", "https://wiki.torn.com/wiki/Stock_Market"]]}
        />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {([['portfolio', 'Portfolio'], ['market', 'Market'], ['recommendations', 'What to Buy']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key as Tab); setSearch(''); }}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-torn-green text-torn-green' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Price chart panel */}
        {selectedStock && (
          <div className="bg-bg-card border border-torn-green/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                <span className="text-torn-green">{selectedStock.acronym}</span>
                <span className="text-text-secondary ml-1">{selectedStock.name}</span>
              </h3>
              <div className="flex items-center gap-2">
                {/* Period selector */}
                <div className="flex gap-1">
                  {CHART_PERIODS.map(p => (
                    <button key={p.days} onClick={() => changeChartPeriod(p.days)}
                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                        chartDays === p.days
                          ? 'bg-torn-green/20 text-torn-green font-semibold'
                          : 'bg-bg-elevated text-text-muted hover:text-text-secondary'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSelectedStock(null); setPriceHistory([]); }}
                  className="text-xs text-text-muted hover:text-text-primary ml-2">Close</button>
              </div>
            </div>
            {chartLoading ? (
              <div className="h-48 bg-bg-elevated rounded-lg animate-pulse" />
            ) : (
              <StockPriceChart prices={priceHistory} name={selectedStock.acronym} />
            )}
          </div>
        )}

        {loading ? (
          <>
            <StatCardsSkeleton count={4} />
            <TableSkeleton rows={6} cols={7} />
          </>
        ) : tab === 'portfolio' ? (
          /* ── Portfolio ── */
          portfolio && portfolio.holdings.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="Total Value" value={fmtMoney(portfolio.total_value)} />
                <SummaryCard label="Total Cost" value={fmtMoney(portfolio.total_cost)} />
                <SummaryCard label="Profit/Loss" value={`${portfolio.total_profit >= 0 ? '+' : ''}${fmtMoney(portfolio.total_profit)}`}
                  className={profitClass(portfolio.total_profit)} />
                <SummaryCard label="Return" value={`${portfolio.total_profit_pct >= 0 ? '+' : ''}${portfolio.total_profit_pct.toFixed(1)}%`}
                  className={profitClass(portfolio.total_profit_pct)} />
              </div>

              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">Stock</th>
                        <th className="py-2 px-3 text-right">Shares</th>
                        <th className="py-2 px-3 text-right">Price</th>
                        <th className="py-2 px-3 text-right">Value</th>
                        <th className="py-2 px-3 text-right">P/L</th>
                        <th className="py-2 px-3 text-right">Return</th>
                        <th className="py-2 px-3">Benefit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.holdings.map(h => (
                        <tr key={h.stock_id} onClick={() => selectStock(h.stock_id, h.name, h.acronym)}
                          className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors cursor-pointer ${selectedStock?.id === h.stock_id ? 'bg-torn-green/5' : ''}`}>
                          <td className="py-1.5 px-3">
                            <span className="font-semibold">{h.acronym}</span>
                            <span className="ml-1.5 text-text-muted text-xs">{h.name}</span>
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{h.total_shares.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPrice(h.current_price)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-medium">{fmtMoney(h.current_value)}</td>
                          <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${profitClass(h.profit)}`}>
                            {h.profit >= 0 ? '+' : ''}{fmtMoney(h.profit)}
                          </td>
                          <td className={`py-1.5 px-3 text-right tabular-nums ${profitClass(h.profit_pct)}`}>
                            {h.profit_pct >= 0 ? '+' : ''}{h.profit_pct.toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-3">
                            {h.benefit_ready ? (
                              <span className="text-torn-green text-xs font-semibold">Ready!</span>
                            ) : h.benefit_frequency > 0 ? (
                              <span className="text-text-muted text-xs">{h.benefit_progress}/{h.benefit_frequency}d</span>
                            ) : null}
                            {h.dividend_ready && (
                              <span className="ml-1 text-torn-yellow text-xs font-semibold">Div!</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
              No stock holdings found. Buy stocks on the <a href="https://www.torn.com/stockexchange.php" target="_blank" className="text-torn-green hover:underline">Torn Stock Exchange</a>.
            </div>
          )
        ) : tab === 'recommendations' ? (
          /* ── ROI Recommendations ── */
          <div className="space-y-4">
            <div className="bg-torn-green/5 border border-torn-green/20 rounded-lg p-3">
              <p className="text-sm font-medium text-text-primary">Investment advisor — sorted by ROI</p>
              <p className="text-xs text-text-secondary mt-1">
                Ranked by annual return on investment. &ldquo;Days to payback&rdquo; = how long until the benefit pays for itself.
                Higher ROI% = better investment. Buy the top non-active stock first.
              </p>
            </div>

            {roiData.length > 0 ? (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Stock</th>
                        <th className="py-2 px-3 hidden md:table-cell">Benefit</th>
                        <th className="py-2 px-3 text-right">Payout</th>
                        <th className="py-2 px-3 text-right">Cost</th>
                        <th className="py-2 px-3 text-right">Payback</th>
                        <th className="py-2 px-3 text-right">ROI</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roiData.map((r, i) => (
                        <tr key={`${r.stock_id}-${r.increment}`} onClick={() => selectStock(r.stock_id, r.name, r.acronym)}
                          className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors cursor-pointer ${
                            r.is_active ? 'opacity-50' : ''
                          } ${selectedStock?.id === r.stock_id ? 'bg-torn-green/5' : ''}`}>
                          <td className="py-1.5 px-3 text-text-muted text-xs">
                            {r.is_active ? '—' : i + 1}
                          </td>
                          <td className="py-1.5 px-3">
                            <span className="font-semibold">{r.acronym}</span>
                            {r.increment > 1 && <span className="text-text-muted text-[10px] ml-0.5">x{r.increment}</span>}
                            <span className="ml-1.5 text-text-muted text-xs hidden sm:inline">{r.name}</span>
                          </td>
                          <td className="py-1.5 px-3 text-xs text-text-secondary max-w-[180px] truncate hidden md:table-cell">{r.benefit_desc}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary text-xs">
                            {fmtMoney(r.payout_value)}<span className="text-text-muted">/{r.payout_freq_days}d</span>
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-xs">
                            {r.cost_remaining > 0 ? fmtMoney(r.cost_remaining) : (
                              <span className="text-torn-green">$0</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-medium">
                            {r.is_active ? '—' : (
                              <span className={r.days_remaining < 365 ? 'text-torn-green' : r.days_remaining < 730 ? 'text-torn-yellow' : 'text-text-secondary'}>
                                {Math.round(r.days_remaining)}d
                              </span>
                            )}
                          </td>
                          <td className={`py-1.5 px-3 text-right tabular-nums font-bold ${
                            r.roi_annual_pct > 30 ? 'text-torn-green' : r.roi_annual_pct > 15 ? 'text-torn-yellow' : 'text-text-secondary'
                          }`}>
                            {r.roi_annual_pct.toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-3">
                            {r.is_active ? (
                              <span className="px-1.5 py-0.5 text-[10px] rounded font-bold bg-torn-green/15 text-torn-green">ACTIVE</span>
                            ) : r.owned_shares > 0 ? (
                              <span className="px-1.5 py-0.5 text-[10px] rounded font-bold bg-torn-yellow/15 text-torn-yellow">PARTIAL</span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[10px] rounded font-bold bg-bg-elevated text-text-muted">BUY</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                No stock data available.
              </div>
            )}

            <p className="text-[10px] text-text-muted text-center">
              ROI = annual return %. Payback = days until benefit pays for the shares. Payout values estimated from market prices.
            </p>
          </div>
        ) : (
          /* ── Market ── */
          <>
            <input type="text" placeholder="Search stocks..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full max-w-sm bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

            <p className="text-xs text-text-muted">{filteredMarket.length} stocks</p>

            {filteredMarket.length > 0 ? (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">Stock</th>
                        <th className="py-2 px-3 text-right">Price</th>
                        <th className="py-2 px-3 text-right">Market Cap</th>
                        <th className="py-2 px-3 text-right">Investors</th>
                        <th className="py-2 px-3">Benefit</th>
                        <th className="py-2 px-3 text-right">Req. Shares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMarket.map(s => {
                        const isOwned = ownedIds.has(s.id);
                        const holding = portfolio?.holdings.find(h => h.stock_id === s.id);
                        const benefitActive = holding ? holding.total_shares >= s.benefit_requirement && s.benefit_requirement > 0 : false;
                        return (
                        <tr key={s.id} onClick={() => selectStock(s.id, s.name, s.acronym)}
                          className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors cursor-pointer ${selectedStock?.id === s.id ? 'bg-torn-green/5' : ''}`}>
                          <td className="py-1.5 px-3">
                            <a href={`https://www.torn.com/stockexchange.php#stock=${s.acronym}`} target="_blank"
                              className="text-text-primary hover:text-torn-green transition-colors">
                              <span className="font-semibold">{s.acronym}</span>
                              <span className="ml-1.5 text-text-muted text-xs">{s.name}</span>
                            </a>
                            {benefitActive && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded font-bold bg-torn-green/15 text-torn-green">ACTIVE</span>
                            )}
                            {isOwned && !benefitActive && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded font-bold bg-torn-yellow/15 text-torn-yellow">OWNED</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPrice(s.current_price)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{fmtMoney(s.market_cap)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{s.investors.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs max-w-[200px] truncate">{s.benefit_desc || '—'}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-muted">
                            {s.benefit_requirement > 0 ? s.benefit_requirement.toLocaleString() : '—'}
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
                No stocks found.
              </div>
            )}
          </>
        )}

        <p className="text-[10px] text-text-muted text-center">
          Data: Torn API v2 stock market + your portfolio · Prices updated every 30min
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-lg p-3 text-center">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`text-xl font-bold ${className || 'text-text-primary'}`}>{value}</p>
    </div>
  );
}
