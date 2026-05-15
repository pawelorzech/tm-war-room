// Adaptive polling helper for the TM Hub Companion.
//
// Pauses when the tab is hidden (Page Visibility API) so we don't burn
// rate-limit budget on backgrounded torn.com tabs. Resumes — with an
// immediate run — when the tab becomes visible again. Exponential backoff
// on consecutive 5xx errors so a backend incident doesn't get hammered by
// every open tab.

export interface PollHandle {
  stop: () => void;
  /** Force an immediate run on top of the scheduled cadence. */
  poke: () => void;
}

export interface PollOptions {
  /** Friendly name for debug logs. */
  name: string;
  /** Steady-state interval between polls when visible. */
  intervalMs: number;
  /** The work to do each tick. Throw to signal failure for backoff. */
  fn: () => Promise<void> | void;
  /** Run fn() immediately on start? Default: true. */
  immediate?: boolean;
}

const MAX_BACKOFF_MS = 5 * 60_000; // 5 min — long backend outage cap

export function startPolling({ name, intervalMs, fn, immediate = true }: PollOptions): PollHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let consecutiveErrors = 0;
  let running = false;

  const computeDelay = (): number => {
    if (consecutiveErrors === 0) return intervalMs;
    const backoff = Math.min(intervalMs * Math.pow(2, consecutiveErrors), MAX_BACKOFF_MS);
    return backoff;
  };

  const schedule = (delayMs: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delayMs);
  };

  const tick = async () => {
    if (stopped || running) return;
    if (document.hidden) {
      // Paused — wait for visibilitychange to wake us up.
      return;
    }
    running = true;
    try {
      await fn();
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      // Use console.warn instead of console.error so it doesn't get caught by
      // generic error reporters; the caller is responsible for handling
      // specific error classes (e.g. ApiError 401 to clear auth).
      console.warn(`[tm-companion:${name}] poll failed (#${consecutiveErrors})`, err);
    } finally {
      running = false;
    }
    schedule(computeDelay());
  };

  const onVisibilityChange = () => {
    if (stopped) return;
    if (!document.hidden) {
      // Tab back into focus — fire immediately so users see fresh data.
      schedule(0);
    } else {
      // Tab hidden — drop any pending timer to save battery / rate limit.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (immediate) {
    schedule(0);
  } else {
    schedule(intervalMs);
  }

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
    poke: () => schedule(0),
  };
}
