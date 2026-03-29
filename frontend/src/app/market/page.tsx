'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface MarketItem {
  id: number;
  name: string;
  type: string;
  market_value: number;
  buy_price: number;
  sell_price: number;
  circulation: number;
  profit_buy_sell: number;
  profit_margin_pct: number;
}

type SortCol = 'name' | 'market_value' | 'buy_price' | 'sell_price' | 'profit_buy_sell' | 'profit_margin_pct';
type Filter = 'top20' | 'all' | 'profitable' | 'tradeable';

function fmtMoney(n: number): string {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const MARKET_TAX = 0.0;  // Torn has no market tax currently, but we keep the toggle

export default function MarketPage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('top20');
  const [sortCol, setSortCol] = useState<SortCol>('profit_buy_sell');
  const [sortAsc, setSortAsc] = useState(false);
  const [taxPct, setTaxPct] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    api.marketPrices()
      .then(d => {
        const data = d as { items: MarketItem[] };
        setItems(data.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Get unique item types
  const types = [...new Set(items.map(i => i.type).filter(Boolean))].sort();

  // Compute display list
  const displayItems = (() => {
    let list = items;

    // Type filter
    if (typeFilter) list = list.filter(i => i.type === typeFilter);

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }

    // Filter
    if (filter === 'top20') {
      list = list.filter(i => i.profit_buy_sell > 0 && i.buy_price > 0);
      list.sort((a, b) => b.profit_buy_sell - a.profit_buy_sell);
      list = list.slice(0, 20);
      return list; // Skip further sorting for top20
    } else if (filter === 'profitable') {
      list = list.filter(i => {
        const netProfit = i.profit_buy_sell * (1 - taxPct / 100);
        return netProfit > 0;
      });
    } else if (filter === 'tradeable') {
      list = list.filter(i => i.market_value > 0 && i.buy_price > 0);
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      if (sortCol === 'name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      va = a[sortCol] ?? 0;
      vb = b[sortCol] ?? 0;
      return sortAsc ? va - vb : vb - va;
    });

    return list;
  })();

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const SortArrow = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-0.5 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Market Scanner</h1>
            <p className="text-text-secondary text-sm mt-1">
              All Torn items with profit calculations.
              <span className="ml-2 text-text-muted">({items.length} items loaded)</span>
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="market" title="Market Scanner — What's here?" bullets={[
          "All Torn items with market value, NPC buy/sell prices.",
          "Profit = market value - NPC buy price (buy from NPC, sell on market).",
          "Filter by profitable items only, search by name, filter by type.",
          "Tax toggle simulates a sell fee to show net profit.",
          "Data cached 5 min from Torn API.",
        ]} />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-[200px] bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

          <div className="flex gap-1">
            {([['top20', 'Top 20 Profit'], ['profitable', 'All Profitable'], ['tradeable', 'Tradeable'], ['all', 'All Items']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filter === key ? 'bg-torn-green/20 text-torn-green font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
                {label}
              </button>
            ))}
          </div>

          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-bg-card border border-text-secondary/20 rounded-lg px-2 py-1 text-xs text-text-primary">
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Tax toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted">Tax:</span>
            {[0, 2, 5, 10].map(t => (
              <button key={t} onClick={() => setTaxPct(t)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${taxPct === t ? 'bg-torn-yellow/20 text-torn-yellow font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
                {t}%
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-text-muted">{displayItems.length} items shown{taxPct > 0 && ` (${taxPct}% tax applied)`}</p>

        {loading ? (
          <p className="text-text-secondary text-sm animate-pulse">Loading market data...</p>
        ) : displayItems.length > 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('name')}>
                      Item<SortArrow col="name" />
                    </th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('market_value')}>
                      Market<SortArrow col="market_value" />
                    </th>
                    <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('buy_price')}>
                      NPC Buy<SortArrow col="buy_price" />
                    </th>
                    <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('sell_price')}>
                      NPC Sell<SortArrow col="sell_price" />
                    </th>
                    <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('profit_buy_sell')}>
                      Profit{taxPct > 0 ? ' (net)' : ''}<SortArrow col="profit_buy_sell" />
                    </th>
                    <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('profit_margin_pct')}>
                      Margin<SortArrow col="profit_margin_pct" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.slice(0, 200).map(item => {
                    const netProfit = item.profit_buy_sell * (1 - taxPct / 100);
                    const netMargin = item.buy_price > 0 ? (netProfit / item.buy_price) * 100 : 0;
                    return (
                      <tr key={item.id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                        <td className="py-1.5 px-3 font-medium text-text-primary">
                          <a href={`https://www.torn.com/imarket.php#/p=shop&step=shop&type=&searchname=${encodeURIComponent(item.name)}`}
                            target="_blank" className="hover:text-torn-green transition-colors">
                            {item.name}
                          </a>
                        </td>
                        <td className="py-1.5 px-3 text-text-muted text-xs">{item.type}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{fmtMoney(item.market_value)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{fmtMoney(item.buy_price)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{fmtMoney(item.sell_price)}</td>
                        <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${netProfit > 0 ? 'text-torn-green' : netProfit < 0 ? 'text-danger' : 'text-text-muted'}`}>
                          {netProfit !== 0 ? `${netProfit > 0 ? '+' : ''}${fmtMoney(netProfit)}` : '—'}
                        </td>
                        <td className={`py-1.5 px-3 text-right tabular-nums text-xs ${netMargin > 0 ? 'text-torn-green' : 'text-text-muted'}`}>
                          {netMargin > 0 ? `${netMargin.toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {displayItems.length > 200 && (
              <p className="text-xs text-text-muted text-center py-2">Showing first 200 of {displayItems.length} items</p>
            )}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No items match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
