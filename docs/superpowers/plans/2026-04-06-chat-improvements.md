# Chat Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 chat improvements: traveling header, dashboard unread banner, Cmd+K channels, push notification people picker, leadership admin-only visibility, and optimistic real-time message rendering.

**Architecture:** Backend changes are minimal (1 migration, 1 new endpoint, 1 filter fix). Frontend changes are 5 independent component updates in `useChat.ts`, `ChatLayout.tsx`, `dashboard/page.tsx`, `CommandPalette.tsx`, and `SendNotification.tsx`.

**Tech Stack:** FastAPI, SQLite, Next.js 15, React 19, TypeScript, WebSocket

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `api/db/migrations/028_chat_improvements.sql` | Create | Seed traveling/leadership channels, fix announcements |
| `api/routers/chat.py` | Modify | Filter admin_only from channel list, add `/api/chat/traveling` |
| `tests/test_chat.py` | Modify | Tests for admin-only filtering, traveling endpoint |
| `frontend/src/hooks/useChat.ts` | Modify | Optimistic message rendering |
| `frontend/src/components/chat/ChatLayout.tsx` | Modify | Traveling header strip |
| `frontend/src/app/dashboard/page.tsx` | Modify | Unread chat banner |
| `frontend/src/components/nav/CommandPalette.tsx` | Modify | Chat channels in search results |
| `frontend/src/lib/api-client.ts` | Modify | Add `chatTraveling()` API method |
| `frontend/src/components/admin/push/SendNotification.tsx` | Modify | People picker combobox |

---

### Task 1: Migration — Seed Channels and Fix Announcements

**Files:**
- Create: `api/db/migrations/028_chat_improvements.sql`
- Modify: `tests/test_chat.py`

- [ ] **Step 1: Write the migration file**

```sql
-- 028_chat_improvements.sql
-- Fix announcements: visible to all, only admins can post
UPDATE chat_channels SET admin_only = 0, write_restricted = 1 WHERE name = 'announcements';

-- Seed traveling channel
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES ('traveling', 'Travel coordination & updates', 'chat', 5, 0, strftime('%s','now'), 0);

-- Seed leadership channel (admin-only visibility)
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES ('leadership', 'Leadership discussion', 'chat', 0, 1, strftime('%s','now'), 0);
```

- [ ] **Step 2: Write test for migration results**

Add to `tests/test_chat.py` after the existing `TestChannels` class:

```python
class TestChatImprovementsMigration:
    def test_traveling_channel_seeded(self, chat_repo):
        ch = chat_repo.get_channel_by_name("traveling")
        assert ch is not None
        assert ch["type"] == "chat"
        assert ch["admin_only"] == 0

    def test_leadership_channel_seeded(self, chat_repo):
        ch = chat_repo.get_channel_by_name("leadership")
        assert ch is not None
        assert ch["type"] == "chat"
        assert ch["admin_only"] == 1

    def test_announcements_fixed(self, chat_repo):
        ch = chat_repo.get_channel_by_name("announcements")
        assert ch is not None
        assert ch["admin_only"] == 0
        assert ch["write_restricted"] == 1
```

- [ ] **Step 3: Verify `get_channel_by_name` exists in the repo**

Check `api/db/repos/chat.py` — this method is already used in tests (line 59 of `test_chat.py`). If it doesn't exist, add it:

```python
def get_channel_by_name(self, name: str) -> dict | None:
    return self.execute_one("SELECT * FROM chat_channels WHERE name = ?", (name,))
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_chat.py::TestChatImprovementsMigration -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add api/db/migrations/028_chat_improvements.sql tests/test_chat.py
git commit -m "feat: migration for traveling/leadership channels, fix announcements visibility"
```

---

### Task 2: Admin-Only Channel Filtering in API

**Files:**
- Modify: `api/routers/chat.py:86-93` (list_channels)
- Modify: `api/routers/chat.py:407-412` (get_unread)
- Modify: `tests/test_chat.py`

- [ ] **Step 1: Write tests for admin-only filtering**

Add to `tests/test_chat.py`:

