"use client";
import { useState, useEffect, useCallback } from "react";

interface Bot {
  id: number;
  name: string;
  active: number;
  allowed_channels: string;
  created_by: number;
  created_at: number;
}

interface TriggerResult {
  posted: boolean;
  risky_count: number;
  message: string;
  error?: string;
}

export function BotsAdmin({ adminFetch }: { adminFetch: <T>(url: string, init?: RequestInit) => Promise<T> }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<TriggerResult | null>(null);

  const loadBots = useCallback(async () => {
    try {
      const data = await adminFetch<{ bots: Bot[] }>("/api/admin/bots");
      setBots(data.bots || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { loadBots(); }, [loadBots]);

  const triggerReviveMonitor = async () => {
    setTriggering(1);
    setLastResult(null);
    try {
      const data = await adminFetch<TriggerResult>("/api/admin/bots/trigger/revive-monitor", { method: "POST" });
      setLastResult(data);
    } catch (e) {
      setLastResult({ posted: false, risky_count: -1, message: "", error: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setTriggering(null);
    }
  };

  if (loading) return <div className="text-text-secondary">Loading bots...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Chat Bots</h2>

      {bots.length === 0 ? (
        <p className="text-text-secondary text-sm">No bots registered yet. They will be auto-created on next server restart.</p>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <div key={bot.id} className="bg-surface-secondary rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{bot.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      bot.active
                        ? "bg-torn-green/15 text-torn-green"
                        : "bg-torn-red/15 text-torn-red"
                    }`}>
                      {bot.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Created {new Date(bot.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>

                {bot.name === "Revive Monitor" && (
                  <button
                    onClick={triggerReviveMonitor}
                    disabled={triggering !== null}
                    className="px-3 py-1.5 text-sm bg-torn-green/15 text-torn-green rounded-lg hover:bg-torn-green/25 transition-colors disabled:opacity-50"
                  >
                    {triggering ? "Checking..." : "Trigger Now"}
                  </button>
                )}
              </div>

              {bot.name === "Revive Monitor" && lastResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  lastResult.error
                    ? "bg-torn-red/10 text-torn-red"
                    : lastResult.posted
                      ? lastResult.risky_count > 0
                        ? "bg-torn-red/10 text-torn-red"
                        : "bg-torn-green/10 text-torn-green"
                      : "bg-surface-primary text-text-secondary"
                }`}>
                  {lastResult.error
                    ? `Error: ${lastResult.error}`
                    : lastResult.posted
                      ? lastResult.risky_count > 0
                        ? `Warning posted: ${lastResult.risky_count} member${lastResult.risky_count > 1 ? "s" : ""} with revives enabled`
                        : "All clear — no one has revives enabled"
                      : `Not posted: ${lastResult.message}`
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
