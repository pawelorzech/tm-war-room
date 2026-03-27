# Mobile-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile card layout for <768px screens while keeping the existing desktop table layout unchanged.

**Architecture:** New render functions (`renderMobileCards`, `renderMobileEnemyCards`, `renderMobileHeader`) run alongside existing ones. `isMobile()` helper decides which path to take. CSS media queries hide/show the appropriate containers. Single breakpoint: 768px.

**Tech Stack:** Vanilla HTML/CSS/JS — no new dependencies.

---

## File Structure

| File | Changes |
|------|---------|
| `static/index.html` | Add mobile header div, card containers, sort dropdowns (~20 new lines) |
| `static/style.css` | Add card styles, mobile header, hamburger, sort dropdown, replace old mobile media query (~120 new lines) |
| `static/app.js` | Add `isMobile()`, `renderMobileHeader()`, `renderMobileCards()`, `renderMobileEnemyCards()`, card interactions, resize listener (~180 new lines) |

No backend changes. No new files. No new dependencies.

---

### Task 1: HTML — Add mobile containers and sort dropdowns

**Files:**
- Modify: `static/index.html:28-55` (add mobile header before existing header)
- Modify: `static/index.html:64-89` (add sort dropdown + card container to Our Team tab)
- Modify: `static/index.html:92-126` (add sort dropdown + card container to Enemy tab)

- [ ] **Step 1: Add mobile header div**

Add this block right after `<div id="app-content" style="display:none">` (line 28) and before the existing `<header>` (line 29):

```html
    <div id="mobile-header" class="mobile-only">
        <div class="mh-bar">
            <div class="mh-war" id="mh-war">TM War Room</div>
            <button class="mh-hamburger" id="mh-hamburger" onclick="toggleHamburger()">&#9776;</button>
        </div>
        <div class="mh-menu" id="mh-menu" style="display:none">
            <div class="mh-user" id="mh-user"></div>
            <button onclick="refresh();toggleHamburger()">&#128260; Refresh <span id="mh-last-update" class="mh-meta"></span></button>
            <a href="/admin" class="mh-link">&#128736; Admin</a>
            <button onclick="toggleTheme();updateMobileThemeBtn()">&#127769; <span id="mh-theme-label">Dark Mode</span></button>
            <button class="mh-logout" onclick="removeMyKey()">&#8617; Logout</button>
        </div>
    </div>
```

- [ ] **Step 2: Add `desktop-only` class to existing header**

Change line 29 from:

```html
    <header>
```

to:

```html
    <header class="desktop-only">
```

- [ ] **Step 3: Add sort dropdown and card container to Our Team tab**

Inside `<div id="tab-our-team">`, after the yata-warning div (line 68) and before the `<div class="table-wrap">` (line 69), add:

```html
            <div class="mobile-sort mobile-only" id="our-mobile-sort">
                <span class="mobile-sort-summary" id="our-mobile-summary"></span>
                <select id="our-sort-select" onchange="mobileSortOur(this.value)">
                    <option value="readiness">Sort: Readiness</option>
                    <option value="name">Sort: Name</option>
                    <option value="level">Sort: Level</option>
                    <option value="energy">Sort: Energy</option>
                    <option value="state">Sort: State</option>
                </select>
            </div>
            <div id="our-cards" class="mobile-only card-list"></div>
```

Add `desktop-only` class to the existing `<div class="table-wrap">`:

```html
            <div class="table-wrap desktop-only">
```

- [ ] **Step 4: Add sort dropdown and card container to Enemy tab**

Inside `<div id="tab-enemy">`, after the `<div class="enemy-header">` block (line 99) and before the `<div class="table-wrap">` (line 100), add:

```html
            <div class="mobile-sort mobile-only" id="enemy-mobile-sort">
                <span class="mobile-sort-summary" id="enemy-mobile-summary"></span>
                <select id="enemy-sort-select" onchange="mobileSortEnemy(this.value)">
                    <option value="threat_score">Sort: Threat</option>
                    <option value="name">Sort: Name</option>
                    <option value="level">Sort: Level</option>
                    <option value="state">Sort: State</option>
                </select>
            </div>
            <div id="enemy-cards" class="mobile-only card-list"></div>
```

Add `desktop-only` class to the existing enemy `<div class="table-wrap">`:

```html
            <div class="table-wrap desktop-only">
```

- [ ] **Step 5: Verify HTML structure**

Open the app in a browser. Desktop should look exactly the same (mobile-only elements hidden). Inspect the DOM to confirm new elements exist.

- [ ] **Step 6: Commit**

```bash
git add static/index.html
git commit -m "feat(mobile): add HTML containers for mobile cards, header, and sort dropdowns"
```

---

### Task 2: CSS — Mobile card styles, header, hamburger, responsive breakpoints

**Files:**
- Modify: `static/style.css:184-197` (replace old mobile media query)
- Append to: `static/style.css` (new styles)

- [ ] **Step 1: Replace old mobile media query**

Replace the entire `@media (max-width: 768px)` block (lines 184-197) with responsive utility classes and the new mobile styles:

```css
/* === Responsive utilities === */
.mobile-only { display: none; }
.desktop-only { display: block; }

/* === Mobile header === */
.mh-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-surface); border-bottom: 1px solid var(--border); }
.mh-war { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.mh-war .mh-score-ours { color: var(--green); font-weight: 700; font-size: 14px; }
.mh-war .mh-score-theirs { color: var(--red); font-weight: 700; font-size: 14px; }
.mh-war .mh-score-target { color: var(--text-dim); font-size: 10px; }
.mh-war .mh-chain { font-size: 10px; color: var(--text-muted); }
.mh-war-active { background: var(--green-bg); border-bottom-color: var(--green-border); }
.mh-hamburger { background: none; border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 16px; padding: 4px 8px; min-height: 32px; min-width: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.mh-menu { background: var(--bg-elevated); border-bottom: 1px solid var(--border); padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.mh-menu button, .mh-menu .mh-link { width: 100%; padding: 10px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 12px; text-align: left; cursor: pointer; min-height: 44px; display: flex; align-items: center; gap: 8px; text-decoration: none; }
.mh-menu button:active, .mh-menu .mh-link:active { background: var(--bg-elevated); }
.mh-user { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-surface); border-radius: 6px; border: 1px solid var(--border); font-size: 12px; color: var(--text); }
.mh-user::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.mh-meta { margin-left: auto; font-size: 10px; color: var(--text-dim); }
.mh-logout { background: var(--red-bg) !important; border-color: var(--red-border) !important; color: var(--red) !important; }

/* === Mobile sort === */
.mobile-sort { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0 4px; }
.mobile-sort-summary { font-size: 10px; color: var(--text-muted); letter-spacing: 0.5px; text-transform: uppercase; }
.mobile-sort select { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 11px; color: var(--text); appearance: auto; min-height: 32px; }

/* === Member cards (Our Team) === */
.card-list { display: flex; flex-direction: column; gap: 6px; }
.member-card { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: var(--bg-elevated); cursor: pointer; transition: border-color 0.15s; -webkit-tap-highlight-color: transparent; }
.member-card-row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
.member-card-left { display: flex; align-items: center; gap: 6px; min-width: 0; }
.member-card-left .dot { flex-shrink: 0; }
.member-card-name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
.member-card-name:hover { text-decoration: underline; }
.member-card-level { color: var(--text-dim); font-size: 11px; flex-shrink: 0; }
.member-card-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.member-card-time { font-size: 10px; color: var(--text-dim); }
.member-card-row2 { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
.member-card-details { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 11px; }
.member-card-details .label { color: var(--text-dim); }
.member-card-details .detail-full { grid-column: 1 / -1; }
.member-card-details .detail-link { grid-column: 1 / -1; text-align: right; margin-top: 4px; }
.member-card-details a { color: var(--blue); font-size: 11px; text-decoration: none; background: var(--bg-surface); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); }
.member-card.expanded { border-color: var(--green); }
.member-card.expanded-yellow { border-color: var(--yellow); }
.member-card.expanded-red { border-color: var(--red); }
.member-card .member-card-details { display: none; }
.member-card.expanded .member-card-details,
.member-card.expanded-yellow .member-card-details,
.member-card.expanded-red .member-card-details { display: grid; }

/* === Enemy cards === */
.enemy-card { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: var(--bg-elevated); cursor: pointer; transition: border-color 0.15s; -webkit-tap-highlight-color: transparent; }
.enemy-card-row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
.enemy-card-left { display: flex; align-items: center; gap: 6px; min-width: 0; }
.enemy-card-name { font-weight: 600; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.enemy-card-level { color: var(--text-dim); font-size: 11px; flex-shrink: 0; }
.enemy-card-row2 { display: flex; justify-content: space-between; align-items: center; }
.enemy-card-state { font-size: 11px; }
.enemy-card .btn-attack { min-height: 32px; line-height: 32px; padding: 0 14px; font-size: 12px; }
.enemy-card .btn-attack-muted { background: var(--bg-surface); border-color: var(--border); color: var(--text-dim); }
.enemy-card-details { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 11px; }
.enemy-card-details .label { color: var(--text-dim); }
.enemy-card-links { grid-column: 1 / -1; display: flex; gap: 8px; margin-top: 6px; justify-content: flex-end; }
.enemy-card-links a { color: var(--blue); font-size: 11px; text-decoration: none; background: var(--bg-surface); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); }
.enemy-card .enemy-card-details { display: none; }
.enemy-card.expanded .enemy-card-details { display: grid; }
.enemy-card.expanded { border-color: var(--yellow); }

/* === Mobile bounty button on cards === */
.card-btn-bounty { background: none; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; padding: 2px 8px; min-height: 28px; min-width: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); }
.card-btn-bounty:active { transform: scale(0.9); background: var(--yellow-bg); border-color: var(--yellow-border); }

/* === Mobile breakpoint === */
@media (max-width: 767px) {
    .mobile-only { display: block; }
    .mobile-sort { display: flex; }
    .desktop-only { display: none !important; }
    main { padding: 0.5rem 0.75rem; }
    .tabs { padding: 0; }
    .tab { min-height: 44px; padding: 0.5rem 0.75rem; flex: 1; text-align: center; font-size: 12px; }
    .summary { font-size: 11px; margin-bottom: 8px; }
    .enemy-header { flex-direction: column; align-items: flex-start; }
}

/* === Desktop breakpoint (keep existing table styles, override utilities) === */
@media (min-width: 768px) {
    .mobile-only { display: none !important; }
    .desktop-only { display: block; }
    /* table-wrap needs to restore its display style */
    .table-wrap.desktop-only { display: block; }
}
```

