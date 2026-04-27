// k6 load test — TM Hub hot endpoints baseline.
//
// Run:
//   X_PLAYER_ID=2362436 \
//   AUTH_TOKEN=eyJ... \
//   BASE_URL=https://hub.tri.ovh \
//   k6 run --vus 20 --duration 60s ops/k6/dashboard-load.js
//
// Outputs k6 default summary + per-endpoint trend stats. Capture summary JSON:
//   k6 run --summary-export Plans/perf-baseline-2026-04-27/k6-summary.json ...

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8000";
const PID = __ENV.X_PLAYER_ID || "0";
const TOKEN = __ENV.AUTH_TOKEN || "";

const endpoints = [
  { path: "/api/dashboard", weight: 5 },
  { path: "/api/team", weight: 3 },
  { path: "/api/stocks/portfolio", weight: 2 },
  { path: "/api/loot", weight: 2 },
  { path: "/api/awards/me", weight: 1 },
];

const trends = Object.fromEntries(
  endpoints.map((e) => [e.path, new Trend(`endpoint_${e.path.replace(/[^a-z]/gi, "_")}_ms`, true)])
);

// Weighted random pick.
const totalWeight = endpoints.reduce((s, e) => s + e.weight, 0);
function pickEndpoint() {
  let r = Math.random() * totalWeight;
  for (const e of endpoints) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return endpoints[0];
}

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
  },
};

export default function () {
  const e = pickEndpoint();
  const res = http.get(`${BASE}${e.path}`, {
    headers: {
      "X-Player-Id": PID,
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    tags: { endpoint: e.path },
  });
  trends[e.path].add(res.timings.duration);
  check(res, {
    "status 200": (r) => r.status === 200,
  });
  sleep(0.5 + Math.random() * 1.5);
}
