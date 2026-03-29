# Awards Circulation Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chart.js line chart to the `/awards/detail` page showing how an award's circulation changes over time.

**Architecture:** Frontend-only feature. The backend API endpoint (`GET /api/awards/circulation/{kind}/{award_id}`) and daily data collection already exist. We create a `CirculationChart` component using `react-chartjs-2` (same pattern as `StockPriceChart`), add an API client method, and wire it into the detail page with a period selector.

**Tech Stack:** React 19, Chart.js via react-chartjs-2, Next.js 15 dynamic import

---

### Task 1: Add API client method for circulation data

**Files:**
- Modify: `frontend/src/lib/api-client.ts`

- [ ] **Step 1: Add `awardCirculation` method to the api object**

In `frontend/src/lib/api-client.ts`, add after the `awardDetail` line (line 65):

```typescript
  awardCirculation: (kind: string, id: number, days?: number) =>
    apiFetch<{ award_id: number; kind: string; history: { snapshot_date: string; circulation: number }[]; count: number }>(
      `/api/awards/circulation/${kind}/${id}${days ? `?days=${days}` : ''}`
    ),
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api-client.ts
git -c commit.gpgsign=false commit -m "feat: add awardCirculation API client method"
```

---

### Task 2: Create CirculationChart component

**Files:**
- Create: `frontend/src/components/awards/CirculationChart.tsx`

- [ ] **Step 1: Create the CirculationChart component**

Create `frontend/src/components/awards/CirculationChart.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface CirculationPoint {
  snapshot_date: string;
  circulation: number;
}

export function CirculationChart({ history }: { history: CirculationPoint[] }) {
  // API returns DESC order, reverse for chronological display
  const sorted = useMemo(() => [...history].reverse(), [history]);

  const data = useMemo(() => {
    const labels = sorted.map(p => {
      const d = new Date(p.snapshot_date + 'T00:00:00');
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    return {
      labels,
      datasets: [{
        label: 'Circulation',
        data: sorted.map(p => p.circulation),
        borderColor: '#3fb950',
        backgroundColor: 'rgba(63,185,80,0.1)',
        borderWidth: 2,
        pointRadius: sorted.length > 50 ? 0 : 3,
        fill: true,
        tension: 0.3,
      }],
    };
  }, [sorted]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useMemo((): any => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => `${(ctx.raw as number).toLocaleString()} players`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#484f58', maxTicksLimit: 10 },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
      y: {
        ticks: {
          color: '#484f58',
          callback: (v: number | string) => Number(v).toLocaleString(),
        },
        grid: { color: 'rgba(48,54,61,0.3)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  }), []);

  if (sorted.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-text-muted text-sm">
        Circulation tracking started recently. Check back in a few days for trend data.
      </div>
    );
  }

  return (
    <div className="h-48">
      <Line data={data} options={options} />
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/awards/CirculationChart.tsx
git -c commit.gpgsign=false commit -m "feat: CirculationChart component with Chart.js line chart"
```

---

### Task 3: Wire CirculationChart into awards detail page

**Files:**
- Modify: `frontend/src/app/awards/detail/page.tsx`

- [ ] **Step 1: Add circulation state and fetching to AwardDetailContent**

In `frontend/src/app/awards/detail/page.tsx`, add the dynamic import after the existing imports (after line 6):

```typescript
import dynamic from 'next/dynamic';

const CirculationChart = dynamic(
  () => import('@/components/awards/CirculationChart').then(m => ({ default: m.CirculationChart })),
  { ssr: false, loading: () => <div className="h-48 bg-bg-card rounded-lg animate-pulse" /> }
);
```

- [ ] **Step 2: Add circulation state and period selector inside AwardDetailContent**

Inside the `AwardDetailContent` function (after the existing `error` state on line 47), add:

```typescript
  const [circulationHistory, setCirculationHistory] = useState<{ snapshot_date: string; circulation: number }[]>([]);
  const [circulationDays, setCirculationDays] = useState(30);
```

Update the `load` callback to also fetch circulation data. Replace the existing `load` callback (lines 49-57) with:

```typescript
  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.awardDetail(kind, id)
      .then(d => setData(d as AwardDetail))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [kind, id]);

  const loadCirculation = useCallback(() => {
    if (!id) return;
    api.awardCirculation(kind, id, circulationDays)
      .then(d => setCirculationHistory(d.history))
      .catch(() => {});
  }, [kind, id, circulationDays]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCirculation(); }, [loadCirculation]);
```

Remove the existing `useEffect(() => { load(); }, [load]);` on line 59 since it's now included above.

- [ ] **Step 3: Add the chart section to the JSX**

After the external links `div` (after line 146 — the closing `</div>` of the links section), add the circulation chart section:

```tsx
          {/* Circulation trend */}
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Circulation Trend</h2>
              <div className="flex gap-1">
                {[7, 30, 90, 365].map(d => (
                  <button key={d} onClick={() => setCirculationDays(d)}
                    className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                      circulationDays === d
                        ? 'bg-torn-green/20 text-torn-green'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}>
                    {d === 365 ? 'All' : `${d}d`}
                  </button>
                ))}
              </div>
            </div>
            <CirculationChart history={circulationHistory} />
          </div>
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/awards/detail/page.tsx
git -c commit.gpgsign=false commit -m "feat: circulation trend chart on award detail page with period selector"
```

---

### Task 4: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/ -v`
Expected: All 213+ tests pass (no backend changes, but verify nothing broke).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Static export succeeds.

- [ ] **Step 3: Commit if any fixes were needed, otherwise done**