- [ ] **Step 2: Verify desktop is unchanged**

Open the app at >=768px width. Everything should look exactly the same. The old `hide-mobile` classes on table columns are no longer needed (the entire table is hidden on mobile), but they don't hurt on desktop.

- [ ] **Step 3: Verify mobile shows empty containers**

Resize to <768px. Desktop header and tables should disappear. Mobile header bar should show "TM War Room" + hamburger button. Empty card containers should be present (no content yet — that's Task 3+4).

- [ ] **Step 4: Commit**

```bash
git add static/style.css
git commit -m "feat(mobile): add CSS for mobile cards, header, hamburger, and responsive breakpoints"
```

---

### Task 3: JS — Mobile header with hamburger menu

**Files:**
- Modify: `static/app.js` (add functions after line 76, the copyBounty/toast block)

- [ ] **Step 1: Add isMobile() helper and mobile state**

Add after the `copyBounty` function (after line 76):

```javascript
// --- Mobile ---
const MOBILE_BREAKPOINT = 768;
function isMobile() { return window.innerWidth < MOBILE_BREAKPOINT; }

let hamburgerOpen = false;
function toggleHamburger() {
    hamburgerOpen = !hamburgerOpen;
    const menu = document.getElementById('mh-menu');
    const btn = document.getElementById('mh-hamburger');
    menu.style.display = hamburgerOpen ? 'flex' : 'none';
    btn.innerHTML = hamburgerOpen ? '&#10005;' : '&#9776;';
}

function updateMobileThemeBtn() {
    const label = document.getElementById('mh-theme-label');
    if (label) label.textContent = document.body.classList.contains('light') ? 'Light Mode' : 'Dark Mode';
}
```

- [ ] **Step 2: Add renderMobileHeader() function**

Add immediately after the code from Step 1:

```javascript
function renderMobileHeader(war, chain) {
    if (!isMobile()) return;
    const warEl = document.getElementById('mh-war');
    const bar = document.querySelector('.mh-bar');
    const userName = localStorage.getItem('myKeyName');
    const pid = localStorage.getItem('myKeyPlayer');
    const userEl = document.getElementById('mh-user');

    if (userEl) userEl.textContent = userName ? `${userName} [${pid}]` : '';

    if (war?.war_id) {
        const us = war.factions.find(f => f.id === FACTION_ID);
        const them = war.factions.find(f => f.id !== FACTION_ID);
        const now = Math.floor(Date.now() / 1000);

        if (war.start <= now) {
            bar.classList.add('mh-war-active');
            let html = `<span style="color:var(--green);font-weight:600">⚔ RW</span>`;
            html += ` <span class="mh-score-ours">${us?.score || 0}</span>`;
            html += ` <span style="color:var(--text-dim);font-size:10px">–</span>`;
            html += ` <span class="mh-score-theirs">${them?.score || 0}</span>`;
            html += ` <span class="mh-score-target">/ ${war.target}</span>`;
            if (chain && chain.current > 0) {
                html += ` <span class="mh-chain">Chain: ${chain.current}</span>`;
            }
            warEl.innerHTML = html;
        } else {
            bar.classList.remove('mh-war-active');
            const d = war.start - now, h = Math.floor(d/3600), m = Math.floor((d%3600)/60);
            warEl.innerHTML = `<span style="color:var(--yellow)">⚔ RW in ${h}h ${m}m</span>`;
        }
    } else {
        bar.classList.remove('mh-war-active');
        warEl.textContent = 'TM War Room';
    }

    updateMobileThemeBtn();
}
```

- [ ] **Step 3: Wire renderMobileHeader into refresh()**

In the `refresh()` function (around line 351 after adding the new code), after the line `renderWar(ov.war, ov.war_progress);`, add:

```javascript
        renderMobileHeader(ov.war, ov.chain);
```

Also, after the line `document.getElementById('last-update').textContent = new Date().toLocaleTimeString();`, add:

```javascript
        const mhUpdate = document.getElementById('mh-last-update');
        if (mhUpdate) mhUpdate.textContent = 'Last: ' + new Date().toLocaleTimeString();
```

- [ ] **Step 4: Verify mobile header**

Resize to <768px. The compact header should show:
- "TM War Room" + ☰ (no war)
- OR "⚔ RW 50 – 43 / 75 Chain: 15" + ☰ (active war)

Tap ☰ → menu opens with: user badge, Refresh (with timestamp), Admin, Theme toggle, Logout.
Tap ✕ → menu closes.

Desktop should be completely unchanged.

- [ ] **Step 5: Commit**

```bash
git add static/app.js
git commit -m "feat(mobile): add mobile header with hamburger menu and war status"
```

---

### Task 4: JS — Our Team mobile cards

**Files:**
- Modify: `static/app.js` (add renderMobileCards function, modify renderOurTeam to branch)

- [ ] **Step 1: Add renderMobileCards() function**

Add after `renderMobileHeader()` in app.js:

```javascript
let expandedOurCard = null;

function toggleOurCard(cardEl, id) {
    if (expandedOurCard && expandedOurCard !== cardEl) {
        expandedOurCard.className = 'member-card';
    }
    if (cardEl.classList.contains('expanded') || cardEl.classList.contains('expanded-yellow') || cardEl.classList.contains('expanded-red')) {
        cardEl.className = 'member-card';
        expandedOurCard = null;
    } else {
        const color = cardEl.dataset.statusColor;
        cardEl.className = 'member-card ' + (color === 'yellow' ? 'expanded-yellow' : color === 'red' ? 'expanded-red' : 'expanded');
        expandedOurCard = cardEl;
    }
}

function mobileSortOur(val) {
    if (val === 'readiness') {
        ourSort.col = null;
    } else {
        ourSort.col = val;
        ourSort.asc = (val === 'name');
    }
    if (overviewData && detailData) renderOurTeam(overviewData.members, detailData);
}

function renderMobileCards(members, detailResponse) {
    const dm = detailResponse?.members || {};
    const yataDown = detailResponse?.yata_down || false;
    const yataWarn = document.getElementById('yata-warning');
    if (yataWarn) yataWarn.style.display = yataDown ? 'block' : 'none';

    const ord = {green:0,yellow:1,gray:2,red:3};
    let sorted;
    if (ourSort.col) {
        sorted = [...members].sort((a, b) => {
            const va = getOurSortValue(a, dm, ourSort.col);
            const vb = getOurSortValue(b, dm, ourSort.col);
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return ourSort.asc ? cmp : -cmp;
        });
    } else {
        sorted = [...members].sort((a,b) => {
            const ra = ord[getReadiness(a,dm[a.id])]??2, rb = ord[getReadiness(b,dm[b.id])]??2;
            return ra !== rb ? ra-rb : a.name.localeCompare(b.name);
        });
    }

    // Summary counts
    let on=0, hosp=0, off=0;
    for (const m of members) { if (m.last_action.status==='Online') on++; else if (m.status.state==='Hospital') hosp++; else off++; }
    document.getElementById('our-mobile-summary').textContent = `${on} online · ${hosp} hospital`;
    document.getElementById('our-count').textContent = members.length;

    // User info
    const userName = localStorage.getItem('myKeyName');
    if (userName) document.getElementById('user-info').textContent = userName;

    const warActive = isWarActive();

    const container = document.getElementById('our-cards');
    container.innerHTML = sorted.map(m => {
        const d = dm[m.id];
        const r = getReadiness(m, d);
        const dotColor = r;

        // Name color follows dot
        const nameColor = r === 'green' ? 'var(--green)' : r === 'yellow' ? 'var(--yellow)' : r === 'red' ? 'var(--red)' : 'var(--text-muted)';

        // State text (compact)
        let stateHtml;
        if (m.status.state === 'Hospital') {
            const until = m.status.until;
            const left = until ? fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateHtml = `<span style="color:var(--yellow)">🏥 ${left}</span>`;
        } else if (m.status.state === 'Traveling' || m.status.state === 'Abroad') {
            const desc = m.status.description || '';
            const dest = desc.replace('Traveling to ', '✈ ').replace('Returning to Torn from ', '✈← ').replace('In ', '• ');
            const until = m.status.until;
            const left = until ? ' ' + fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateHtml = `<span style="color:var(--yellow)">${dest}${left}</span>`;
        } else if (m.status.state === 'Jail') {
            const until = m.status.until;
            const left = until ? fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateHtml = `<span style="color:var(--red)">Jail ${left}</span>`;
        } else if (m.last_action.status === 'Offline') {
            stateHtml = `<span style="color:var(--text-dim)">Offline</span>`;
        } else {
            stateHtml = `<span style="color:var(--green)">${m.last_action.status}</span>`;
        }

        // Energy
        let energyHtml;
        if (d && (d.source === 'torn_api' || d.source === 'yata')) {
            if (d.energy > d.max_energy) {
                energyHtml = `<span style="color:var(--green);font-weight:600">⚡ ${d.energy}/${d.max_energy}</span>`;
            } else if (d.energy < d.max_energy) {
                energyHtml = `<span style="color:var(--red)">⚡ ${d.energy}/${d.max_energy}</span>`;
            } else {
                energyHtml = `<span style="color:var(--blue)">⚡ ${d.energy}/${d.max_energy}</span>`;
            }
        } else {
            energyHtml = `<span style="color:var(--text-dim)">⚡ —</span>`;
        }

        // Drug CD
        let cdHtml;
        if (d && (d.source === 'torn_api' || d.source === 'yata')) {
            cdHtml = d.drug_cd > 0
                ? `<span style="color:var(--red)">💊 ${fmtCD(d.drug_cd)}</span>`
                : `<span style="color:var(--green)">💊 ready</span>`;
        } else {
            cdHtml = `<span style="color:var(--text-dim)">💊 —</span>`;
        }

        // Revive
        let reviveHtml;
        if (m.revive_setting === 'No one') {
            reviveHtml = `<span style="color:var(--green)">🔄 OFF</span>`;
        } else if (m.revive_setting === 'Friends & faction') {
            reviveHtml = `<span style="color:var(--yellow)">🔄 Fac</span>`;
        } else if (m.revive_setting === 'Everyone') {
            reviveHtml = `<span style="color:var(--red)">🔄 ALL</span>`;
        } else {
            reviveHtml = `<span style="color:var(--text-dim)">🔄 —</span>`;
        }

        // Bounty button (conditional)
        const needsBounty = warActive && m.last_action.status === 'Offline' && m.status.state !== 'Hospital';
        const bountyHtml = needsBounty
            ? `<button class="card-btn-bounty" onclick="event.stopPropagation();copyBounty('${m.name.replace(/'/g,"\\'")}', ${m.id})" title="Copy bounty request">📋</button>`
            : '';

        // Expanded details
        const ocHtml = m.is_in_oc ? '<span style="color:var(--green)">✓ In OC</span>' : '<span style="color:var(--text-dim)">—</span>';
        let hospReason = '';
        if (m.status.state === 'Hospital' && m.status.details) {
            hospReason = `<div class="detail-full"><span class="label">Hospital:</span> <span style="color:var(--yellow)">${m.status.details}</span></div>`;
        }

        return `<div class="member-card" data-status-color="${r}" onclick="toggleOurCard(this, ${m.id})">
            <div class="member-card-row1">
                <div class="member-card-left">
                    <span class="dot dot-${dotColor}"></span>
                    <a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank" class="member-card-name" style="color:${nameColor}" onclick="event.stopPropagation()">${m.name}</a>
                    <span class="member-card-level">${m.level}</span>
                </div>
                <div class="member-card-right">
                    ${bountyHtml}
                    <span class="member-card-time">${m.last_action.relative}</span>
                </div>
            </div>
            <div class="member-card-row2">
                ${stateHtml}
                ${energyHtml}
                ${cdHtml}
                ${reviveHtml}
            </div>
            <div class="member-card-details">
                <div><span class="label">Position:</span> ${m.position}</div>
                <div><span class="label">Days:</span> ${m.days_in_faction}</div>
                <div><span class="label">OC:</span> ${ocHtml}</div>
                <div><span class="label">Last action:</span> ${m.last_action.relative}</div>
                ${hospReason}
                <div class="detail-link"><a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank" onclick="event.stopPropagation()">View Profile ↗</a></div>
            </div>
        </div>`;
    }).join('');

    expandedOurCard = null;
}
```

- [ ] **Step 2: Modify renderOurTeam() to branch on viewport width**

Find the beginning of `renderOurTeam()` function. Add a mobile branch at the very start of the function body, before any existing code:

```javascript
function renderOurTeam(members, detailResponse) {
    if (isMobile()) {
        renderMobileCards(members, detailResponse);
        // Still update desktop summary for when user resizes
    }
    // ... rest of existing function unchanged ...
```

The existing function continues to run so desktop data stays populated for when the user resizes back to desktop. This is intentional — both paths render their respective containers, and CSS controls visibility.

- [ ] **Step 3: Verify Our Team cards on mobile**

Resize to <768px. Cards should display with:
- Status dot + Name (colored link) + Level + relative time
- State + Energy + Drug CD + Revive in row 2
- Tap card → expands with Position, Days, OC, Last action, Hospital reason, View Profile link
- Tap another card → previous collapses, new one opens
- Bounty button appears for offline members during war
- Sort dropdown changes card order

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat(mobile): add Our Team mobile card layout with expand/collapse and sort"
```

---

### Task 5: JS — Enemy Targets mobile cards

**Files:**
- Modify: `static/app.js` (add renderMobileEnemyCards function, modify renderEnemy to branch)

- [ ] **Step 1: Add renderMobileEnemyCards() function**

Add after `renderMobileCards()`:

```javascript
let expandedEnemyCard = null;

function toggleEnemyCard(cardEl) {
    if (expandedEnemyCard && expandedEnemyCard !== cardEl) {
        expandedEnemyCard.classList.remove('expanded');
    }
    cardEl.classList.toggle('expanded');
    expandedEnemyCard = cardEl.classList.contains('expanded') ? cardEl : null;
}

function mobileSortEnemy(val) {
    enemySort.col = val;
    enemySort.asc = (val === 'name');
    if (enemyData) renderEnemy(enemyData);
}

function renderMobileEnemyCards(data) {
    if (!data?.faction) {
        document.getElementById('enemy-mobile-summary').textContent = 'No enemy loaded';
        document.getElementById('enemy-cards').innerHTML = '';
        document.getElementById('enemy-count').textContent = '0';
        return;
    }

    const f = data.faction, ms = data.members;
    let atk = 0, hosp = 0;
    for (const m of ms) { if (m.last_action.status!=='Offline' && m.status.state==='Okay') atk++; if (m.status.state==='Hospital') hosp++; }
    document.getElementById('enemy-mobile-summary').textContent = `${atk} attackable · ${hosp} hospital · ${ms.length} total`;
    document.getElementById('enemy-count').textContent = ms.length;

    // Sort
    const sorted = [...ms].sort((a, b) => {
        const va = getEnemySortValue(a, enemySort.col);
        const vb = getEnemySortValue(b, enemySort.col);
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return enemySort.asc ? cmp : -cmp;
    });

    const hasBaseline = data.threat_mode === 'relative';

    const container = document.getElementById('enemy-cards');
    container.innerHTML = sorted.map(m => {
        const ok = m.last_action.status !== 'Offline' && m.status.state === 'Okay';
        const dotColor = ok ? 'green' : m.status.state === 'Hospital' ? 'yellow' : 'red';

        // State (compact)
        let stateHtml;
        if (m.status.state === 'Hospital') {
            const left = m.status.until ? fmtCD(m.status.until - Math.floor(Date.now()/1000)) : '';
            stateHtml = `<span style="color:var(--yellow)">🏥 ${left}</span>`;
        } else if (m.status.state === 'Okay') {
            stateHtml = `<span style="color:var(--green)">${m.last_action.status}</span>`;
        } else {
            stateHtml = `<span style="color:var(--text-dim)">${m.status.state}</span>`;
        }

        // Threat badge
        let threatHtml;
        if (hasBaseline) {
            threatHtml = `<span class="threat threat-${m.threat_label}">${m.threat_label} ${m.threat_score}</span>`;
        } else {
            threatHtml = `<span class="threat threat-unknown" onclick="event.stopPropagation();showKeyModal()">add key</span>`;
        }

        // Attack button
        const attackClass = m.status.state === 'Hospital' ? 'btn-attack btn-attack-muted' : 'btn-attack';
        const attackBtn = `<a href="${m.attack_url}" target="_blank" class="${attackClass}" onclick="event.stopPropagation()">Attack</a>`;

        // Expanded stats
        const ps = m.personal_stats;
        let statsHtml = '';
        if (ps) {
            statsHtml = `
                <div><span class="label">Xanax:</span> ${ps.xanax_taken.toLocaleString()}</div>
                <div><span class="label">Refills:</span> ${ps.refills.toLocaleString()}</div>
                <div><span class="label">SEs:</span> ${ps.stat_enhancers_used}</div>
                <div><span class="label">Atk won:</span> ${ps.attacks_won.toLocaleString()}</div>
                <div><span class="label">Def won:</span> ${ps.defends_won.toLocaleString()}</div>
                <div><span class="label">Best streak:</span> ${ps.best_kill_streak}</div>
                <div><span class="label">NW:</span> $${fmtNum(ps.networth)}</div>
                <div><span class="label">Best beaten:</span> Lv ${ps.highest_beaten}</div>
                <div><span class="label">Last action:</span> ${m.last_action.relative}</div>
                <div><span class="label">Damage:</span> ${fmtNum(ps.best_damage)}</div>`;
        } else {
            statsHtml = `<div style="grid-column:1/-1;color:var(--text-dim)">No TornStats data available</div>
                <div><span class="label">Last action:</span> ${m.last_action.relative}</div>`;
        }

        return `<div class="enemy-card" onclick="toggleEnemyCard(this)">
            <div class="enemy-card-row1">
                <div class="enemy-card-left">
                    <span class="dot dot-${dotColor}"></span>
                    <span class="enemy-card-name">${m.name}</span>
                    <span class="enemy-card-level">${m.level}</span>
                </div>
                ${threatHtml}
            </div>
            <div class="enemy-card-row2">
                <span class="enemy-card-state">${stateHtml}</span>
                ${attackBtn}
            </div>
            <div class="enemy-card-details">
                ${statsHtml}
                <div class="enemy-card-links">
                    <a href="${m.stats_url}" target="_blank" onclick="event.stopPropagation()">Stats ↗</a>
                    <a href="${m.profile_url}" target="_blank" onclick="event.stopPropagation()">Profile ↗</a>
                </div>
            </div>
        </div>`;
    }).join('');

    expandedEnemyCard = null;
}
```

- [ ] **Step 2: Modify renderEnemy() to branch on viewport width**

Add a mobile branch at the start of `renderEnemy()`:

```javascript
function renderEnemy(data) {
    if (isMobile()) {
        renderMobileEnemyCards(data);
    }
    // ... rest of existing function unchanged ...
```

Same pattern as Our Team — both paths run, CSS controls visibility.

- [ ] **Step 3: Verify Enemy cards on mobile**

Resize to <768px. Enemy cards should show:
- Status dot + Name + Level + Threat badge (colored)
- State + Attack button (red, prominent, 32px)
- Attack button grayed out for hospital enemies
- Tap card → full stats breakdown (Xanax, Refills, SEs, etc.)
- Sort dropdown works
- Only one card expanded at a time

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat(mobile): add Enemy Targets mobile card layout with threat and attack"
```

---

### Task 6: JS — Resize listener and final integration

**Files:**
- Modify: `static/app.js` (add resize listener, update summary in both paths)

- [ ] **Step 1: Add resize listener for responsive re-rendering**

Add at the end of `app.js`, before the `initAuth()` call:

```javascript
// --- Responsive re-render on breakpoint crossing ---
let wasMobile = isMobile();
window.addEventListener('resize', () => {
    const nowMobile = isMobile();
    if (nowMobile !== wasMobile) {
        wasMobile = nowMobile;
        if (overviewData && detailData) renderOurTeam(overviewData.members, detailData);
        if (enemyData) renderEnemy(enemyData);
        if (overviewData) renderMobileHeader(overviewData.war, overviewData.chain);
        // Close hamburger on resize to desktop
        if (!nowMobile && hamburgerOpen) {
            hamburgerOpen = false;
            const menu = document.getElementById('mh-menu');
            const btn = document.getElementById('mh-hamburger');
            if (menu) menu.style.display = 'none';
            if (btn) btn.innerHTML = '&#9776;';
        }
    }
});
```

- [ ] **Step 2: Ensure desktop summary stays updated**

In `renderOurTeam()`, make sure the desktop summary (`#our-summary`) is always updated regardless of mobile/desktop. The current code already updates it — verify that the mobile branch doesn't return early before this line:

```javascript
document.getElementById('our-summary').innerHTML = `<span class="g">${on}</span> online...`;
```

The mobile `renderMobileCards()` updates `#our-mobile-summary` and `#our-count`. The existing code in `renderOurTeam()` updates `#our-summary` and `#our-count`. Both run, so both are always fresh.

- [ ] **Step 3: Full integration test**

Test the complete flow:

1. **Mobile (<768px):**
   - Mobile header shows war status (or "TM War Room")
   - Hamburger opens/closes menu
   - Menu items work (Refresh, Admin link, Theme toggle, Logout)
   - Our Team tab shows cards with all data
   - Cards expand/collapse (one at a time)
   - Bounty button appears during war for offline members
   - Sort dropdown reorders cards
   - Enemy tab shows threat + attack cards
   - Enemy cards expand with full stats
   - Sort dropdown works
   - Auto-refresh (60s) updates cards

2. **Desktop (>=768px):**
   - Everything exactly as before
   - Tables with sortable columns
   - War banner with progress bars
   - Header with all controls inline

3. **Resize crossing:**
   - Resize from desktop to mobile → cards appear
   - Resize from mobile to desktop → table appears
   - No visual glitches or stale data

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat(mobile): add resize listener for responsive breakpoint switching"
```

---

### Task 7: Cleanup and final polish

**Files:**
- Modify: `static/style.css` (minor adjustments if needed)
- Modify: `static/index.html` (add .superpowers to .gitignore if not present)

- [ ] **Step 1: Add .superpowers to .gitignore**

Check if `.superpowers/` is in `.gitignore`. If not, add it:

```
.superpowers/
```

- [ ] **Step 2: Test on actual mobile device or Chrome DevTools mobile emulation**

Use Chrome DevTools → Toggle Device Toolbar → select iPhone SE (375px) and iPhone 12 Pro (390px). Verify:
- No horizontal overflow
- Touch targets are >=28px
- Cards are readable
- Expand/collapse is smooth
- Bounty button taps work without accidentally expanding the card
- Attack button taps go to Torn without expanding the card

- [ ] **Step 3: Test light theme on mobile**

Toggle to light theme via hamburger menu. All cards, badges, and colors should work correctly in both themes (they use CSS custom properties, so they should).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(mobile): complete mobile-first card layout redesign"
```
