const REFRESH_INTERVAL = 60_000;
const FACTION_ID = 11559;

let overviewData = null, detailData = null, enemyData = null;
let enemySort = { col: 'threat_score', asc: true }; // default: lowest threat first

// --- Theme ---
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || (!saved && window.matchMedia('(prefers-color-scheme: light)').matches)) {
        document.body.classList.add('light');
        document.getElementById('theme-btn').textContent = 'Turn Dark';
    } else {
        document.getElementById('theme-btn').textContent = 'Turn Light';
    }
}
function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    document.getElementById('theme-btn').textContent = isLight ? 'Turn Dark' : 'Turn Light';
}
initTheme();

// --- API ---
const api = {
    overview: () => fetch('/api/overview').then(r => r.json()),
    detail: () => fetch('/api/members/detail').then(r => r.json()),
    enemy: (fid) => fetch(fid ? `/api/enemy?faction_id=${fid}` : '/api/enemy').then(r => r.json()),
    deleteKey: (pid) => fetch(`/api/keys/${pid}`, {method:'DELETE'}).then(r => r.json()),
    listKeys: () => fetch('/api/keys').then(r => r.json()),
};

// --- Tabs (persist across refresh) ---
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
    localStorage.setItem('activeTab', tab);
}
function initTab() {
    const saved = localStorage.getItem('activeTab');
    if (saved) switchTab(saved);
}
initTab();

// --- Format ---
function fmtCD(s) {
    if (!s || s <= 0) return '\u2014';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

// --- Readiness ---
function getReadiness(m, d) {
    const on = m.last_action.status, st = m.status.state;
    if (['Traveling','Abroad','Jail'].includes(st)) return 'red';
    if (on === 'Offline') return 'red';
    if (st === 'Hospital') return 'yellow';
    if (d?.bars?.cooldowns.drug > 3600) return 'yellow';
    if (on === 'Online' && st === 'Okay') return 'green';
    if (on === 'Idle') return 'yellow';
    return 'gray';
}

// --- War ---
function renderWar(war, wp) {
    const el = document.getElementById('war-status');
    const prog = document.getElementById('war-progress');
    const fi = document.getElementById('enemy-faction-input');

    if (!war?.war_id) {
        el.className = 'war-banner war-none';
        el.textContent = 'No active Ranked War';
        prog.style.display = 'none';
        fi.style.display = 'flex';
        return;
    }
    fi.style.display = 'none';

    const us = war.factions.find(f => f.id === FACTION_ID);
    const them = war.factions.find(f => f.id !== FACTION_ID);
    const now = Math.floor(Date.now() / 1000);

    if (war.start <= now) {
        el.className = 'war-banner war-active';
        el.innerHTML = `RW ACTIVE vs <strong>${them?.name||'?'}</strong> \u2014 <strong>${us?.score||0}</strong> : ${them?.score||0} (target: ${war.target})`;
    } else {
        const d = war.start - now, h = Math.floor(d/3600), m = Math.floor((d%3600)/60);
        el.className = 'war-banner war-upcoming';
        el.innerHTML = `RW in <strong>${h}h ${m}m</strong> vs <strong>${them?.name||'?'}</strong>`;
    }

    if (wp) {
        prog.style.display = 'block';
        document.getElementById('wp-our-name').textContent = `${wp.our_name}: ${wp.our_score}`;
        document.getElementById('wp-target').textContent = `Target: ${wp.target}`;
        document.getElementById('wp-their-name').textContent = `${wp.their_name}: ${wp.their_score}`;
        document.getElementById('wp-our-bar').style.width = wp.our_pct + '%';
        document.getElementById('wp-their-bar').style.width = wp.their_pct + '%';
    }
}

// --- Our Team ---
function renderOurTeam(members, details) {
    const dm = {}; if (details) for (const d of details) dm[d.player_id] = d;
    const optedIn = new Set(details ? details.map(d => d.player_id) : []);
    const ord = {green:0,yellow:1,gray:2,red:3};
    const sorted = [...members].sort((a,b) => {
        const ra = ord[getReadiness(a,dm[a.id])]??2, rb = ord[getReadiness(b,dm[b.id])]??2;
        return ra !== rb ? ra-rb : a.name.localeCompare(b.name);
    });

    let on=0, hosp=0, off=0;
    for (const m of members) { if (m.last_action.status==='Online') on++; else if (m.status.state==='Hospital') hosp++; else off++; }
    document.getElementById('our-summary').innerHTML = `<span class="g">${on}</span> online, <span class="y">${hosp}</span> hospital, <span class="r">${off}</span> offline/away \u2014 <span class="g">${optedIn.size}</span>/${members.length} keys registered`;
    document.getElementById('our-count').textContent = members.length;

    // Banner if few keys registered
    const banner = document.getElementById('key-banner');
    if (optedIn.size < 5) {
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }

    document.getElementById('our-body').innerHTML = sorted.map(m => {
        const d = dm[m.id], r = getReadiness(m,d);
        let eH, cdH;
        if (d?.bars) {
            const e = d.bars.energy;
            eH = e.current > e.maximum ? `<span class="energy-stacking">${e.current}/${e.maximum}</span>` : `<span class="${e.current<e.maximum?'energy-low':''}">${e.current}/${e.maximum}</span>`;
            const cd = d.bars.cooldowns.drug;
            cdH = cd > 0 ? `<span class="cd-active">${fmtCD(cd)}</span>` : `<span class="cd-clear">Ready</span>`;
        } else {
            eH = '<span class="energy-unknown">no key</span>';
            cdH = '<span class="energy-unknown">\u2014</span>';
        }
        const st = m.status.state !== 'Okay' ? m.status.state : m.last_action.status;
        return `<tr><td><span class="dot dot-${r}"></span></td><td><a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a></td><td>${m.level}</td><td>${st}</td><td>${m.last_action.relative}</td><td>${eH}</td><td>${cdH}</td><td class="hide-mobile">${m.position}</td><td>${m.is_on_wall?'\u2694\uFE0F':''}</td></tr>`;
    }).join('');
}

// --- Enemy sorting ---
function sortEnemy(col) {
    if (enemySort.col === col) {
        enemySort.asc = !enemySort.asc;
    } else {
        enemySort.col = col;
        enemySort.asc = true;
    }
    // Update header arrows
    document.querySelectorAll('#enemy-thead th[data-sort]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === col) {
            arrow.textContent = enemySort.asc ? ' \u25B2' : ' \u25BC';
        } else {
            arrow.textContent = '';
        }
    });
    if (enemyData) renderEnemy(enemyData);
}