```python
class TestAdminOnlyFiltering:
    def test_get_channels_filters_admin_only(self, chat_repo):
        """Non-admin users should not see admin_only channels."""
        channels = chat_repo.get_channels()
        # leadership is admin_only=1
        all_names = [c["name"] for c in channels]
        assert "leadership" in all_names

        # Filter as a non-admin would
        visible = [c for c in channels if not c["admin_only"]]
        visible_names = [c["name"] for c in visible]
        assert "leadership" not in visible_names
        assert "general" in visible_names
        assert "traveling" in visible_names

    def test_announcements_visible_to_all(self, chat_repo):
        """Announcements should be visible to non-admins (admin_only=0)."""
        channels = chat_repo.get_channels()
        visible = [c for c in channels if not c["admin_only"]]
        visible_names = [c["name"] for c in visible]
        assert "announcements" in visible_names
```

- [ ] **Step 2: Run tests to verify they pass** (these test the data, not the route)

Run: `uv run pytest tests/test_chat.py::TestAdminOnlyFiltering -v`
Expected: 2 PASS

- [ ] **Step 3: Update `list_channels` route**

In `api/routers/chat.py`, modify the `list_channels` function (around line 87):

```python
@router.get("/channels")
async def list_channels(x_player_id: int = Header()):
    _verify_member(x_player_id)
    channels = chat_repo.get_channels()
    if not _is_admin(x_player_id):
        channels = [ch for ch in channels if not ch["admin_only"]]
    unread = chat_repo.get_unread_counts(x_player_id)
    for ch in channels:
        ch["unread"] = unread.get(ch["id"], 0)
    return {"channels": channels}
```

- [ ] **Step 4: Update `get_unread` route**

In `api/routers/chat.py`, modify the `get_unread` function (around line 408):

```python
@router.get("/unread")
async def get_unread(x_player_id: int = Header()):
    _verify_member(x_player_id)
    counts = chat_repo.get_unread_counts(x_player_id)
    if not _is_admin(x_player_id):
        admin_only_ids = {ch["id"] for ch in chat_repo.get_channels() if ch["admin_only"]}
        counts = {k: v for k, v in counts.items() if k not in admin_only_ids}
    total = sum(counts.values())
    return {"channels": counts, "total": total}
```

- [ ] **Step 5: Run full test suite**

Run: `uv run pytest tests/test_chat.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add api/routers/chat.py tests/test_chat.py
git commit -m "feat: filter admin-only channels from non-admin users"
```

---

### Task 3: Traveling Members Endpoint

**Files:**
- Modify: `api/routers/chat.py` (add endpoint)
- Modify: `frontend/src/lib/api-client.ts` (add method)

- [ ] **Step 1: Add `torn_client` module-level variable to chat router**

In `api/routers/chat.py`, add to the module-level variables at the top (around line 20, after the existing `notification_dispatcher = None`):

```python
torn_client = None  # Set by main.py
```

- [ ] **Step 2: Add traveling endpoint to chat router**

Add to `api/routers/chat.py` after the `get_online` endpoint (around line 568):

```python
@router.get("/traveling")
async def get_traveling(x_player_id: int = Header()):
    """Return list of faction members currently traveling."""
    _verify_member(x_player_id)
    if not torn_client:
        return {"travelers": []}

    try:
        members = await torn_client.fetch_members()
    except Exception:
        return {"travelers": []}

    travelers = []
    for m in members:
        state = m.status.state.lower()
        desc = m.status.description.lower()
        if "travel" in state or "abroad" in state or "travel" in desc or "abroad" in desc:
            travelers.append({
                "player_id": m.id,
                "name": m.name,
                "status": m.status.description,
            })
    return {"travelers": travelers}
```

- [ ] **Step 3: Wire `torn_client` to the chat module**

In `api/main.py`, find where `chat_mod.chat_repo = chat_repo` is set during startup, and add:

```python
chat_mod.torn_client = torn_client
```

Check if it already exists — search for `chat_mod.torn_client` or `chat_mod` assignments in `main.py`.

- [ ] **Step 4: Add API client method**

In `frontend/src/lib/api-client.ts`, add after the `chatOnline` method (around line 198):

```typescript
chatTraveling: () => apiFetch<{ travelers: { player_id: number; name: string; status: string }[] }>("/api/chat/traveling"),
```

