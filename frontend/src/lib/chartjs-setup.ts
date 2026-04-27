/**
 * Sprint 2 #8 — single Chart.js plugin registration shared across all charts.
 *
 * Before this file every chart component imported and registered the chart.js
 * primitives it needed individually. With 7 chart components Next.js's chunk
 * splitter often ended up emitting chart.js code paths in multiple chunks.
 *
 * Now every chart component does:
 *   import "@/lib/chartjs-setup";
 *   import { Bar } from "react-chartjs-2";
 *
 * Side-effect import: the registration runs once at module evaluation. All
 * primitives needed by any chart we ship are registered here, so individual
 * components no longer call `ChartJS.register(...)`. The registry is global on
 * the chart.js instance, so duplicate registration would be a no-op anyway —
 * the win is consolidating chart.js into one shared chunk.
 */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);
