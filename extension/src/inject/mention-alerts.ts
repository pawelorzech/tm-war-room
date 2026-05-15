// Polls /api/chat/mentions/recent and surfaces new @mentions as toasts.
//
// Cadence is tighter than inbox notifications (15s vs 45s) because mentions
// tend to be decision-critical — someone asked you about a target, a war
// status, etc. Graceful-fallback on 404: if the backend doesn't yet have
// the mentions endpoint (deploy window), we silently no-op so the rest of
// the userscript keeps working.

import { ApiError, fetchRecentMentions } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { startPolling, type PollHandle } from '../lib/poll';
import { escapeHtml, showToast } from '../lib/notifications';
import { mentionsActive } from '../lib/settings';

declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

const STORAGE_LAST_SEEN = 'tm-hub-companion-last-seen-mention';
import { HUB_ORIGIN } from '../env';

function getLastSeenId(): number {
  return Number(GM_getValue<string>(STORAGE_LAST_SEEN, '0') || '0');
}

function setLastSeenId(id: number): void {
  GM_setValue(STORAGE_LAST_SEEN, String(id));
}

let _baseline = false;
let _endpointMissing = false;

async function pollOnce(): Promise<void> {
  if (_endpointMissing) return; // backend doesn't have it yet — give up
  const auth = getAuth();
  if (!auth) return;

  const since = getLastSeenId();
  let payload;
  try {
    payload = await fetchRecentMentions(auth, since, 20);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        clearAuth();
        throw err;
      }
      if (err.status === 404) {
        // Backend hasn't been updated yet. Stop polling so we don't spam
        // 404s; user will get mentions after their next userscript update
        // catches a newer backend.
        _endpointMissing = true;
        console.info('[tm-companion:mentions] endpoint not available yet, will retry on next reload');
        return;
      }
    }
    throw err;
  }

  const mentions = payload.mentions || [];
  if (mentions.length === 0) return;

  const maxId = Math.max(...mentions.map((m) => m.id));
  setLastSeenId(maxId);

  // First poll after install — establish the baseline silently so the user
  // doesn't get blasted by historical mentions from before they installed.
  if (!_baseline) {
    _baseline = true;
    return;
  }

  if (!mentionsActive()) return; // muted — silent update only

  // Newest mention first looks more natural in a toast stack (stack renders
  // bottom-up, so newest will appear on top).
  for (const m of mentions.slice(0, 5)) {
    const authorEsc = escapeHtml(m.author_name);
    const channelEsc = escapeHtml(m.channel_name);
    showToast({
      id: `mention:${m.id}`,
      title: `@${m.author_name} in #${m.channel_name}`,
      titleHtml: `<a href="https://www.torn.com/profiles.php?XID=${m.author_id}" target="_blank" rel="noopener noreferrer" style="color:#58a6ff;text-decoration:none;font-weight:600">@${authorEsc}</a> in #${channelEsc}`,
      body: m.content,
      icon: '💬',
      tone: 'mention',
      url: `${HUB_ORIGIN}/chat?channel=${m.channel_id}`,
    });
  }
  if (mentions.length > 5) {
    showToast({
      id: `mention-overflow:${maxId}`,
      title: `+${mentions.length - 5} more mentions`,
      body: 'Open TM Hub chat to catch up.',
      icon: '💬',
      tone: 'mention',
      url: `${HUB_ORIGIN}/chat`,
    });
  }
}

export function startMentionAlerts(): PollHandle {
  return startPolling({
    name: 'mentions',
    intervalMs: 15_000,
    fn: pollOnce,
    immediate: true,
  });
}
