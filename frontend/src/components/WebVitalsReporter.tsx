"use client";

import { useEffect } from "react";
import { initWebVitals } from "@/lib/web-vitals";

export function WebVitalsReporter() {
  useEffect(() => {
    initWebVitals();
  }, []);
  return null;
}
