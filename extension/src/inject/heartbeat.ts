// Presence heartbeat — POST /api/heartbeat every 60s while the tab is
// visible, so TM Hub's presence list shows the user as online for as long
// as they have torn.com open. Fire-and-forget; we don't care about the
// response.

import { ApiError, sendHeartbeat } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { startPolling, type PollHandle } from '../lib/poll';
import { loadSettings } from '../lib/settings';

async function tick(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  if (!loadSettings().heartbeatEnabled) return;
  try {
    await sendHeartbeat(auth);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
    }
    throw err;
  }
}

export function startHeartbeat(): PollHandle {
  return startPolling({
    name: 'heartbeat',
    intervalMs: 60_000,
    fn: tick,
    immediate: true,
  });
}
