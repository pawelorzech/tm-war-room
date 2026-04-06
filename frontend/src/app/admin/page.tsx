"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSession } from "@/hooks/useAdminSession";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { AnnouncementEditor } from "@/components/admin/AnnouncementEditor";
import { ManageAdmins } from "@/components/admin/ManageAdmins";
import { SpyAdmin } from "@/components/admin/SpyAdmin";
import { FeatureFlags } from "@/components/admin/FeatureFlags";
import { PushAdmin } from "@/components/admin/PushAdmin";
import { BotsAdmin } from "@/components/admin/BotsAdmin";

type Tab = "analytics" | "announcements" | "spy" | "admins" | "settings" | "push" | "bots";

export default function AdminPage() {
  const { role } = useAuth();
  const { token, loading, adminFetch } = useAdminSession();
  const [tab, setTab] = useState<Tab>("analytics");

  if (loading) return <div className="p-4 text-text-secondary">Authenticating...</div>;
  if (!token) return <div className="p-4 text-torn-red">Admin access required</div>;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "analytics", label: "Analytics", show: true },
    { id: "announcements", label: "Announcements", show: true },
    { id: "spy", label: "Spy Data", show: true },
    { id: "settings", label: "Settings", show: true },
    { id: "admins", label: "Manage Admins", show: role === "superadmin" },
    { id: "bots", label: "Bots", show: true },
    { id: "push", label: "Push Notifications", show: true },
  ];

  return (
    <div>
      <div className="flex gap-4 px-4 pt-3 border-b border-border">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "text-torn-green border-b-2 border-torn-green"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "analytics" && <AnalyticsDashboard adminFetch={adminFetch} />}
        {tab === "announcements" && <AnnouncementEditor adminFetch={adminFetch} />}
        {tab === "spy" && <SpyAdmin adminFetch={adminFetch} />}
        {tab === "settings" && <FeatureFlags adminFetch={adminFetch} />}
        {tab === "admins" && role === "superadmin" && <ManageAdmins adminFetch={adminFetch} />}
        {tab === "bots" && <BotsAdmin adminFetch={adminFetch} />}
        {tab === "push" && <PushAdmin adminFetch={adminFetch} />}
      </div>
    </div>
  );
}
