'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

/**
 * TM Hub Companion authentication handoff page.
 *
 * Flow:
 *   1. User clicks "Connect to TM Hub" in the userscript/extension on torn.com
 *   2. Userscript opens this page in a new window (window.open)
 *   3. AuthGate forces a login if the user isn't already logged into TM Hub
 *   4. On mount, we POST /api/extension/issue-token to mint a long-lived token
 *   5. window.opener.postMessage({type, token, player_id, ...}, "*") hands it
 *      to the userscript, which stores it in GM_setValue / chrome.storage
 *   6. Manual fallback: token is also rendered in a copy-friendly code block
 *      (in case the user opened the link directly, or postMessage failed)
 */
export default function ExtensionAuthPage() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [expiresHours, setExpiresHours] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [postedToOpener, setPostedToOpener] = useState(false);

  useEffect(() => {
    if (authLoading || !isLoggedIn || token) return;
    api.extensionIssueToken()
      .then((res) => {
        setToken(res.ext_token);
        setPlayerId(res.player_id);
        setPlayerName(res.player_name);
        setExpiresHours(res.expires_hours);

        // Hand off to the userscript / extension via postMessage.
        // `window.opener` is set when this page was opened from a script call
        // like window.open() — typical Tampermonkey / extension flow.
        const payload = {
          type: 'tm-hub-ext-token',
          token: res.ext_token,
          player_id: res.player_id,
          player_name: res.player_name,
          expires_hours: res.expires_hours,
        };

        if (window.opener) {
          try {
            window.opener.postMessage(payload, '*');
            setPostedToOpener(true);
          } catch {
            // opener is on a different origin and rejected the post — that's
            // fine, the user can fall back to manual copy.
          }
        }
        // Also broadcast to the current window so a content script in the same
        // tab (e.g. opened via location.assign rather than window.open) can
        // intercept.
        window.postMessage(payload, window.location.origin);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to issue token');
      });
  }, [authLoading, isLoggedIn, token]);

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API blocked — user can still select+copy from the textarea
    }
  };

  // AuthGate already renders the login form when not logged in.
  // We only need to handle the post-login state here.
  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold">TM Hub Companion — connect</h1>
          <p className="text-text-secondary text-sm mt-1">
            Issuing an access token for the browser extension / userscript.
          </p>
        </header>

        {error && (
          <div className="bg-torn-red/10 border border-torn-red/30 text-torn-red rounded-lg p-4">
            <p className="font-semibold">Could not issue a token</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {!error && !token && (
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
            <p className="text-text-secondary text-sm">Generating token…</p>
          </div>
        )}

        {token && (
          <>
            <div className="bg-bg-card border border-torn-green/30 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <span className="text-torn-green text-2xl leading-none">✓</span>
                <div className="flex-1">
                  <p className="font-semibold text-text-primary">
                    {postedToOpener ? 'Sent to extension' : 'Token ready'}
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    {postedToOpener
                      ? 'The userscript / extension has received your token. You can close this tab.'
                      : 'Copy the token below into the extension if it did not pick it up automatically.'}
                  </p>
                  <ul className="text-text-muted text-xs mt-3 space-y-1">
                    <li>Player: <span className="text-text-primary">{playerName} [{playerId}]</span></li>
                    {expiresHours !== null && (
                      <li>Valid for: <span className="text-text-primary">{Math.round(expiresHours / 24)} days</span></li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <details className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-text-primary">
                Show token (manual fallback)
              </summary>
              <div className="mt-3 space-y-3">
                <textarea
                  readOnly
                  value={token}
                  rows={4}
                  className="w-full bg-bg-primary border border-border rounded-lg p-3 text-xs font-mono text-text-secondary break-all"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-torn-green-dim text-white rounded-lg text-sm font-semibold hover:bg-torn-green transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy token'}
                </button>
                <p className="text-text-muted text-xs">
                  Paste this into the TM Hub Companion options page if the automatic
                  handoff did not work (e.g. when opening this page directly
                  instead of through the extension).
                </p>
              </div>
            </details>
          </>
        )}

        <footer className="text-text-muted text-xs pt-4 border-t border-text-secondary/15">
          <p>
            This page is part of the TM Hub Companion browser extension flow.
            See <a href="/install" className="text-torn-green underline">install instructions</a>.
          </p>
        </footer>
      </div>
    </div>
  );
}
