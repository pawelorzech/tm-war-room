"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useChatAccess } from "@/hooks/useChatAccess";
import { ChatLayout } from "@/components/chat/ChatLayout";

function ChatContent() {
  const router = useRouter();
  const { canAccess, loading } = useChatAccess();

  useEffect(() => {
    if (!loading && !canAccess) {
      router.replace("/dashboard");
    }
  }, [loading, canAccess, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-text-secondary">
        Loading...
      </div>
    );
  }

  if (!canAccess) return null;

  return <ChatLayout />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[60vh] text-text-secondary">Loading...</div>}>
      <ChatContent />
    </Suspense>
  );
}
