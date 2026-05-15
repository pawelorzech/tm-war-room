// Polls /api/notifications/unread and surfaces new notifications as toasts.
//
// Dedup is by notification id, persisted in GM_setValue so the same toast
// doesn't appear on every page reload after a long absence. First poll
// after install treats the existing unread set as "seen" — we don't blast
// the user with everything they missed all at once, only show what arrives
// AFTER they connected. (Future enhancement: small "you have N unread"
// summary on first connect.)

import { ApiError, fetchNotificationsUnread } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { startPolling, type PollHandle } from '../lib/poll';
import { showToast } from '../lib/notifications';
import { loadSettings, notificationsActive } from '../lib/settings';
import type { NotificationItem } from '../types';

declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

const STORAGE_LAST_SEEN = 'tm-hub-companion-last-seen-notification';
import { HUB_ORIGIN } from '../env';

function getLastSeenId(): number {
  return Number(GM_getValue<string>(STORAGE_LAST_SEEN, '0') || '0');
}

function setLastSeenId(id: number): void {
  GM_setValue(STORAGE_LAST_SEEN, String(id));
}

let _baseline: boolean = false; // True after first poll (so we don't toast existing unread)

async function pollOnce(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  if (!notificationsActive()) {
    // Muted/disabled — still poll silently so lastSeen stays current and we
    // don't blast the user when they unmute.
  }

  let payload;
  try {
    payload = await fetchNotificationsUnread(auth);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
    }
    throw err;
  }

  const notifications: NotificationItem[] = payload.notifications || [];
  if (notifications.length === 0) return;

  const lastSeen = getLastSeenId();
  const fresh = notifications.filter((n) => n.id > lastSeen);
  if (fresh.length === 0) return;

  // Update lastSeen regardless of whether we render — keeps us idempotent.
  const maxId = Math.max(...notifications.map((n) => n.id));
  setLastSeenId(maxId);

  // On the very first run after the userscript loaded, treat existing unreads
  // as "already seen" — we don't want a 30-notification stampede on connect.
  if (!_baseline) {
    _baseline = true;
    return;
  }

  if (!notificationsActive()) return; // muted — silent update, no toasts

  for (const n of fresh.slice(0, 5)) {
    showToast({
      id: `notif:${n.id}`,
      title: n.title || 'New notification',
      body: n.body || '',
      icon: '🔔',
      tone: 'info',
      url: n.url || `${HUB_ORIGIN}/inbox`,
    });
  }
  if (fresh.length > 5) {
    showToast({
      id: `notif-overflow:${maxId}`,
      title: `+${fresh.length - 5} more notifications`,
      body: 'Open the TM Hub inbox to review.',
      icon: '🔔',
      tone: 'info',
      url: `${HUB_ORIGIN}/inbox`,
    });
  }
}

export function startNotificationToasts(): PollHandle {
  return startPolling({
    name: 'notifications',
    intervalMs: 45_000,
    fn: pollOnce,
    immediate: true,
  });
}

// Re-export so the bootstrap can introspect mute state from settings UI.
export { loadSettings };
