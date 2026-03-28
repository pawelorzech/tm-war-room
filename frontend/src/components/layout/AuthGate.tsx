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
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="w-full max-w-sm p-6 bg-bg-surface border border-border rounded-lg">
          <h1 className="text-xl font-bold text-torn-green mb-1">TM Hub</h1>
          <p className="text-text-secondary text-sm mb-4">Enter your Torn API key to continue</p>
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
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm mb-3 focus:border-torn-green focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={submitting || !apiKey}
              className="w-full py-2 bg-torn-green-dim text-white rounded text-sm font-medium hover:bg-torn-green disabled:opacity-50 transition-colors"
            >
              {submitting ? "Validating..." : "Login"}
            </button>
            {error && <p className="mt-2 text-torn-red text-xs">{error}</p>}
          </form>
          <p className="mt-3 text-text-muted text-xs text-center">
            You must be a member of The Masters to use this tool
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
