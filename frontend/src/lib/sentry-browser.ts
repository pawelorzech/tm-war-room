/**
 * Browser-side Sentry/Glitchtip integration (Sprint 2 #13).
 *
 * Lazy-loaded so the SDK only ships to clients when NEXT_PUBLIC_SENTRY_DSN is
 * set at build time. PII filter mirrors the backend (api/observability.py):
 * Torn API keys, auth headers, cookies, and any field whose name looks like a
 * secret get redacted before transmission.
 *
 * Upstream-noise filter mirrors api/observability.py:_is_upstream_noise: when
 * a handled `TypeError: Failed to fetch` (Chrome) / `NetworkError when
 * attempting to fetch resource` (Firefox) / `Load failed` (Safari) carries no
 * in-app stack frame, it's the browser-side equivalent of an httpx 5xx —
 * user lost network or closed the tab mid-poll. Drop it before transmission
 * so background polls (heartbeat, chat/unread) don't pollute the inbox.
 */

const TORN_KEY_RE = /\b[a-zA-Z0-9]{16}\b/g;
const REDACTED = "[Filtered]";
const SECRET_FIELD_NAMES = new Set([
  "key",
  "api_key",
  "apikey",
  "token",
  "password",
  "secret",
  "authorization",
  "cookie",
  "set-cookie",
  "x-mcp-token",
]);

interface SentryFrame {
  in_app?: boolean | null;
}

interface SentryException {
  type?: string;
  value?: string;
  mechanism?: { handled?: boolean };
  stacktrace?: { frames?: SentryFrame[] };
}

interface SentryEvent {
  exception?: { values?: SentryException[] };
}

function isUpstreamFetchNoise(event: SentryEvent): boolean {
  const exc = event.exception?.values?.[0];
  if (!exc || exc.type !== "TypeError") return false;
  const value = exc.value || "";
  const isFetchFail =
    value === "Failed to fetch" ||
    value.includes("NetworkError when attempting to fetch") ||
    value === "Load failed" ||
    value === "cancelled";
  if (!isFetchFail) return false;
  // Only drop explicitly-handled events. An unhandled `Failed to fetch`
  // might still mark a real bug worth seeing.
  if (exc.mechanism?.handled !== true) return false;
  // If any in-app frame is present, keep the event — that means our own
  // code is on the stack and could legitimately be the cause.
  const frames = exc.stacktrace?.frames || [];
  const hasInAppFrame = frames.some((f) => f.in_app === true);
  return !hasInAppFrame;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(TORN_KEY_RE, REDACTED);
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_FIELD_NAMES.has(k.toLowerCase()) ? REDACTED : scrubValue(v);
    }
    return out;
  }
  return value;
}

export async function initSentry(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  // Defer the SDK load — keeps the main bundle small.
  const Sentry = await import("@sentry/browser");
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || "production",
    release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        if (isUpstreamFetchNoise(event as SentryEvent)) return null;
        return scrubValue(event) as typeof event;
      } catch {
        return null;
      }
    },
    beforeSendTransaction(event) {
      try {
        return scrubValue(event) as typeof event;
      } catch {
        return null;
      }
    },
  });
}

export async function reportError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Sentry SDK unavailable or scrub failed — silently drop. The console
    // warning at the call site is the user-visible signal.
  }
}

export const __test_only_scrubValue = scrubValue;
export const __test_only_isUpstreamFetchNoise = isUpstreamFetchNoise;
