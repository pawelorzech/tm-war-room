"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "tm-hub-pwa-prompt-dismissed";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone)
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // iOS: show manual instructions
    if (isIOS()) {
      const timer = setTimeout(() => {
        setShowIOS(true);
        setVisible(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
    localStorage.setItem(DISMISSED_KEY, "1");
  }, [deferredPrompt]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 lg:bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-96 z-50 animate-slide-up"
      role="alert"
    >
      <div className="bg-bg-surface border border-border rounded-xl p-4 shadow-lg shadow-black/40 flex items-start gap-3">
        {/* TM icon */}
        <div className="shrink-0 w-10 h-10 rounded-lg bg-bg-primary flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="pwa-glow">
                <feGaussianBlur stdDeviation="8" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <rect width="512" height="512" rx="96" fill="#0d1117"/>
            <text x="256" y="310" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="800" fontSize="180" fill="#3fb950" filter="url(#pwa-glow)" letterSpacing="-8">TM</text>
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            Zainstaluj TM Hub
          </p>
          {showIOS ? (
            <p className="text-xs text-text-secondary mt-1">
              Kliknij{" "}
              <span className="inline-flex items-center align-middle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-torn-blue">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </span>{" "}
              Udostępnij → <strong>Dodaj do ekranu głównego</strong>
            </p>
          ) : (
            <p className="text-xs text-text-secondary mt-1">
              Dodaj do ekranu głównego — szybki dostęp jak natywna apka
            </p>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-2 mt-3">
            {!showIOS && (
              <button
                onClick={install}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-torn-green/15 text-torn-green border border-torn-green/30 hover:bg-torn-green/25 transition-colors"
              >
                Zainstaluj
              </button>
            )}
            <button
              onClick={dismiss}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-text-muted hover:text-text-secondary transition-colors"
            >
              Może później
            </button>
          </div>
        </div>

        {/* Close X */}
        <button
          onClick={dismiss}
          className="shrink-0 text-text-muted hover:text-text-primary transition-colors p-1"
          aria-label="Zamknij"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
