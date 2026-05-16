// User-toggleable feature settings, persisted across page loads via
// GM_setValue. Single object keeps the storage layer simple (one key, one
// JSON blob) and makes "reset to defaults" trivial.
//
// Mute timers are stored as absolute epoch ms so they survive reloads — no
// need for a background timer to clear them.

declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

const STORAGE_KEY = 'tm-hub-companion-settings';

export interface CompanionSettings {
  heartbeatEnabled: boolean;
  notificationsEnabled: boolean;
  mentionsEnabled: boolean;
  /** Floating TM Hub pinned-navs panel on torn.com. */
  pinsEnabled: boolean;
  /** Epoch ms after which mute expires; 0 = not muted. */
  notificationsMutedUntil: number;
  /** Epoch ms after which mute expires; 0 = not muted. */
  mentionsMutedUntil: number;
  /** Did we already prompt the user for native Notification permission? */
  nativePermissionRequestedAt: number;
}

const DEFAULTS: CompanionSettings = {
  heartbeatEnabled: true,
  notificationsEnabled: true,
  mentionsEnabled: true,
  pinsEnabled: true,
  notificationsMutedUntil: 0,
  mentionsMutedUntil: 0,
  nativePermissionRequestedAt: 0,
};

export function loadSettings(): CompanionSettings {
  try {
    const raw = GM_getValue<string>(STORAGE_KEY, '');
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<CompanionSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function updateSettings(patch: Partial<CompanionSettings>): CompanionSettings {
  const next = { ...loadSettings(), ...patch };
  GM_setValue(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** True if notifications channel is currently active (enabled and not muted). */
export function notificationsActive(s: CompanionSettings = loadSettings()): boolean {
  if (!s.notificationsEnabled) return false;
  return s.notificationsMutedUntil < Date.now();
}

/** True if mention alerts channel is currently active. */
export function mentionsActive(s: CompanionSettings = loadSettings()): boolean {
  if (!s.mentionsEnabled) return false;
  return s.mentionsMutedUntil < Date.now();
}

export function muteFor(kind: 'notifications' | 'mentions', durationMs: number): void {
  const key = kind === 'notifications' ? 'notificationsMutedUntil' : 'mentionsMutedUntil';
  updateSettings({ [key]: Date.now() + durationMs });
}

export function unmute(kind: 'notifications' | 'mentions'): void {
  const key = kind === 'notifications' ? 'notificationsMutedUntil' : 'mentionsMutedUntil';
  updateSettings({ [key]: 0 });
}
