/**
 * Browser-side Sentry/Glitchtip integration (Sprint 2 #13).
 *
 * Lazy-loaded so the SDK only ships to clients when NEXT_PUBLIC_SENTRY_DSN is
 * set at build time. PII filter mirrors the backend (api/observability.py):
 * Torn API keys, auth headers, cookies, and any field whose name looks like a
 * secret get redacted before transmission.
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

export const __test_only_scrubValue = scrubValue;