function getEnemySortValue(m, col) {
    switch(col) {
        case 'name': return m.name.toLowerCase();
        case 'level': return m.level;
        case 'threat_score': return m.threat_score;
        case 'state': return m.status.state + m.last_action.status;
        case 'xanax': return m.personal_stats?.xanax_taken ?? -1;
        case 'atk_won': return m.personal_stats?.attacks_won ?? -1;
        default: return 0;
    }
}

// --- Enemy ---
function renderEnemy(data) {
    if (!data?.faction) {
        document.getElementById('enemy-summary').textContent = 'No enemy faction loaded';
        document.getElementById('enemy-body').innerHTML = '';
        document.getElementById('enemy-count').textContent = '0';
        return;
    }
    const f = data.faction, ms = data.members;
    let atk = 0, hosp = 0;
    for (const m of ms) { if (m.last_action.status!=='Offline' && m.status.state==='Okay') atk++; if (m.status.state==='Hospital') hosp++; }

    const threatInfo = data.threat_mode === 'relative'
        ? `Threat relative to <strong>${data.threat_baseline}</strong>`
        : 'Threat: absolute (register faction key for relative scoring)';
    document.getElementById('enemy-summary').innerHTML = `<strong>${f.name}</strong> [${f.tag}] \u2014 ${f.rank_name} (${f.wins}W) \u2014 <span class="g">${atk}</span> attackable, <span class="y">${hosp}</span> hospital, ${ms.length} total<br>${threatInfo}`;
    document.getElementById('enemy-count').textContent = ms.length;

    // Sort
    const sorted = [...ms].sort((a, b) => {
        const va = getEnemySortValue(a, enemySort.col);
        const vb = getEnemySortValue(b, enemySort.col);
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return enemySort.asc ? cmp : -cmp;
    });

    document.getElementById('enemy-body').innerHTML = sorted.map(m => {
        const ok = m.last_action.status !== 'Offline' && m.status.state === 'Okay';
        const st = m.status.state !== 'Okay' ? m.status.state : m.last_action.status;
        const ps = m.personal_stats;
        const xr = ps ? `${fmtNum(ps.xanax_taken)}/${fmtNum(ps.refills)}` : '\u2014';
        const aw = ps ? fmtNum(ps.attacks_won) : '\u2014';
        const hospTime = m.status.state==='Hospital' && m.status.until ? ` (${fmtCD(m.status.until - Math.floor(Date.now()/1000))})` : '';
        const dotColor = ok ? 'green' : m.status.state==='Hospital' ? 'yellow' : 'red';

        const tip = ps ? `Score: ${m.threat_score}/100\nXanax: ${ps.xanax_taken.toLocaleString()}\nRefills: ${ps.refills.toLocaleString()}\nSEs: ${ps.stat_enhancers_used}\nAtk won: ${ps.attacks_won.toLocaleString()}\nDef won: ${ps.defends_won.toLocaleString()}\nNW: $${fmtNum(ps.networth)}\nBest beaten: Lv${ps.highest_beaten}` : 'No TornStats data';

        return `<tr><td><span class="dot dot-${dotColor}"></span></td><td><a href="${m.profile_url}" target="_blank">${m.name}</a></td><td>${m.level}</td><td><span class="threat threat-${m.threat_label}" title="${tip}">${m.threat_label} ${m.threat_score}</span></td><td>${st}${hospTime}</td><td class="hide-mobile">${m.last_action.relative}</td><td class="hide-mobile">${xr}</td><td class="hide-mobile">${aw}</td><td><a href="${m.attack_url}" target="_blank" class="btn-attack">Attack</a> <a href="${m.stats_url}" target="_blank" class="btn-ts">Stats</a></td></tr>`;
    }).join('');
}

