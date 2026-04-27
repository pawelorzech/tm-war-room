'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { useSort } from '@/hooks/useSort';

interface Special {
  name: string;
  effect: string;
  cost: number;
  rating_required: number;
}

interface CompanyType {
  id: number;
  name: string;
  cost: number;
  default_employees: number;
  positions: { name: string; special_ability?: string }[];
  stock: { name: string; cost: number; rrp: number }[];
  specials: Special[];
}

interface FactionCompany {
  company_id: number;
  company_name: string;
  company_type: number;
  members: { player_id: number; player_name: string; position: string }[];
}

type SpecialFilter = 'all' | 'energy' | 'items' | 'passive';

function safeSpecials(specials: unknown): Special[] {
  if (Array.isArray(specials)) return specials;
  if (specials && typeof specials === 'object') return Object.values(specials);
  return [];
}

function classifySpecial(s: Special): 'energy' | 'items' | 'passive' {
  const e = s.effect.toLowerCase();
  if (e.includes('energy') || e.includes('nerve') || e.includes('happy')) return 'energy';
  if (e.includes('item') || e.includes('drug') || e.includes('weapon') || e.includes('car') || e.includes('bomb') || e.includes('ammo') || e.includes('virus') || e.includes('salt') || e.includes('molotov')) return 'items';
  return 'passive';
}

const FILTER_COLORS: Record<SpecialFilter, string> = {
  all: 'bg-text-secondary/20 text-text-primary',
  energy: 'bg-torn-green/20 text-torn-green',
  items: 'bg-torn-blue/20 text-torn-blue',
  passive: 'bg-purple-500/20 text-purple-400',
};

const SPECIAL_BADGE: Record<string, string> = {
  energy: 'bg-torn-green/15 text-torn-green',
  items: 'bg-torn-blue/15 text-torn-blue',
  passive: 'bg-purple-500/15 text-purple-400',
};

function formatCost(cost: number): string {
  if (cost >= 1e9) return `$${(cost / 1e9).toFixed(1)}B`;
  if (cost >= 1e6) return `$${(cost / 1e6).toFixed(1)}M`;
  if (cost >= 1e3) return `$${(cost / 1e3).toFixed(0)}K`;
  return `$${cost}`;
}