- [ ] **Step 5: Run backend tests**

Run: `uv run pytest tests/ -v`
Expected: All PASS (endpoint is additive, no existing tests break)

- [ ] **Step 6: Commit**

```bash
git add api/routers/chat.py api/main.py frontend/src/lib/api-client.ts
git commit -m "feat: GET /api/chat/traveling endpoint for traveling members"
```

---

### Task 4: Optimistic Message Rendering

**Files:**
- Modify: `frontend/src/hooks/useChat.ts`
- Modify: `frontend/src/types/chat.ts`

- [ ] **Step 1: Extend Message type for optimistic flag**

In `frontend/src/types/chat.ts`, add optional field to `Message`:

```typescript
export interface Message {
  id: number;
  channel_id: number;
  thread_id: number | null;
  player_id: number;
  player_name: string;
  content: string;
  bot_id: number | null;
  mentions: number[];
  pinned: number;
  deleted: number;
  created_at: number;
  edited_at: number | null;
  _optimistic?: boolean;
}
```

- [ ] **Step 2: Update `sendMessage` for optimistic rendering**

In `frontend/src/hooks/useChat.ts`, modify the `sendMessage` callback (around line 68). The hook needs access to the current player's ID and name. Add refs at the top of the hook:

```typescript
const myPlayerIdRef = useRef<number>(0);
const myPlayerNameRef = useRef<string>("");

// Update refs from localStorage on mount
useEffect(() => {
  const pid = localStorage.getItem("myKeyPlayer");
  const name = localStorage.getItem("myKeyName");
  if (pid) myPlayerIdRef.current = Number(pid);
  if (name) myPlayerNameRef.current = name;
}, []);
```

Then modify `sendMessage`:

```typescript
const sendMessage = useCallback(async (content: string, mentions: number[] = []) => {
  if (!activeChannelRef.current) return;

  // Optimistic rendering — show message immediately
  const tempId = -Date.now();
  const tempMsg: Message = {
    id: tempId,
    channel_id: activeChannelRef.current,
    thread_id: null,
    player_id: myPlayerIdRef.current,
    player_name: myPlayerNameRef.current,
    content,
    bot_id: null,
    mentions,
    pinned: 0,
    deleted: 0,
    created_at: Math.floor(Date.now() / 1000),
    edited_at: null,
    _optimistic: true,
  };
  setMessages(prev => [...prev, tempMsg]);

  // Try WebSocket first
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({
      type: "message",
      payload: { channel_id: activeChannelRef.current, content, mentions },
    }));
  } else {
    // REST fallback — replace optimistic with server response
    try {
      const msg = await api.chatSendMessage(activeChannelRef.current, content, mentions);
      setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
    } catch {
      // Mark as failed
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, _optimistic: false, deleted: 1 } : m
      ));
    }
  }
}, []);
```

- [ ] **Step 3: Update `handleWSMessage` to deduplicate optimistic messages**

In the `"message"` case of `handleWSMessage` (around line 141):

```typescript
case "message": {
  const m = p as unknown as Message;
  if (m.channel_id === activeChannelRef.current) {
    // Deduplicate: if this is the echo of our own optimistic message, replace it
    setMessages(prev => {
      const optimisticIdx = prev.findIndex(
        msg => msg._optimistic &&
        msg.player_id === m.player_id &&
        msg.content === m.content
      );
      if (optimisticIdx !== -1) {
        // Replace optimistic with server-confirmed message
        const next = [...prev];
        next[optimisticIdx] = m;
        return next;
      }
      return [...prev, m];
    });
    // Mark as read
    api.chatUpdateRead(m.channel_id, m.id).catch(() => {});
  } else {
    setUnreadCounts(prev => ({
      ...prev,
      [m.channel_id]: (prev[m.channel_id] ?? 0) + 1,
    }));
  }
  break;
}
```

