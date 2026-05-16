"use client";

import { useEffect } from "react";
import { initPerfObserver } from "@/lib/perf-observer";

export function PerfReporter() {
  useEffect(() => {
    initPerfObserver();
  }, []);
  return null;
}
