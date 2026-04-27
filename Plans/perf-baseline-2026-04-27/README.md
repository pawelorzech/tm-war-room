# Perf Baseline — 2026-04-27 (Sprint 1)

This folder collects measurements **before** Sprint 1 changes hit production.
Re-run all commands after each Sprint and diff against this baseline.

Reference plan: `Plans/performance-optimization-review-playful-penguin.md`.

## Pre-Sprint-1 deploy state

What's already live BEFORE this Sprint:
- Single uvicorn worker (`start.sh:5`)
- nginx proxy_cache 60s, no `Cache-Control` ignore (so private responses skip cache)
- No Web Vitals listener
- Plain text request logs
- No `/health` endpoint
- No `.dockerignore`
- Sequential await loop in `/api/company/director/faction`

## What Sprint 1 changes

1. `.dockerignore` added → smaller build context.
2. `/health` endpoint added → Coolify can probe DB-level liveness.
3. Web Vitals listener wired → LCP/INP/CLS shipped to Umami as `webvital-*` events.
4. JSON request log line per `/api/*` request → enables jq aggregation.
5. nginx ignores `Cache-Control` so private responses cache (60s default).
6. nginx access_log includes `cache=$upstream_cache_status` → hit ratio observable.
7. `/api/company/director/faction` parallelized (was sequential per faction key).
8. CLAUDE.md updated to current reality (Next 16, 498 tests, 11 scheduler jobs).

## Commands to capture baseline

### Frontend — Lighthouse

```bash
mkdir -p Plans/perf-baseline-2026-04-27/lighthouse
npx -y @lhci/cli@latest collect \
  --url=https://hub.tri.ovh/dashboard \
  --url=https://hub.tri.ovh/team \
  --url=https://hub.tri.ovh/training \
  --url=https://hub.tri.ovh/stocks \
  --url=https://hub.tri.ovh/awards \
  --numberOfRuns=3 \
  --settings.preset=mobile \
  --settings.throttling.cpuSlowdownMultiplier=4
# Outputs to .lighthouseci/ — copy summary to Plans/perf-baseline-2026-04-27/lighthouse/
```

Capture `summary.json` per URL with median LCP/INP/CLS/TTFB/FCP.

### Backend — k6

Get a session token first (login via UI, copy from devtools `tm_session` cookie).

```bash
X_PLAYER_ID=2362436 \
AUTH_TOKEN=<token> \
BASE_URL=https://hub.tri.ovh \
k6 run --summary-export Plans/perf-baseline-2026-04-27/k6-summary.json \
  --vus 20 --duration 60s \
  ops/k6/dashboard-load.js
```

### Backend — request log p50/p95/p99 (after this Sprint deploys, when JSON logs are live)

```bash
docker logs hub-tri-ovh 2>&1 | grep -F '"event":"req"' | \
  jq -s 'group_by(.path) | map({
    path: .[0].path,
    n: length,
    p50: (sort_by(.elapsed_ms)[(length*0.5|floor)].elapsed_ms),
    p95: (sort_by(.elapsed_ms)[(length*0.95|floor)].elapsed_ms),
    p99: (sort_by(.elapsed_ms)[(length*0.99|floor)].elapsed_ms)
  }) | sort_by(-.p95)' \
  > Plans/perf-baseline-2026-04-27/request-percentiles.json
```

### Cache hit ratio (nginx access log)

```bash
docker logs hub-tri-ovh 2>&1 | grep -oE 'cache=[A-Z]+' | sort | uniq -c \
  > Plans/perf-baseline-2026-04-27/cache-status.txt
```

### Container resource usage during load

```bash
docker stats hub-tri-ovh --no-stream --format \
  '{"cpu_perc":"{{.CPUPerc}}","mem":"{{.MemUsage}}"}' \
  > Plans/perf-baseline-2026-04-27/docker-stats.json
```

### Bundle size

```bash
cd frontend && du -sh out/ .next/ \
  > ../Plans/perf-baseline-2026-04-27/bundle-size.txt
```

## Acceptance criteria for Sprint 1

| Metric | Pre-Sprint-1 (baseline) | Post-Sprint-1 target |
|--------|-------------------------|----------------------|
| `/api/company/director/faction` p95 | ? (capture in baseline) | ≤ 50% of baseline |
| Web Vitals events in Umami | 0 | LCP/INP/CLS visible after 24h prod |
| `cache=HIT` ratio (nginx access log) | ? | ≥ 30% (was likely ~0% with Cache-Control: private) |
| Docker build context size | ? | −30% with `.dockerignore` |
| `/health` 200 from Coolify | n/a | green |
