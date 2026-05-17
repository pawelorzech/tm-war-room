'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { usePushNotifications, PushPreferences } from '@/hooks/usePushNotifications';
import { usePDA } from '@/contexts/PDAContext';
import { Avatar } from '@/components/ui/Avatar';

interface ProfileData {
  player_id: number;
  name: string;
  level: number;
  faction: { position: string; faction_id?: number; faction_name?: string } | null;
  profile_image: string | null;
  life: { current: number; maximum: number } | null;
  last_action: { status: string; timestamp: number } | null;
  status: { description: string } | null;
}

interface KeyInfoData {
  access_level: number;
  access_type: string;
  selections: Record<string, string[]>;
}

interface TornStatsKeyMeta {
  has_key: boolean;
  status: 'ok' | 'invalid' | null;
  validated_at: string | null;
}

export default function SettingsPage() {
  const { playerId, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const push = usePushNotifications();
  const { isPDA } = usePDA();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const [keyInfo, setKeyInfo] = useState<KeyInfoData | null>(null);
  const [keyInfoError, setKeyInfoError] = useState(false);

  const [tsKeyMeta, setTsKeyMeta] = useState<TornStatsKeyMeta | null>(null);
  const [tsKeyInput, setTsKeyInput] = useState('');
  const [tsKeySaving, setTsKeySaving] = useState(false);
  const [tsKeyError, setTsKeyError] = useState<string | null>(null);

  const loadTsKey = () => {
    api.tornStatsKeyGet()
      .then(d => setTsKeyMeta(d))
      .catch(() => setTsKeyMeta({ has_key: false, status: null, validated_at: null }));
  };
  useEffect(() => { loadTsKey(); }, []);

  const submitTsKey = async () => {
    const key = tsKeyInput.trim();
    if (!key) return;
    setTsKeySaving(true);
    setTsKeyError(null);
    try {
      const meta = await api.tornStatsKeySet(key);
      setTsKeyMeta(meta);
      setTsKeyInput('');
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to save key';
      setTsKeyError(detail);
    } finally {
      setTsKeySaving(false);
    }
  };

  const removeTsKey = async () => {
    setTsKeySaving(true);
    setTsKeyError(null);
    try {
      await api.tornStatsKeyDelete();
      setTsKeyMeta({ has_key: false, status: null, validated_at: null });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to remove key';
      setTsKeyError(detail);
    } finally {
      setTsKeySaving(false);
    }
  };

  const loadProfile = () => {
    setProfileLoading(true);
    setProfileError(false);
    api.profileMe()
      .then(d => setProfile(d))
      .catch(() => setProfileError(true))
      .finally(() => setProfileLoading(false));
  };

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => {
    api.keyInfo()
      .then(d => setKeyInfo(d))
      .catch(() => setKeyInfoError(true));
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Profile Section */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
          <p className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Profile</p>

          {profileLoading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-bg-elevated" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-40 bg-bg-elevated rounded" />
                <div className="h-3 w-24 bg-bg-elevated rounded" />
                <div className="h-3 w-32 bg-bg-elevated rounded" />
              </div>
            </div>
          ) : profileError ? (
            <div className="text-sm text-text-secondary">
              <p>Failed to load profile.</p>
              <button onClick={loadProfile} className="text-torn-green hover:underline mt-1 text-xs">
                Retry
              </button>
            </div>
          ) : profile ? (
            <div className="flex items-center gap-4">
              <Avatar playerId={profile.player_id} name={profile.name} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-text-primary truncate">{profile.name}</p>
                <p className="text-sm text-text-secondary">
                  Level {profile.level}
                  {profile.faction?.position && (
                    <span className="text-text-muted"> &middot; {profile.faction.position}</span>
                  )}
                </p>
                <p className="text-xs text-text-muted mt-0.5">[{profile.player_id}]</p>
                <a
                  href={`https://www.torn.com/profiles.php?XID=${profile.player_id}`}
                  target="_blank" rel="noopener noreferrer"
                  
                  className="text-xs text-torn-green hover:underline mt-1 inline-block"
                >
                  View on Torn ↗
                </a>
              </div>
            </div>
          ) : null}
        </div>

        {/* API Key Info Section */}
        {keyInfo && !keyInfoError && (
          <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
            <p className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">API Key</p>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{keyInfo.access_type}</h2>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Access level {keyInfo.access_level} · {Object.keys(keyInfo.selections || {}).length} section{Object.keys(keyInfo.selections || {}).length === 1 ? '' : 's'} unlocked
                </p>
              </div>
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                keyInfo.access_level >= 4 ? 'bg-torn-green/15 text-torn-green'
                : keyInfo.access_level >= 3 ? 'bg-torn-yellow/15 text-torn-yellow'
                : 'bg-torn-red/15 text-torn-red'
              }`}>
                {keyInfo.access_level >= 4 ? 'Full Access' : keyInfo.access_level >= 3 ? 'Limited' : 'Minimal'}
              </span>
            </div>
            <p className="text-[10px] text-text-muted mt-3">
              TM Hub needs Full Access to load all features. If you're missing data, generate a new key at <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener noreferrer" className="text-torn-green hover:underline">Torn → Preferences → API Keys</a>.
            </p>
          </div>
        )}

        {/* TornStats Integration Section */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
          <p className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">TornStats Integration</p>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Your TornStats API key</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                Lets TM Hub query <span className="font-mono">/spy/user/...</span> with your key — gives the intel panel parity with what the native TornStats userscript shows you on torn.com profiles.
              </p>
            </div>
            {tsKeyMeta?.has_key && (
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                tsKeyMeta.status === 'ok' ? 'bg-torn-green/15 text-torn-green'
                : tsKeyMeta.status === 'invalid' ? 'bg-torn-red/15 text-torn-red'
                : 'bg-torn-yellow/15 text-torn-yellow'
              }`}>
                {tsKeyMeta.status === 'ok' ? 'Active' : tsKeyMeta.status === 'invalid' ? 'Rejected by TornStats' : 'Stored'}
              </span>
            )}
          </div>

          {tsKeyMeta?.has_key ? (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                Key on file. Validated {tsKeyMeta.validated_at ? new Date(tsKeyMeta.validated_at).toLocaleString() : '—'}.
              </p>
              {tsKeyMeta.status === 'invalid' && (
                <p className="text-[11px] text-torn-red">
                  TornStats started rejecting this key (HTTP 401/403). Generate a new one and paste it below to replace.
                </p>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste a new key to replace…"
                  value={tsKeyInput}
                  onChange={(e) => setTsKeyInput(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-lg bg-bg-elevated border border-text-secondary/20 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50"
                />
                <button
                  onClick={submitTsKey}
                  disabled={tsKeySaving || !tsKeyInput.trim()}
                  className="px-3 py-1.5 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 disabled:opacity-50 transition-colors"
                >
                  Replace
                </button>
                <button
                  onClick={removeTsKey}
                  disabled={tsKeySaving}
                  className="px-3 py-1.5 text-sm rounded-lg text-torn-red border border-torn-red/20 hover:bg-torn-red/10 disabled:opacity-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste TornStats API key…"
                  value={tsKeyInput}
                  onChange={(e) => setTsKeyInput(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-lg bg-bg-elevated border border-text-secondary/20 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50"
                />
                <button
                  onClick={submitTsKey}
                  disabled={tsKeySaving || !tsKeyInput.trim()}
                  className="px-3 py-1.5 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {tsKeyError && (
            <p className="mt-2 text-[11px] text-torn-red">{tsKeyError}</p>
          )}

          <p className="text-[10px] text-text-muted mt-3">
            Generate at <a href="https://www.tornstats.com/profile" target="_blank" rel="noopener noreferrer" className="text-torn-green hover:underline">tornstats.com → Profile → API Key</a>. Stored encrypted (Fernet). Optional — TM Hub still works without it, but the panel will lean on whichever pooled member key has data.
          </p>
        </div>

        {/* Push Notifications Section */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
          <p className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Push Notifications</p>

          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Push Notifications</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                {isPDA ? 'Native notifications via Torn PDA.' : 'Get alerts even when the app is closed.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPDA ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Connected via PDA</span>
              ) : push.permission === 'granted' && push.subscribed ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Enabled</span>
              ) : push.permission === 'denied' ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-red/15 text-torn-red font-medium">Blocked</span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-yellow/15 text-torn-yellow font-medium">Disabled</span>
              )}
            </div>
          </div>

          {isPDA ? (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
                { key: 'chat_mention' as const, label: 'Chat Mentions', desc: 'When someone @-mentions you in TM Hub chat' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              <div className="pt-2 border-t border-border-light">
                <p className="text-[10px] text-text-muted">Notifications are delivered as native PDA alerts while the hub is open in a tab.</p>
              </div>
            </div>
          ) : !push.supported ? (
            <p className="text-xs text-text-muted">Push notifications are not supported in this browser.</p>
          ) : push.permission === 'denied' ? (
            <div className="bg-torn-red/5 border border-torn-red/20 rounded-lg p-3 text-xs text-text-secondary">
              <p className="font-medium text-torn-red mb-1">Notifications blocked</p>
              <p>You previously denied notification permission. To re-enable: click the lock icon in your browser&apos;s address bar &rarr; Notifications &rarr; Allow.</p>
            </div>
          ) : !push.subscribed ? (
            <button onClick={push.subscribe}
              className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
              Enable Push Notifications
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
                { key: 'chat_mention' as const, label: 'Chat Mentions', desc: 'When someone @-mentions you in TM Hub chat' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              <div className="flex gap-2 pt-2 border-t border-border-light">
                <button onClick={push.sendTest}
                  className="px-3 py-1 text-[10px] rounded text-text-secondary hover:text-text-primary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors">
                  Send Test
                </button>
                <button onClick={push.unsubscribe}
                  className="px-3 py-1 text-[10px] rounded text-danger hover:text-danger/80 border border-danger/20 hover:border-danger/40 transition-colors">
                  Disable Push
                </button>
              </div>
            </div>
          )}
        </div>

        {/* App Section */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-5">
          <p className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">App</p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Theme</p>
              <p className="text-[10px] text-text-muted">Currently using {theme} mode.</p>
            </div>
            <button
              onClick={toggle}
              className="px-3 py-1.5 text-sm rounded-lg border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:border-text-secondary/40 transition-colors"
            >
              {theme === 'dark' ? '\u2600\uFE0F Light' : '\uD83C\uDF19 Dark'}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-border-light flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Account</p>
              <p className="text-[10px] text-text-muted">Log out of TM Hub on this device.</p>
            </div>
            <button
              onClick={logout}
              className="px-3 py-1.5 text-sm rounded-lg text-torn-red border border-torn-red/20 hover:bg-torn-red/10 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