// --- Refresh ---
async function refresh() {
    try {
        const [ov, det, en] = await Promise.all([api.overview(), api.detail(), api.enemy()]);
        overviewData = ov; detailData = det; enemyData = en;
        renderWar(ov.war, ov.war_progress);
        renderOurTeam(ov.members, det.members);
        renderEnemy(en);
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    } catch (e) { console.error('Refresh failed:', e); }
}

async function loadEnemy() {
    const fid = document.getElementById('faction-id-input').value.trim();
    if (!fid) return;
    enemyData = await api.enemy(fid);
    renderEnemy(enemyData);
}

// --- Key modal ---
function showKeyModal() {
    document.getElementById('key-modal').style.display='flex';
    document.getElementById('key-input').value='';
    document.getElementById('key-faction-toggle').checked=false;
    document.getElementById('key-status').textContent='';
}
function hideKeyModal() { document.getElementById('key-modal').style.display='none'; }

async function submitKey() {
    const key = document.getElementById('key-input').value.trim();
    const st = document.getElementById('key-status');
    if (!key) { st.textContent = 'Enter a key'; return; }
    const isFaction = document.getElementById('key-faction-toggle').checked;
    st.textContent = 'Validating...';
    try {
        const r = await fetch('/api/keys', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({api_key:key, is_faction_key:isFaction})});
        const d = await r.json();
        if (r.ok) { st.style.color='var(--green)'; st.textContent=`OK: ${d.name} [${d.player_id}]`; setTimeout(()=>{hideKeyModal();refresh();},1000); }
        else { st.style.color='var(--red)'; st.textContent=d.detail||'Invalid key'; }
    } catch(e) { st.style.color='var(--red)'; st.textContent=e.message; }
}

// --- Remove key ---
async function removeKey() {
    const st = document.getElementById('remove-status');
    const pidStr = document.getElementById('remove-pid').value.trim();
    if (!pidStr) { st.textContent = 'Enter your player ID'; return; }
    st.textContent = 'Removing...';
    try {
        await api.deleteKey(pidStr);
        st.style.color = 'var(--green)';
        st.textContent = 'Key removed';
        setTimeout(refresh, 500);
    } catch(e) { st.style.color='var(--red)'; st.textContent=e.message; }
}

refresh();
setInterval(refresh, REFRESH_INTERVAL);
