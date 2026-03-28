"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Announcement } from "@/types/admin";

interface AdminFetch {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

import { getAnnouncementState, ANNOUNCEMENT_TYPE_BADGE_STYLES } from "@/types/admin";
import type { AnnouncementType } from "@/types/admin";
import { formatDate } from "@/lib/format";

const typeOptions: { value: AnnouncementType; label: string }[] = [
  { value: "alert", label: "Alert" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
];

const stateBadgeStyles: Record<string, string> = {
  active: "bg-green-800 text-green-200",
  expired: "bg-gray-700 text-gray-300",
  revoked: "bg-red-900 text-red-300",
};

export function AnnouncementEditor({ adminFetch }: { adminFetch: AdminFetch }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form state
  const [message, setMessage] = useState("");
  const [type, setType] = useState<AnnouncementType>("info");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Revoke state: map of id -> reason input shown / value
  const [revokeOpen, setRevokeOpen] = useState<Record<number, boolean>>({});
  const [revokeReason, setRevokeReason] = useState<Record<number, string>>({});
  const [revoking, setRevoking] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState<Record<number, string>>({});

  const loadAnnouncements = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.announcementsAll();
      setAnnouncements(res.announcements);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load announcements");
    }
  }, []);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(false);
    try {
      await adminFetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          type,
          ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      setMessage("");
      setExpiresAt("");
      setType("info");
      setCreateSuccess(true);
      await loadAnnouncements();
      setTimeout(() => setCreateSuccess(false), 3000);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create announcement");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setRevoking(id);
    setRevokeError((prev) => ({ ...prev, [id]: "" }));
    try {
      await adminFetch(`/api/admin/announcements/${id}/revoke`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revokeReason[id] || null }),
      });
      setRevokeOpen((prev) => ({ ...prev, [id]: false }));
      await loadAnnouncements();
    } catch (e) {
      setRevokeError((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : "Failed to revoke",
      }));
    } finally {
      setRevoking(null);
    }
  };

  const active = announcements.filter((a) => getAnnouncementState(a) === "active");
  const history = announcements.filter((a) => getAnnouncementState(a) !== "active");

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Create Announcement
        </h2>
        <form onSubmit={handleCreate} className="bg-bg-surface border border-border rounded p-4 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Announcement message..."
              className="w-full bg-bg-base border border-border rounded px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-torn-green resize-none"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AnnouncementType)}
                className="bg-bg-base border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-torn-green"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Expires at (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="bg-bg-base border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-torn-green"
              />
            </div>
          </div>
          {createError && (
            <p className="text-red-400 text-xs">{createError}</p>
          )}
          {createSuccess && (
            <p className="text-green-400 text-xs">Announcement created.</p>
          )}
          <button
            type="submit"
            disabled={creating || !message.trim()}
            className="px-4 py-2 bg-torn-green text-black text-sm font-medium rounded hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      {loadError && (
        <div className="bg-red-900/30 border border-red-500 text-red-200 rounded p-3 text-sm">
          {loadError}
        </div>
      )}

      {/* Active Announcements */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-text-secondary text-sm">No active announcements.</p>
        ) : (
          <div className="space-y-2">
            {active.map((a) => (
              <div key={a.id} className="bg-bg-surface border border-border rounded p-3">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase ${ANNOUNCEMENT_TYPE_BADGE_STYLES[a.type]}`}>
                    {a.type}
                  </span>
                  <span className="flex-1 text-sm text-text-primary">{a.message}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-text-secondary">{formatDate(a.created_at)}</span>
                  {a.expires_at && (
                    <span className="text-xs text-text-secondary">
                      Expires: {formatDate(a.expires_at)}
                    </span>
                  )}
                  {!revokeOpen[a.id] && (
                    <button
                      onClick={() => setRevokeOpen((prev) => ({ ...prev, [a.id]: true }))}
                      className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Revoke
                    </button>
                  )}
                </div>
                {revokeOpen[a.id] && (
                  <div className="mt-2 flex gap-2 items-center flex-wrap">
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={revokeReason[a.id] || ""}
                      onChange={(e) =>
                        setRevokeReason((prev) => ({ ...prev, [a.id]: e.target.value }))
                      }
                      className="flex-1 min-w-0 bg-bg-base border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-torn-green"
                    />
                    <button
                      onClick={() => handleRevoke(a.id)}
                      disabled={revoking === a.id}
                      className="px-3 py-1 bg-red-700 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50"
                    >
                      {revoking === a.id ? "Revoking..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setRevokeOpen((prev) => ({ ...prev, [a.id]: false }))}
                      className="px-3 py-1 bg-bg-base border border-border text-xs text-text-secondary rounded hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    {revokeError[a.id] && (
                      <span className="text-red-400 text-xs w-full">{revokeError[a.id]}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            History ({history.length})
          </h2>
          <div className="space-y-2">
            {history.map((a) => {
              const state = getAnnouncementState(a);
              return (
                <div key={a.id} className="bg-bg-surface border border-border rounded p-3 opacity-60">
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase ${stateBadgeStyles[state]}`}>
                      {state}
                    </span>
                    <span className={`flex-1 text-sm text-text-primary ${state === "revoked" ? "line-through" : ""}`}>
                      {a.message}
                    </span>
                  </div>
                  {a.revoke_reason && (
                    <p className="mt-1 text-xs text-text-secondary italic">
                      Reason: {a.revoke_reason}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-text-secondary">{formatDate(a.created_at)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
