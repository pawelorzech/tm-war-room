"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, login } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
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
                TM Hub
              </h1>
              <p className="text-text-secondary text-xs mt-1 tracking-wide">
                The Masters Faction Toolkit
              </p>
            </div>

            {/* Divider */}
            <div className="w-12 h-px bg-torn-green/30 mx-auto mb-6" />

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setSubmitting(true);
                try {
                  await login(apiKey);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to register key");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="block text-text-secondary text-[11px] uppercase tracking-wider font-medium mb-1.5">
                Torn API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                className="w-full px-3 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:border-torn-green focus:outline-none transition-all duration-200 focus:[animation:tm-focus-ring_0.3s_ease-out_forwards]"
                autoFocus
              />
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
            </form>

            <p className="mt-5 text-text-muted text-[11px] text-center leading-relaxed">
              Faction members only — you must be in{" "}
              <span className="text-text-secondary font-medium">The Masters</span>{" "}
              to access this tool.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
