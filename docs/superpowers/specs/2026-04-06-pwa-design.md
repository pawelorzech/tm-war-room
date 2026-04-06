# PWA Design — TM Hub

## Summary

Convert TM Hub into a Progressive Web App with a neon-glow "TM" icon, app-shell caching for instant startup + offline page, and a one-time platform-specific install prompt.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Icon style | Neon Glow "TM" | Fits Torn cyberpunk aesthetic, green-on-dark brand |
| Cache strategy | App shell only | Real-time data shouldn't be served stale; cache assets for fast start |
| Install prompt | Sliding toast | Non-invasive, doesn't block dashboard |
| Implementation | Manual (no library) | Existing SW for push; extending it avoids conflicts, zero deps |

## 1. Web App Manifest

File: `frontend/public/manifest.json`

```json
{
  "name": "TM Hub",
  "short_name": "TM Hub",
  "description": "Torn.com faction toolkit for The Masters",
  "start_url": "/dashboard",
  "display": "standalone",
  "theme_color": "#0d1117",
  "background_color": "#0d1117",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Linked via Next.js `metadata` export in `layout.tsx`.

## 2. Service Worker — App Shell Cache

Extend existing `frontend/public/sw.js` (currently push-only) with:

### Install event
- Precache app shell: key HTML pages, `/_next/static/**` assets, `/offline.html`
- Cache name: `tm-hub-shell-v1` (versioned for busting)

### Activate event
- Delete old cache versions (any `tm-hub-shell-*` not matching current version)

### Fetch event
- **Static assets** (`/_next/static/`, `/icons/`, CSS/JS/fonts): cache-first, network fallback
- **HTML pages**: network-first, cache fallback
- **API calls** (`/api/`): network-only (no caching of data)
- **Offline fallback**: when network fails and no cache hit → serve `/offline.html`

### Existing push/notification logic
- Untouched. Push handler and notificationclick handler remain as-is.

## 3. Offline Page

File: `frontend/public/offline.html`

- Self-contained HTML with inline styles (no external deps)
- Dark theme matching TM Hub (`#0d1117` bg, `#e6edf3` text)
- Neon glow TM logo (inline SVG)
- Message: "Jesteś offline. Połącz się z internetem, żeby zobaczyć aktualne dane."
- Retry button that calls `location.reload()`

## 4. Install Prompt Component

File: `frontend/src/components/layout/InstallPrompt.tsx`

### Behavior
- Appears 3 seconds after login (authenticated users only)
- Does NOT appear if already installed (`display-mode: standalone` media query)
- Does NOT appear if previously dismissed (`localStorage: tm-hub-pwa-prompt-dismissed`)
- Dismissed via X button or "Może później" → sets localStorage flag, never returns

### Platform detection
- **Android/Chrome**: Captures `beforeinstallprompt` event. Toast shows "Zainstaluj TM Hub" button which calls `prompt()` on the deferred event.
- **iOS Safari**: Detects via `'standalone' in navigator` (iOS-only property) + `!navigator.standalone` (not already installed). Toast shows instructions: "Kliknij Udostępnij ⎋ → Dodaj do ekranu głównego" with share icon visual.
- **Desktop/other**: Not shown (or generic "Add to home screen" if `beforeinstallprompt` fires).

### Visual design
- Slides up from bottom, positioned above `BottomNavBar` on mobile
- Background: `bg-surface` (`#161b22`)
- Border: `border` (`#30363d`)
- Green accent on install button
- Small TM icon on the left
- X close button top-right
- Slide-in animation (CSS transform + transition)

### Integration
- Rendered in `AppShell.tsx`, inside `ShellContent`, below the main content area

## 5. Meta Tags — layout.tsx

Extend existing `metadata` and `viewport` exports:

```typescript
export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
  manifest: "/manifest.json",
  themeColor: "#0d1117",
  appleWebApp: {
    capable: true,
    title: "TM Hub",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192" },
      { url: "/icons/icon-512.png", sizes: "512x512" },
    ],
    apple: "/icons/icon-192.png",
  },
};
```

### Service Worker Registration

Move eager SW registration from `usePushNotifications` (conditional) to `AppShell` level:
- Register `/sw.js` on mount for all authenticated users
- `usePushNotifications` continues to use `serviceWorker.ready` — no conflict

## 6. Icons

### Source
- `frontend/public/icons/icon.svg` — neon glow TM logo (SVG source)

### Style
- Dark background (`#0d1117`) with rounded corners (iOS/Android safe zone)
- "TM" text in green (`#3fb950`) with gaussian blur glow filter
- Subtle circular ring accent
- Maskable versions: same design with 40% safe-area padding

### Generated files (committed to repo)
- `frontend/public/icons/icon-192.png`
- `frontend/public/icons/icon-512.png`
- `frontend/public/icons/icon-maskable-192.png`
- `frontend/public/icons/icon-maskable-512.png`
- `frontend/public/icons/icon.svg` (source)

## File Changes Summary

| File | Action |
|------|--------|
| `frontend/public/manifest.json` | Create |
| `frontend/public/offline.html` | Create |
| `frontend/public/sw.js` | Modify (extend with cache logic) |
| `frontend/public/icons/icon.svg` | Create |
| `frontend/public/icons/icon-*.png` | Create (4 files) |
| `frontend/src/app/layout.tsx` | Modify (metadata, icons) |
| `frontend/src/components/layout/InstallPrompt.tsx` | Create |
| `frontend/src/components/layout/AppShell.tsx` | Modify (add InstallPrompt + SW registration) |
