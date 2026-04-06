"use client";

import { useState, useEffect } from "react";

interface FeatureFlagsProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function FeatureFlags({ adminFetch }: FeatureFlagsProps) {
  const [chatEnabled, setChatEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<Record<string, string>>("/api/admin/settings")
      .then((settings) => {
        setChatEnabled(settings.chat_enabled_for_all === "true");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminFetch]);

  const toggle = async () => {
    const newValue = !chatEnabled;
    setSaving(true);
    try {
      await adminFetch("/api/admin/settings/chat_enabled_for_all", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(newValue) }),
      });
      setChatEnabled(newValue);
    } catch {
      // revert on failure
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-text-secondary">Loading settings...</p>;

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-4">Feature Flags</h3>
      <div className="bg-bg-elevated rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Enable Chat for all members
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              When off, only admins can see and use the faction chat. Turn on when chat is ready for everyone.
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              chatEnabled ? "bg-torn-green" : "bg-bg-surface"
            } ${saving ? "opacity-50" : ""}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                chatEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              chatEnabled ? "bg-torn-green" : "bg-text-muted"
            }`}
          />
          <span className="text-xs text-text-secondary">
            {chatEnabled
              ? "Chat is visible to all faction members"
              : "Chat is in beta — visible to admins only"}
          </span>
        </div>
      </div>
    </div>
  );
}
