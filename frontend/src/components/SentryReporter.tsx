"use client";

import { useEffect } from "react";

export function SentryReporter() {
  useEffect(() => {
    // Lazy import — SDK chunk only ships if NEXT_PUBLIC_SENTRY_DSN was set at build.
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    import("@/lib/sentry-browser").then(m => m.initSentry()).catch(() => {});
  }, []);
  return null;
}