export default function CompanyPage() {
  const [catalog, setCatalog] = useState<CompanyType[]>([]);
  const [factionCompanies, setFactionCompanies] = useState<FactionCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [factionLoading, setFactionLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SpecialFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadCatalog = () => {
    setLoading(true);
    setError(null);
    api.companyCatalog()
      .then(d => setCatalog(d.companies.map(c => ({ ...c, specials: safeSpecials(c.specials), positions: Array.isArray(c.positions) ? c.positions : [], stock: Array.isArray(c.stock) ? c.stock : [] }))))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const loadFaction = () => {
    setFactionLoading(true);
    api.companyFaction()
      .then(d => setFactionCompanies(d.companies))
      .catch(() => {})
      .finally(() => setFactionLoading(false));
  };

  useEffect(() => { loadCatalog(); loadFaction(); }, []);

  const filtered = useMemo(() => {
    let result = catalog;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.specials.some(s => s.name.toLowerCase().includes(q) || s.effect.toLowerCase().includes(q))
      );
    }
    if (filter !== 'all') {
      result = result.filter(c => c.specials.some(s => classifySpecial(s) === filter));
    }
    return result;
  }, [catalog, search, filter]);

  const { sorted: sortedCompanies, sortCol, sortDir, toggle: toggleSort } = useSort(filtered, 'name');

  const catalogById = useMemo(() => {
    const map: Record<number, CompanyType> = {};
    for (const c of catalog) map[c.id] = c;
    return map;
  }, [catalog]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Company Specials</h1>
            <p className="text-text-secondary text-sm mt-1">Faction company overview and full specials directory.</p>
          </div>
          <RefreshButton onRefresh={() => { loadCatalog(); loadFaction(); }} />
        </div>

        <PageExplainer id="company" title="Companies — What's here?" bullets={[
          "Companies produce specials — bonus items, energy refills, or passive buffs. The specials you can use depend on your company's star rating and your Job Points (JP).",
          "JP are earned daily based on your work effectiveness. You can spend up to 100 JP per day on energy-granting specials. Passive specials are always active once the star requirement is met.",
          "New employees have a 72-hour recruit cooldown before they can use specials. Plan your company switches around this.",
          "Coordinate with faction members — having people spread across different companies gives the faction access to more specials. Check who works where in the faction section above the directory.",
          "Best starter companies for new players: Sweet Shop (energy drinks from job points) or Adult Novelties (E-DVDs for happy jumps).",
          "To run your own company: buy TGP + TCP stocks first, and complete the Business Management education course.",
          "Company specials can be very valuable — always ask about specials and pay before joining.",
          "City/NPC jobs give work stats needed for passives (reviving, spying) — consider doing these first.",
        ]}
        dataSources={["Torn API /torn?selections=companies", "Member job data from stored API keys"]}
        links={[
          ["Torn Wiki: Companies", "https://wiki.torn.com/wiki/Company"],
          ["Torn Wiki: Company Specials", "https://wiki.torn.com/wiki/Company/Special_List"],
          ["Torn Wiki: Jobs", "https://wiki.torn.com/wiki/Jobs"],
        ]}
        />

        {/* Faction Companies */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Our Faction&apos;s Companies</h2>
          {factionLoading ? (
            <CardSkeleton count={2} />
          ) : factionCompanies.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {factionCompanies.map(fc => {
                const catalogEntry = catalogById[fc.company_type];
                return (
                  <div key={fc.company_id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-text-primary text-sm">{fc.company_name}</h3>
                      <span className="text-[10px] text-text-muted">{fc.members.length} member{fc.members.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {fc.members.map(m => (
                        <a key={m.player_id}
                          href={`https://www.torn.com/profiles.php?XID=${m.player_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="px-2 py-0.5 text-xs rounded-full bg-bg-elevated text-text-secondary hover:text-torn-green transition-colors">
                          {m.player_name} <span className="text-text-muted">({m.position})</span>
                        </a>
                      ))}
                    </div>
                    {catalogEntry && catalogEntry.specials.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-border-light">
                        {catalogEntry.specials.map(s => (
                          <span key={s.name} className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${SPECIAL_BADGE[classifySpecial(s)]}`}>
                            {s.name} ({s.rating_required}★)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-muted text-sm">
              No faction company data available. Members need to have registered API keys.
            </div>
          )}
        </div>

        {/* Company Directory */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Company Directory</h2>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search companies or specials..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg bg-bg-elevated border border-text-secondary/20 text-text-primary placeholder-text-muted focus:border-torn-green/50 focus:outline-none w-48"
            />
            <div className="flex gap-1">
              {(['all', 'energy', 'items', 'passive'] as SpecialFilter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2 py-1 text-[10px] rounded font-medium transition-colors capitalize ${
                    filter === f ? FILTER_COLORS[f] : 'text-text-muted hover:text-text-secondary'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              <button onClick={() => toggleSort('name')}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${sortCol === 'name' ? 'bg-torn-green/20 text-torn-green' : 'text-text-muted hover:text-text-secondary'}`}>
                Name {sortCol === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </button>
              <button onClick={() => toggleSort('cost')}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${sortCol === 'cost' ? 'bg-torn-green/20 text-torn-green' : 'text-text-muted hover:text-text-secondary'}`}>
                Cost {sortCol === 'cost' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </button>
            </div>
          </div>

          {loading ? (
            <CardSkeleton count={6} />
          ) : error ? (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
          ) : (
            <div className="grid gap-2">
              {sortedCompanies.map(c => (
                <div key={c.id}
                  className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden transition-colors hover:border-text-secondary/30">
                  <button
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    className="w-full p-3 text-left flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-text-primary">{c.name}</span>
                        <span className="text-[10px] text-text-muted">{formatCost(c.cost)}</span>
                        <span className="text-[10px] text-text-muted">{c.default_employees} emp</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.specials.map(s => (
                          <span key={s.name} className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${SPECIAL_BADGE[classifySpecial(s)]}`}>
                            {s.name} ({s.rating_required}★, {s.cost}JP)
                          </span>
                        ))}
                        {c.specials.length === 0 && (
                          <span className="text-[10px] text-text-muted">No specials</span>
                        )}
                      </div>
                    </div>
                    <span className="text-text-muted text-xs shrink-0">{expandedId === c.id ? '▼' : '▶'}</span>
                  </button>

                  {expandedId === c.id && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border-light pt-3">
                      {c.specials.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase mb-1">Specials</p>
                          <div className="space-y-1">
                            {c.specials.map(s => (
                              <div key={s.name} className="flex items-center gap-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded font-medium ${SPECIAL_BADGE[classifySpecial(s)]}`}>
                                  {s.rating_required}★
                                </span>
                                <span className="font-medium text-text-primary">{s.name}</span>
                                <span className="text-text-muted">— {s.effect}</span>
                                <span className="text-text-muted ml-auto">{s.cost} JP</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {c.positions.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase mb-1">Positions</p>
                          <div className="flex flex-wrap gap-1">
                            {c.positions.map(p => (
                              <span key={p.name} className="px-2 py-0.5 text-[10px] rounded bg-bg-elevated text-text-secondary">
                                {p.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {c.stock.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase mb-1">Products</p>
                          <div className="flex flex-wrap gap-1">
                            {c.stock.map(s => (
                              <span key={s.name} className="px-2 py-0.5 text-[10px] rounded bg-bg-elevated text-text-secondary">
                                {s.name} (${s.cost} → ${s.rrp})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {sortedCompanies.length === 0 && (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-muted text-sm">
                  No companies match your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
