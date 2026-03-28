"use client";

import { useAnnouncements } from "@/hooks/useAnnouncements";
import { AnnouncementList } from "@/components/inbox/AnnouncementList";

export default function InboxPage() {
  const { all, refresh } = useAnnouncements();

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Inbox</h1>
        <button onClick={refresh} className="text-xs text-torn-green hover:underline">Refresh</button>
      </div>
      <AnnouncementList announcements={all} />
    </div>
  );
}
