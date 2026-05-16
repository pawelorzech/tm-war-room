"use client";

// 7×24 activity heatmap — UTC weekday (Mon..Sun) × hour of day.
//
// Data model: bins is a dense 7×24 matrix of total online_seconds across the
// last 14 days, supplied by GET /api/activity/{player_id}. Cell shade scales
// to the matrix max so the most-active hour is full-saturation and zero
// cells stay near background. Hover surfaces raw seconds + the UTC slot.
//
// This is intentionally an inline SVG with hand-rolled cells — no charting
// dep — because the matrix is fixed-shape and we already paid for chart.js
// once on the dashboard. ~2 KB of TSX beats ~30 KB of chart config.

import { useMemo } from "react";

interface ActivityHeatmapProps {
  bins: number[][]; // 7 rows × 24 cols, Mon=0..Sun=6, UTC hour 0..23
  mostActiveWindow: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Cell sizing for the SVG — fits comfortably inside a card column on
// desktop and scales down via viewBox on mobile.
const CELL = 14;
const GAP = 2;
const LABEL_W = 32;
const LABEL_H = 14;
const GRID_W = 24 * (CELL + GAP) - GAP;
const GRID_H = 7 * (CELL + GAP) - GAP;
const TOTAL_W = LABEL_W + GRID_W;
const TOTAL_H = LABEL_H + GRID_H + 16; // +16 for hour-axis ticks

function shade(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "rgba(110, 118, 129, 0.10)"; // empty bg
  // Smooth ramp on the Torn blue accent (matches the rest of the app).
  // Floor alpha at 0.18 so non-zero cells stay perceptible.
  const ratio = value / max;
  const alpha = 0.18 + 0.72 * ratio;
  return `rgba(88, 166, 255, ${alpha.toFixed(3)})`;
}

function fmtSecondsHuman(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function ActivityHeatmap({ bins, mostActiveWindow }: ActivityHeatmapProps) {
  const { max, total } = useMemo(() => {
    let mx = 0;
    let tt = 0;
    for (const day of bins) {
      for (const v of day) {
        if (v > mx) mx = v;
        tt += v;
      }
    }
    return { max: mx, total: tt };
  }, [bins]);

  if (total <= 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-surface p-4 text-sm text-text-muted">
        <div className="font-medium text-text-secondary mb-1">Activity heatmap</div>
        <p className="text-xs">
          No activity recorded yet. New tracking — give it 24h.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-3 sm:p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-1 mb-3">
        <h3
          className="text-sm font-semibold text-text-primary cursor-help"
          title="Activity heatmap — 7 days x 24 UTC hours, sampled by TM Hub scheduler every 5 min, retained 14 days"
        >
          Activity heatmap
        </h3>
        <span
          className="text-[11px] text-text-muted cursor-help"
          title="Source: 14-day activity history (last_action.timestamp polled every 5 min from Torn API)"
        >
          UTC · last 14 days
        </span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
          preserveAspectRatio="xMinYMin meet"
          className="block max-w-full h-auto"
          role="img"
          aria-label={`Activity heatmap, most active ${mostActiveWindow}`}
        >
          {/* Hour-axis ticks (every 6h) */}
          {[0, 6, 12, 18].map((h) => (
            <text
              key={`hx-${h}`}
              x={LABEL_W + h * (CELL + GAP) + CELL / 2}
              y={LABEL_H - 4}
              fontSize={9}
              fill="#8b949e"
              textAnchor="middle"
            >
              {h.toString().padStart(2, "0")}
            </text>
          ))}

          {/* Day labels + cells */}
          {bins.map((day, dIdx) => (
            <g key={`r-${dIdx}`}>
              <text
                x={LABEL_W - 6}
                y={LABEL_H + dIdx * (CELL + GAP) + CELL - 3}
                fontSize={10}
                fill="#8b949e"
                textAnchor="end"
              >
                {DAYS[dIdx]}
              </text>
              {day.map((value, hIdx) => (
                <rect
                  key={`c-${dIdx}-${hIdx}`}
                  x={LABEL_W + hIdx * (CELL + GAP)}
                  y={LABEL_H + dIdx * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={shade(value, max)}
                >
                  <title>
                    {`${DAYS[dIdx]} ${hIdx.toString().padStart(2, "0")}:00 UTC — ${fmtSecondsHuman(value)} (${value}s)`}
                  </title>
                </rect>
              ))}
            </g>
          ))}

          {/* Bottom hour-axis labels (every 6h, repeated at the bottom for readability) */}
          {[0, 6, 12, 18, 24].map((h) => (
            <text
              key={`hb-${h}`}
              x={LABEL_W + Math.min(h, 23) * (CELL + GAP) + (h === 24 ? CELL : CELL / 2)}
              y={LABEL_H + GRID_H + 12}
              fontSize={9}
              fill="#8b949e"
              textAnchor="middle"
            >
              {h.toString().padStart(2, "0")}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs flex-wrap gap-2">
        <div className="text-text-secondary">
          <span className="text-text-muted">Most active:</span>{" "}
          <span className="text-torn-blue font-semibold tabular-nums">{mostActiveWindow}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-muted">
          <span>less</span>
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: shade(0, 1) }} />
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: shade(0.25, 1) }} />
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: shade(0.5, 1) }} />
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: shade(0.75, 1) }} />
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: shade(1, 1) }} />
          <span>more</span>
        </div>
      </div>
    </div>
  );
}
