"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePDA } from "@/contexts/PDAContext";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, login } = useAuth();
  const { isPDA } = usePDA();
  const pathname = usePathname();
  // /extension-auth is the connect-from-userscript handoff page. Strip the
  // full TM Hub branding card down to a focused "Connect TM Hub Companion"
  // copy so the flow feels like one step, not "log into hub + then mint a
  // token for the extension".
  const isCompanionHandoff = pathname === "/extension-auth";
  const [apiKey, setApiKey] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg-primary gap-4">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full bg-torn-green"
            style={{ animation: "tm-pulse-dot 1.2s ease-in-out infinite" }}
          />
          <span
            className="inline-block w-2 h-2 rounded-full bg-torn-green"
            style={{ animation: "tm-pulse-dot 1.2s ease-in-out 0.2s infinite" }}
          />
          <span
            className="inline-block w-2 h-2 rounded-full bg-torn-green"
            style={{ animation: "tm-pulse-dot 1.2s ease-in-out 0.4s infinite" }}
          />
        </div>
        <span className="text-text-muted text-xs tracking-wide uppercase">Loading</span>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary px-4">
        {/* Subtle radial glow behind the card */}
        <div className="relative w-full max-w-sm">
          <div className="absolute -inset-20 bg-torn-green/[0.03] rounded-full blur-3xl pointer-events-none" />

          <div className="relative w-full p-8 bg-bg-surface border border-border rounded-xl shadow-[0_0_40px_-12px_rgba(63,185,80,0.1)]">
            {/* Branding */}
            <div className="text-center mb-6">
              <h1
                className="text-2xl font-extrabold tracking-tight text-torn-green"
                style={{ animation: "tm-glow-pulse 3s ease-in-out infinite" }}
              >
                {isCompanionHandoff ? "Connect Companion" : "TM Hub"}
              </h1>
              <p className="text-text-secondary text-xs mt-1 tracking-wide">
                {isCompanionHandoff
                  ? "One step — we'll wire up the userscript and bring you back to Torn."
                  : "The Masters Faction Toolkit"}
              </p>
            </div>

            {/* Divider */}
            <div className="w-12 h-px bg-torn-green/30 mx-auto mb-6" />

            {/* API-key onboarding — visible BEFORE the input so first-timers
                (especially in Torn PDA) don't get stuck with no key copied. */}
            <div className="mb-5 rounded-lg border border-torn-green/30 bg-bg-primary p-4">
              <p className="text-text-primary text-sm font-semibold">Need a Torn API key?</p>
              <p className="text-text-muted text-xs mt-1 leading-relaxed">
                TM Hub needs a <span className="text-torn-green font-semibold">Full Access</span> key from torn.com. Limited / Minimal keys will show incomplete data.
              </p>
              <a
                href="https://www.torn.com/preferences.php#tab=api"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block w-full text-center py-2.5 rounded-lg border border-torn-green/40 bg-bg-surface text-torn-green text-sm font-semibold hover:bg-torn-green/10 transition-colors"
              >
                Open Torn → API Keys ↗
              </a>
              <ol className="mt-3 text-text-muted text-[11px] space-y-0.5 list-decimal list-inside leading-relaxed">
                <li>Tap to open Torn → API Keys.</li>
                <li>Create a key with <span className="text-text-secondary">Full Access</span>.</li>
                <li>Come back here and paste it below.</li>
              </ol>
              {isPDA && (
                <p className="mt-2 text-text-muted text-[11px] leading-relaxed">
                  Tip: in Torn PDA, long-press the generated key on the API page → Copy.
                </p>
              )}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setSubmitting(true);
                try {
                  const result = await login(apiKey, rememberMe);
                  if (result?.access_level === "limited") {
                    setWarning(`Your API key has limited access. Some features (${result.limited_features?.join(", ") || "stocks, etc"}) may not work. Use a Full Access key for all features.`);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to register key");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="block text-text-secondary text-[11px] uppercase tracking-wider font-medium mb-1.5">
                Paste your Torn API key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your Full Access API key"
                disabled={submitting}
                className="w-full px-3 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:border-torn-green focus:outline-none transition-all duration-200 focus:[animation:tm-focus-ring_0.3s_ease-out_forwards] disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              />
              <label className="flex items-center gap-2 mt-3 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={submitting}
                  className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-xs text-text-secondary group-hover:text-torn-green transition-colors">
                  Stay logged in <span className="text-text-muted">(90 days, refreshes with use)</span>
                </span>
              </label>
              <button
                type="submit"
                disabled={submitting || !apiKey}
                className="w-full mt-3 py-2.5 bg-torn-green-dim text-white rounded-lg text-sm font-semibold hover:bg-torn-green hover:shadow-[0_0_20px_-4px_rgba(63,185,80,0.4)] disabled:opacity-40 disabled:hover:shadow-none disabled:hover:bg-torn-green-dim transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-white"
                      style={{ animation: "tm-pulse-dot 1s ease-in-out infinite" }}
                    />
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-white"
                      style={{ animation: "tm-pulse-dot 1s ease-in-out 0.15s infinite" }}
                    />
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-white"
                      style={{ animation: "tm-pulse-dot 1s ease-in-out 0.3s infinite" }}
                    />
                    <span>Validating</span>
                  </span>
                ) : (
                  "Login"
                )}
              </button>
              {error && (
                <p className="mt-3 text-torn-red text-xs text-center bg-torn-red/10 rounded-md py-1.5 px-2">
                  {error}
                </p>
              )}
              {warning && (
                <p className="mt-3 text-torn-yellow text-xs text-center bg-torn-yellow/10 rounded-md py-1.5 px-2">
                  {warning}
                </p>
              )}
            </form>

            <p className="mt-5 text-text-muted text-[11px] text-center leading-relaxed">
              Faction members only — you must be in{" "}
              <span className="text-text-secondary font-medium">The Masters</span>{" "}
              to access this tool.
            </p>

            {!isCompanionHandoff && (
              <p className="mt-3 text-text-muted text-[10px] text-center leading-relaxed">
                Closed this by accident? Open any torn.com page and tap the{" "}
                <span className="text-text-secondary">⚡ TM Hub Companion</span>{" "}
                chip at the bottom-left → <span className="text-text-secondary">Connect</span>.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
