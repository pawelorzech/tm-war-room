# Mobile Chat Keyboard UI Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile chat UI that breaks when the on-screen keyboard opens — scroll jumping, bottom nav eating space, and blank pages on channel switch.

**Architecture:** Add keyboard-open detection to `AppShell` via `visualViewport.resize` (not scroll), expose it as a CSS class on `<html>` so both `BottomNavBar` and `<main>` padding respond. Remove the `visualViewport.scroll` listener that causes the feedback loop. Blur active element on channel switch to dismiss keyboard.

**Tech Stack:** Next.js 15 / React 19 / Tailwind v4 — no new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/layout/AppShell.tsx` | Modify | Keyboard detection + `--vvh` stability fix + conditional padding |
| `frontend/src/components/nav/BottomNavBar.tsx` | Modify | Hide on chat page when keyboard open |
| `frontend/src/components/chat/ChatLayout.tsx` | Modify | Blur on channel switch |

No new files. No new dependencies.

---

## Context for the Engineer

The app runs inside **Torn PDA** (a mobile WebView wrapper). When the soft keyboard opens:

1. PDA resizes the layout viewport (unlike stock iOS Safari which uses visual viewport offset).
2. The `visualViewport.scroll` listener in `AppShell` updates `--vvh` on every inner scroll, causing a feedback loop: scroll → `--vvh` change → flex reflow → scroll position jump.
3. The `BottomNavBar` (`fixed bottom-0`) stays visible above the keyboard, wasting ~60px.
4. The `<main>` keeps `pb-20` (80px) for the nav bar even though it's not needed during typing.
5. Switching channels with keyboard open leaves the page blank because focus isn't cleared.

The build verification command is:

```bash
cd frontend && npm run build
```

There is no frontend test suite — the static export build IS the test.

---

### Task 1: Fix `--vvh` feedback loop in AppShell

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx:56-76`

The `visualViewport.scroll` listener triggers `--vvh` updates when the user scrolls the message list with keyboard open, causing a layout feedback loop. Remove it and add a guard to only update `--vvh` when the value actually changes.

- [ ] **Step 1: Remove scroll listener and add change guard**

In `AppShell.tsx`, replace the visual viewport effect (lines 56-76) with:

```tsx
// Track visual viewport height (handles keyboard — visualViewport shrinks on keyboard open)
// ONLY listen to "resize" — the "scroll" event fires during inner-container scroll on PDA
// and causes a feedback loop (scroll → --vvh change → flex reflow → scroll jump).
useEffect(() => {
  let rafId: number | null = null;
  let lastH = 0;
  const update = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
      if (h !== lastH) {
        lastH = h;
        document.documentElement.style.setProperty("--vvh", `${h}px`);
      }
      rafId = null;
    });
  };
  update();
  window.visualViewport?.addEventListener("resize", update);
  return () => {
    window.visualViewport?.removeEventListener("resize", update);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}, []);
```

Key changes from current code:
- **Removed** `visualViewport.scroll` listener (the cause of the feedback loop)
- **Added** `lastH` guard — only sets CSS property when value actually changes
- **Added** `Math.round` — avoids sub-pixel jitter from fractional viewport heights

- [ ] **Step 2: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: Build succeeds. No errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/layout/AppShell.tsx && git commit -m "fix(chat): remove visualViewport.scroll listener causing scroll feedback loop"
```

---

### Task 2: Add keyboard-open detection to AppShell

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx:56-76` (the effect from Task 1)
- Modify: `frontend/src/components/layout/AppShell.tsx:130-135` (main element)

Detect keyboard by comparing current `visualViewport.height` to the initial (full) height. When the difference exceeds 150px, the keyboard is open. Expose this as:
1. A CSS class `keyboard-open` on `<html>` (for BottomNavBar CSS hide)
2. Conditional removal of `pb-20` on the `<main>` when on chat page

- [ ] **Step 1: Extend the viewport effect to detect keyboard**

Replace the effect from Task 1 with this expanded version:

```tsx
// Track visual viewport height + detect keyboard open
// Keyboard detection: if viewport shrinks >150px from initial height, keyboard is open.
// Exposed as CSS class "keyboard-open" on <html> for child components.
useEffect(() => {
  let rafId: number | null = null;
  let lastH = 0;
  let initialH = Math.round(window.visualViewport?.height ?? window.innerHeight);
  const KEYBOARD_THRESHOLD = 150;

  const update = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
      if (h !== lastH) {
        lastH = h;
        document.documentElement.style.setProperty("--vvh", `${h}px`);
        // Update keyboard-open class
        if (initialH - h > KEYBOARD_THRESHOLD) {
          document.documentElement.classList.add("keyboard-open");
        } else {
          document.documentElement.classList.remove("keyboard-open");
          // Update initial height when keyboard closes (handles orientation changes)
          initialH = h;
        }
      }
      rafId = null;
    });
  };
  update();
  window.visualViewport?.addEventListener("resize", update);
  return () => {
    window.visualViewport?.removeEventListener("resize", update);
    document.documentElement.classList.remove("keyboard-open");
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}, []);
```

