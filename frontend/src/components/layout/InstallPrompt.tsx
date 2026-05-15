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
        <div
          className="shrink-0 w-10 h-10 rounded-lg bg-bg-primary bg-cover bg-center overflow-hidden"
          style={{ backgroundImage: "url('/icons/icon-192.png')" }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            Install TM Hub
          </p>
          {showIOS ? (
            <p className="text-xs text-text-secondary mt-1">
              Tap{" "}
              <span className="inline-flex items-center align-middle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-torn-blue">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </span>{" "}
              Share → <strong>Add to Home Screen</strong>
            </p>
          ) : (
            <p className="text-xs text-text-secondary mt-1">
              Add to your home screen — quick access like a native app
            </p>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-2 mt-3">
            {!showIOS && (
              <button
                onClick={install}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-torn-green/15 text-torn-green border border-torn-green/30 hover:bg-torn-green/25 transition-colors"
              >
                Install
              </button>
            )}
            <button
              onClick={dismiss}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-text-muted hover:text-text-secondary transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>

        {/* Close X */}
        <button
          onClick={dismiss}
          className="shrink-0 text-text-muted hover:text-text-primary transition-colors p-1"
          aria-label="Close"
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