- [ ] **Step 4: Build frontend to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/chat.ts frontend/src/hooks/useChat.ts
git commit -m "feat: optimistic message rendering for instant chat feedback"
```

---

### Task 5: Traveling Header Widget

**Files:**
- Modify: `frontend/src/components/chat/ChatLayout.tsx`

- [ ] **Step 1: Add traveling header to ChatLayout**

In `frontend/src/components/chat/ChatLayout.tsx`, add state and fetch for travelers. Add after the existing `useEffect` that loads members/adminIds (around line 49):

```typescript
const [travelers, setTravelers] = useState<{ player_id: number; name: string; status: string }[]>([]);

useEffect(() => {
  if (!activeChannel || activeChannel.name !== "traveling") {
    setTravelers([]);
    return;
  }
  let cancelled = false;
  const fetchTravelers = () => {
    api.chatTraveling()
      .then(data => { if (!cancelled) setTravelers(data.travelers); })
      .catch(() => {});
  };
  fetchTravelers();
  const interval = setInterval(fetchTravelers, 30_000);
  return () => { cancelled = true; clearInterval(interval); };
}, [activeChannel]);
```

Then in the chat view's channel header section (around line 202, the `{/* Channel header */}` block), add the traveling strip. Replace the existing header block:

```tsx
{/* Channel header */}
<div className="border-b border-border">
  <div className="p-3 flex items-center gap-2">
    <button
      onClick={() => setMobileView("channels")}
      className="lg:hidden text-text-muted hover:text-text-primary text-sm"
    >
      &larr;
    </button>
    <div className="flex-1">
      <h2 className="text-sm font-bold text-text-primary">#{activeChannel.name}</h2>
      {activeChannel.description && (
        <div className="text-[11px] text-text-muted">{activeChannel.description}</div>
      )}
    </div>
  </div>
  {activeChannel.name === "traveling" && (
    <div className="px-3 pb-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <span className="text-[11px] text-text-muted shrink-0">✈️ Now traveling:</span>
      {travelers.length === 0 ? (
        <span className="text-[11px] text-text-muted italic">No members traveling right now</span>
      ) : (
        travelers.map(t => (
          <span
            key={t.player_id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-torn-blue/10 text-torn-blue text-[11px] whitespace-nowrap shrink-0"
          >
            {t.name}
            <span className="text-torn-blue/60">{t.status.replace(/^(Traveling|In )/, "→").replace(/Abroad in /, "")}</span>
          </span>
        ))
      )}
    </div>
  )}
</div>
```

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/ChatLayout.tsx
git commit -m "feat: traveling members header strip in #traveling channel"
```

---

### Task 6: Dashboard Unread Chat Banner

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add unread chat fetch and banner**

In `frontend/src/app/dashboard/page.tsx`, add state for unread data. Add after the existing state declarations (around line 53):

```typescript
const [chatUnread, setChatUnread] = useState<{ channels: Record<string, number>; total: number } | null>(null);
const [chatChannelNames, setChatChannelNames] = useState<Record<number, string>>({});
const [chatBannerDismissed, setChatBannerDismissed] = useState(false);
```

Add to the `load` function inside the `Promise.all` array (around line 62), adding two more fetches:

```typescript
api.chatUnread().catch(() => null),
api.chatChannels().catch(() => null),
```

Then inside the `.then(...)` handler, add handling for these (they'll be the 6th and 7th args):

```typescript
// After the existing handlers in .then(), add:
if (chatUnreadData) {
  setChatUnread(chatUnreadData as { channels: Record<string, number>; total: number });
}
if (chatChannelsData) {
  const nameMap: Record<number, string> = {};
  for (const ch of (chatChannelsData as { channels: { id: number; name: string }[] }).channels) {
    nameMap[ch.id] = ch.name;
  }
  setChatChannelNames(nameMap);
}
```

Note: update the Promise.all destructuring to include the new parameters.

Then add the banner in the JSX, right after `<h1>Dashboard</h1>` and before the war alert (around line 142):

```tsx
{chatUnread && chatUnread.total > 0 && !chatBannerDismissed && (
  <div className="flex items-center gap-3 bg-torn-blue/10 border border-torn-blue/30 rounded-xl px-4 py-3">
    <span className="text-lg">💬</span>
    <Link
      href={`/chat?channel=${Object.entries(chatUnread.channels).find(([, v]) => v > 0)?.[0] || ""}`}
      className="flex-1 text-sm"
    >
      <span className="font-bold text-text-primary">{chatUnread.total} unread message{chatUnread.total !== 1 ? "s" : ""}</span>
      <span className="text-text-muted ml-1.5">
        in {Object.entries(chatUnread.channels)
          .filter(([, v]) => v > 0)
          .map(([id]) => `#${chatChannelNames[Number(id)] || id}`)
          .join(", ")}
      </span>
    </Link>
    <button
      onClick={() => setChatBannerDismissed(true)}
      className="text-text-muted hover:text-text-primary transition-colors shrink-0 text-sm"
      aria-label="Dismiss"
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: unread chat messages banner on dashboard"
```

---

### Task 7: Chat Channels in Command Palette

**Files:**
- Modify: `frontend/src/components/nav/CommandPalette.tsx`

- [ ] **Step 1: Add channel fetching and merged results**

Rewrite `CommandPalette.tsx` to include channels. Add state for channels:

```typescript
const [channels, setChannels] = useState<{ id: number; name: string; unread: number }[]>([]);

// Fetch channels on open
useEffect(() => {
  if (!open) return;
  api.chatChannels()
    .then(data => {
      setChannels(data.channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        unread: ch.unread ?? 0,
      })));
    })
    .catch(() => {});
}, [open]);
```

Add import for `api`:

```typescript
import { api } from "@/lib/api-client";
```

Add the channel icon map (same as ChannelList):

```typescript
const CHANNEL_ICONS: Record<string, string> = {
  general: "💬", "war-room": "⚔️", trading: "💰", "off-topic": "🎲",
  announcements: "📢", "hub-feedback": "💡", traveling: "✈️", leadership: "👑",
};
```

Replace the simple `results` with merged results:

```typescript
const pageResults = searchNavItems(query);