- [ ] **Step 2: Make `pb-20` conditional on keyboard state for chat page**

Replace the `<main>` element (lines 129-136) with:

```tsx
<main
  className={`lg:ml-[200px] pt-12 lg:pt-0 flex flex-col ${
    onChatPage
      ? "overflow-hidden lg:min-h-screen pb-0"
      : "min-h-screen pb-20 lg:pb-0"
  }`}
  style={onChatPage ? { height: "var(--vvh, 100dvh)" } : undefined}
>
```

Key change: On chat page, **always** use `pb-0` — the chat layout manages its own spacing via flex. The `pb-20` was adding dead space inside the `--vvh`-constrained container. Non-chat pages still get `pb-20` for the bottom nav.

- [ ] **Step 3: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/layout/AppShell.tsx && git commit -m "fix(chat): add keyboard detection and remove pb-20 on chat page"
```

---

### Task 3: Hide BottomNavBar on chat page when keyboard is open

**Files:**
- Modify: `frontend/src/components/nav/BottomNavBar.tsx:93-131`

Use the `keyboard-open` CSS class (set by AppShell on `<html>`) plus a `data-chat-page` attribute to hide the nav bar. This avoids prop drilling and keeps the logic declarative.

- [ ] **Step 1: Add `data-chat-page` attribute to AppShell's root div**

In `AppShell.tsx`, modify the root div (line 85) from:

```tsx
<div className="min-h-screen">
```

to:

```tsx
<div className="min-h-screen" data-chat-page={onChatPage || undefined}>
```

- [ ] **Step 2: Hide BottomNavBar via CSS when keyboard is open on chat page**

In `BottomNavBar.tsx`, change the outer container div (line 95) from:

```tsx
<div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-bg-surface/95 backdrop-blur-md">
```

to:

```tsx
<div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-bg-surface/95 backdrop-blur-md keyboard-open-chat-hide">
```

Then add this CSS rule to `frontend/src/app/globals.css`:

```css
/* Hide bottom nav when keyboard is open on chat page */
html.keyboard-open [data-chat-page] .keyboard-open-chat-hide {
  display: none;
}
```

- [ ] **Step 3: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/layout/AppShell.tsx src/components/nav/BottomNavBar.tsx src/app/globals.css && git commit -m "fix(chat): hide bottom nav when keyboard is open on chat page"
```

---

### Task 4: Blur active element on channel switch to dismiss keyboard

**Files:**
- Modify: `frontend/src/components/chat/ChatLayout.tsx:126-132`

When switching channels on mobile, dismiss the keyboard by blurring the active element. This prevents the blank-page issue seen in the video when navigating with keyboard open.

- [ ] **Step 1: Add blur to handleSelectChannel**

In `ChatLayout.tsx`, replace `handleSelectChannel` (lines 126-132) with:

```tsx
const handleSelectChannel = (id: number) => {
  // Dismiss keyboard on mobile before switching — prevents blank page
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  setSelectedThread(null);
  setShowAdmin(false);
  selectChannel(id);
  setMobileView("chat");
  updateUrl(id, null);
};
```

- [ ] **Step 2: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/chat/ChatLayout.tsx && git commit -m "fix(chat): blur active element on channel switch to dismiss keyboard"
```

---

### Task 5: Final build verification and squash commit

- [ ] **Step 1: Full build verification**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no warnings related to changed files.

- [ ] **Step 2: Run backend tests to ensure no regression**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/ -v --tb=short
```

Expected: All tests pass (backend unaffected — this is frontend-only).

- [ ] **Step 3: Manual verification checklist**

Verify on mobile (PDA or responsive devtools at 390px width):
- [ ] Open chat page, tap message input — keyboard opens
- [ ] Bottom nav bar disappears when keyboard opens
- [ ] More messages visible (no wasted 140px)
- [ ] Scroll up through messages with keyboard open — no jumping/blank page
- [ ] Switch channels with keyboard open — keyboard dismisses, new channel loads correctly
- [ ] Close keyboard — bottom nav reappears
- [ ] Desktop layout unchanged (bottom nav hidden by `lg:hidden` as before)