const channelResults = channels
  .filter(ch => !query || fuzzyMatch(query, ch.name))
  .map(ch => ({
    label: `#${ch.name}`,
    href: `/chat?channel=${ch.id}`,
    icon: CHANNEL_ICONS[ch.name] || "💬",
    group: "Chat",
    unread: ch.unread,
  }));

// Merge: unread channels first, then page results, then other channels
const unreadChannels = channelResults.filter(c => c.unread > 0).sort((a, b) => b.unread - a.unread);
const otherChannels = channelResults.filter(c => c.unread === 0);
const results = [...unreadChannels, ...pageResults.map(r => ({ ...r, unread: 0 })), ...otherChannels];
```

Add import for `fuzzyMatch`:

```typescript
import { searchNavItems, fuzzyMatch } from "@/lib/nav-data";
```

- [ ] **Step 2: Update the result rendering to show unread badges**

In the results list rendering, update the button to show unread:

```tsx
{results.map((item, i) => (
  <button
    key={item.href}
    onClick={() => navigate(item.href)}
    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 ${
      i === selectedIndex
        ? "bg-torn-green/10 text-text-primary"
        : "text-text-secondary hover:bg-bg-elevated"
    }`}
  >
    <span>{item.icon}</span>
    <span className="flex-1 text-left">{item.label}</span>
    {item.unread > 0 && (
      <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-torn-green text-bg-primary rounded-full px-1">
        {item.unread}
      </span>
    )}
    <span className="text-[10px] text-text-muted">{item.group}</span>
  </button>
))}
```

Update the empty-query view to show unread channels instead of just "Type to search...":

```tsx
{!query && unreadChannels.length === 0 && (
  <p className="px-4 py-6 text-sm text-text-muted text-center">
    Type to search all pages...
  </p>
)}
```

When `!query && unreadChannels.length > 0`, the unread channels will naturally show at the top via the `results` array.

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/nav/CommandPalette.tsx
git commit -m "feat: chat channels in Cmd+K command palette with unread badges"
```

---

### Task 8: Push Notification People Picker

**Files:**
- Modify: `frontend/src/components/admin/push/SendNotification.tsx`

- [ ] **Step 1: Add member fetching and picker state**

Add member state at the top of `SendNotification`:

```typescript
const [members, setMembers] = useState<{ player_id: number; name: string }[]>([]);
const [playerSearch, setPlayerSearch] = useState('');
const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
```

Fetch members in the existing `useEffect` (around line 32):

```typescript
useEffect(() => {
  adminFetch<{ templates: Template[] }>('/api/admin/push/templates').then(d => setTemplates(d.templates)).catch(() => {});
  adminFetch<{ groups: { id: number; name: string }[] }>('/api/admin/push/groups').then(d => setGroups(d.groups)).catch(() => {});
  adminFetch<{ keys: { player_id: number; name: string }[] }>('/api/keys').then(d => setMembers(d.keys)).catch(() => {});
}, [adminFetch]);
```

- [ ] **Step 2: Replace the player ID input with searchable picker**

Replace the existing `targetType === 'player'` block (around line 164):

```tsx
{targetType === 'player' && (
  <div className="mt-2 relative">
    <input
      value={playerSearch}
      onChange={e => {
        setPlayerSearch(e.target.value);
        setShowPlayerDropdown(true);
        // If it's a pure number, set as target directly
        if (/^\d+$/.test(e.target.value.trim())) {
          setTargetValue(e.target.value.trim());
        }
      }}
      onFocus={() => setShowPlayerDropdown(true)}
      className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
      placeholder="Search by name or enter Player ID..."
    />
    {targetValue && (
      <div className="text-[10px] text-torn-green mt-1">
        Selected: {members.find(m => String(m.player_id) === targetValue)?.name || `Player`} [{targetValue}]
      </div>
    )}
    {showPlayerDropdown && playerSearch && (
      <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-bg-surface border border-border rounded-lg shadow-lg">
        {members
          .filter(m => {
            const q = playerSearch.toLowerCase();
            return m.name.toLowerCase().includes(q) || String(m.player_id).startsWith(q);
          })
          .slice(0, 20)
          .map(m => (
            <button
              key={m.player_id}
              type="button"
              onClick={() => {
                setTargetValue(String(m.player_id));
                setPlayerSearch(m.name);
                setShowPlayerDropdown(false);
              }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-bg-elevated text-text-primary flex justify-between"
            >
              <span>{m.name}</span>
              <span className="text-text-muted text-xs">[{m.player_id}]</span>
            </button>
          ))}
        {members.filter(m => {
          const q = playerSearch.toLowerCase();
          return m.name.toLowerCase().includes(q) || String(m.player_id).startsWith(q);
        }).length === 0 && (
          <div className="px-3 py-2 text-xs text-text-muted">No members found. Type a raw ID to send to anyone.</div>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Reset picker state on target type change**

In the radio button `onChange` handler (around line 157), add reset:

```typescript
onChange={e => { setTargetType(e.target.value); setTargetValue(''); setPlayerSearch(''); setShowPlayerDropdown(false); }}
```

- [ ] **Step 4: Close dropdown on outside click**

Add a simple effect to close the dropdown:

```typescript
useEffect(() => {
  const handleClick = () => setShowPlayerDropdown(false);
  if (showPlayerDropdown) {
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }
}, [showPlayerDropdown]);
```

- [ ] **Step 5: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/push/SendNotification.tsx
git commit -m "feat: searchable people picker for push notifications"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full backend test suite**

Run: `uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 4: Commit any lint fixes**

If lint produced fixable issues, fix and commit.

- [ ] **Step 5: Update changelog**

In `frontend/src/data/changelog.ts`, bump `CURRENT_VERSION` (minor bump for new features) and add entry at the top of `CHANGELOG`:

```typescript
{
  version: "<new version>",
  date: "2026-04-06",
  title: "Chat Improvements",
  changes: [
    { type: "feat", text: "Traveling members shown in #traveling channel header" },
    { type: "feat", text: "Unread chat messages banner on dashboard" },
    { type: "feat", text: "Chat channels searchable in Cmd+K command palette" },
    { type: "feat", text: "People picker for push notifications (search by name)" },
    { type: "feat", text: "Leadership channel visible only to admins" },
    { type: "improve", text: "Messages appear instantly when you send them" },
  ],
},
```

- [ ] **Step 6: Final commit**

```bash
git add frontend/src/data/changelog.ts
git commit -m "chore: bump version and add changelog for chat improvements"
```
