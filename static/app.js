const REFRESH_INTERVAL = 60_000;
const FACTION_ID = 11559;

let overviewData = null, detailData = null, enemyData = null;
let ourSort = { col: null, asc: true }; // null = default readiness sort
let enemySort = { col: 'threat_score', asc: true };

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
    _headers() {
        const pid = localStorage.getItem('myKeyPlayer');
        return pid ? { 'X-Player-Id': pid } : {};
    },
    overview: () => fetch('/api/overview', {headers: api._headers()}).then(r => { if (r.status===401) { logout(); throw new Error('unauthorized'); } return r.json(); }),
    detail: () => fetch('/api/members/detail', {headers: api._headers()}).then(r => r.json()),
    enemy: (fid) => {
        const pid = localStorage.getItem('myKeyPlayer');
        const base = fid ? `/api/enemy?faction_id=${fid}` : '/api/enemy';
        const url = pid ? `${base}${base.includes('?')?'&':'?'}baseline_pid=${pid}` : base;
        return fetch(url, {headers: api._headers()}).then(r => r.json());
    },
    deleteKey: (pid) => fetch(`/api/keys/${pid}`, {method:'DELETE'}).then(r => r.json()),
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
    if (d && (d.source === 'torn_api' || d.source === 'yata') && d.drug_cd > 3600) return 'yellow';
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
        el.innerHTML = `RW ACTIVE vs <strong><a href="https://www.torn.com/factions.php?step=profile&ID=${them?.id}" target="_blank">${them?.name||'?'}</a></strong> \u2014 <strong>${us?.score||0}</strong> : ${them?.score||0} (target: ${war.target})`;
    } else {
        const d = war.start - now, h = Math.floor(d/3600), m = Math.floor((d%3600)/60);
        el.className = 'war-banner war-upcoming';
        el.innerHTML = `RW in <strong>${h}h ${m}m</strong> vs <strong><a href="https://www.torn.com/factions.php?step=profile&ID=${them?.id}" target="_blank">${them?.name||'?'}</a></strong>`;
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
function renderOurTeam(members, detailResponse) {
    const dm = detailResponse?.members || {};
    const yataDown = detailResponse?.yata_down || false;

    // Show/hide YATA warning
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

    let on=0, hosp=0, off=0;
    for (const m of members) { if (m.last_action.status==='Online') on++; else if (m.status.state==='Hospital') hosp++; else off++; }
    const inOc = members.filter(m => m.is_in_oc).length;
    const withData = Object.values(dm).filter(d => d.source === 'torn_api' || d.source === 'yata').length;
    document.getElementById('our-summary').innerHTML = `<span class="g">${on}</span> online, <span class="y">${hosp}</span> hospital, <span class="r">${off}</span> offline/away \u2014 <span class="g">${withData}</span>/${members.length} with data \u2014 ${inOc} in OC`;
    document.getElementById('our-count').textContent = members.length;

    const userName = localStorage.getItem('myKeyName');
    if (userName) document.getElementById('user-info').textContent = userName;

    document.getElementById('our-body').innerHTML = sorted.map(m => {
        const d = dm[m.id];
        const r = getReadiness(m, d);
        let eH, cdH;
        if (d && d.source === 'torn_api') {
            eH = d.energy > d.max_energy
                ? `<span class="energy-stacking">${d.energy}/${d.max_energy}</span>`
                : `<span class="${d.energy < d.max_energy ? 'energy-low' : ''}">${d.energy}/${d.max_energy}</span>`;
            cdH = d.drug_cd > 0
                ? `<span class="cd-active">${fmtCD(d.drug_cd)}</span>`
                : `<span class="cd-clear">Ready</span>`;
        } else if (d && d.source === 'yata') {
            eH = `<span>${d.energy}E</span><span class="energy-source">yata</span>`;
            cdH = d.drug_cd > 0
                ? `<span class="cd-active">${fmtCD(d.drug_cd)}</span>`
                : `<span class="cd-clear">Ready</span>`;
        } else if (d && d.source === 'hidden') {
            eH = '<span class="energy-unknown">Hidden</span>';
            cdH = '<span class="energy-unknown">Hidden</span>';
        } else if (d && d.source === 'not_on_yata') {
            eH = '<span class="energy-unknown">No data</span>';
            cdH = '<span class="energy-unknown">\u2014</span>';
        } else {
            eH = '<span class="energy-unknown">\u2014</span>';
            cdH = '<span class="energy-unknown">\u2014</span>';
        }

        let stateText;
        if (m.status.state === 'Hospital') {
            const reason = m.status.details || 'hospitalized';
            const shortReason = reason.replace('Overdosed on ', 'OD ').replace('Hospitalized by ', 'by ').replace('Mugged by ', 'mugged ').replace('Attacked by ', 'atk ');
            const until = m.status.until;
            const left = until ? fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateText = `<span class="cd-active">Hosp: ${shortReason}${left ? ' ('+left+')' : ''}</span>`;
        } else if (m.status.state === 'Traveling' || m.status.state === 'Abroad') {
            const desc = m.status.description || '';
            const dest = desc.replace('Traveling to ', '\u2192 ').replace('Returning to Torn from ', '\u2190 ').replace('In ', '\u2022 ');
            stateText = `<span class="cd-active">${dest}</span>`;
        } else if (m.status.state === 'Jail') {
            const until = m.status.until;
            const left = until ? fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateText = `<span style="color:var(--red)">Jail${left ? ' ('+left+')' : ''}</span>`;
        } else {
            stateText = m.last_action.status;
        }

        let reviveHtml;
        if (m.revive_setting === 'No one') {
            reviveHtml = '<span style="color:var(--green)">OFF</span>';
        } else if (m.revive_setting === 'Friends & faction') {
            reviveHtml = '<span style="color:var(--yellow)" title="Faction members can revive you \u2014 OK but consider OFF during RW">Faction</span>';
        } else if (m.revive_setting === 'Everyone') {
            reviveHtml = '<span style="color:var(--red)" title="ANYONE can revive you \u2014 enemies can revive and attack again!">\u26A0 ALL</span>';
        } else {
            reviveHtml = '<span class="energy-unknown">\u2014</span>';
        }

        const ocHtml = m.is_in_oc ? '<span style="color:var(--green)">\u2713</span>' : '<span class="energy-unknown">\u2014</span>';
        const isNew = m.days_in_faction <= 30;
        const nameHtml = `<a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a>${isNew ? ' <span class="badge-new">new</span>' : ''}`;

        return `<tr><td><span class="dot dot-${r}"></span></td><td>${nameHtml}</td><td>${m.level}</td><td>${stateText}</td><td>${m.last_action.relative}</td><td>${eH}</td><td>${cdH}</td><td class="hide-mobile">${m.position}</td><td class="hide-mobile">${reviveHtml}</td><td class="hide-mobile">${ocHtml}</td></tr>`;
    }).join('');
}

// --- Our Team sorting ---
function getOurSortValue(m, dm, col) {
    switch(col) {
        case 'name': return m.name.toLowerCase();
        case 'level': return m.level;
        case 'state': return m.status.state + m.last_action.status;
        case 'energy': return dm[m.id]?.energy ?? -1;
        case 'position': return m.position;
        default: return 0;
    }
}

function sortOur(col) {
    if (ourSort.col === col) {
        ourSort.asc = !ourSort.asc;
    } else {
        ourSort.col = col;
        ourSort.asc = true;
    }
    document.querySelectorAll('#our-thead th[data-sort]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === col) {
            arrow.textContent = ourSort.asc ? ' \u25B2' : ' \u25BC';
        } else {
            arrow.textContent = '';
        }
    });
    if (overviewData && detailData) renderOurTeam(overviewData.members, detailData);
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
        : 'Register your API key to see personalized threat levels';
    document.getElementById('enemy-summary').innerHTML = `<strong><a href="https://www.torn.com/factions.php?step=profile&ID=${f.id}" target="_blank">${f.name}</a></strong> [${f.tag}] \u2014 ${f.rank_name} (${f.wins}W) \u2014 <span class="g">${atk}</span> attackable, <span class="y">${hosp}</span> hospital, ${ms.length} total<br>${threatInfo}`;
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

        const hasBaseline = data.threat_mode === 'relative';
        const tip = ps ? `Score: ${m.threat_score}/100\nXanax: ${ps.xanax_taken.toLocaleString()}\nRefills: ${ps.refills.toLocaleString()}\nSEs: ${ps.stat_enhancers_used}\nAtk won: ${ps.attacks_won.toLocaleString()}\nDef won: ${ps.defends_won.toLocaleString()}\nNW: $${fmtNum(ps.networth)}\nBest beaten: Lv${ps.highest_beaten}` : 'No TornStats data';
        const threatCell = hasBaseline
            ? `<span class="threat threat-${m.threat_label}" title="${tip}">${m.threat_label} ${m.threat_score}</span>`
            : `<span class="threat threat-unknown" style="cursor:pointer" onclick="showKeyModal()" title="Register your API key to see threat levels">add key</span>`;

        return `<tr><td><span class="dot dot-${dotColor}"></span></td><td><a href="${m.profile_url}" target="_blank">${m.name}</a></td><td>${m.level}</td><td>${threatCell}</td><td>${st}${hospTime}</td><td class="hide-mobile">${m.last_action.relative}</td><td class="hide-mobile">${xr}</td><td class="hide-mobile">${aw}</td><td><a href="${m.attack_url}" target="_blank" class="btn-attack">Attack</a> <a href="${m.stats_url}" target="_blank" class="btn-ts">Stats</a></td></tr>`;
    }).join('');
}

// --- Refresh ---
async function refresh() {
    try {
        const [ov, det, en] = await Promise.all([api.overview(), api.detail(), api.enemy()]);
        overviewData = ov; detailData = det; enemyData = en;
        renderWar(ov.war, ov.war_progress);
        // Chain status in war banner
        const chainEl = document.getElementById('chain-status');
        if (ov.chain && ov.war?.war_id) {
            const c = ov.chain;
            chainEl.style.display = 'block';
            chainEl.textContent = c.current > 0 ? `Chain: ${c.current}/${c.max} (${c.modifier}x bonus)` : 'Chain: inactive';
        } else {
            chainEl.style.display = 'none';
        }
        renderOurTeam(ov.members, det);
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
    document.getElementById('key-status').textContent='';
}
function hideKeyModal() { document.getElementById('key-modal').style.display='none'; }

async function submitKey() {
    const key = document.getElementById('key-input').value.trim();
    const st = document.getElementById('key-status');
    if (!key) { st.textContent = 'Enter a key'; return; }
    st.textContent = 'Validating...';
    try {
        const r = await fetch('/api/keys', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({api_key:key})});
        const d = await r.json();
        if (r.ok) {
            localStorage.setItem('myKeyPlayer', d.player_id);
            localStorage.setItem('myKeyName', d.name);
            st.style.color='var(--green)'; st.textContent=`OK: ${d.name} [${d.player_id}]`;
            setTimeout(()=>{hideKeyModal();refresh();},1000);
        }
        else { st.style.color='var(--red)'; st.textContent=d.detail||'Invalid key'; }
    } catch(e) { st.style.color='var(--red)'; st.textContent=e.message; }
}

// --- Remove MY key ---
async function removeMyKey() {
    const pid = localStorage.getItem('myKeyPlayer');
    if (!pid) return;
    await api.deleteKey(pid);
    logout();
}

// --- Auth ---
function logout() {
    localStorage.removeItem('myKeyPlayer');
    localStorage.removeItem('myKeyName');
    document.getElementById('login-gate').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

function showApp() {
    document.getElementById('login-gate').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    const name = localStorage.getItem('myKeyName');
    if (name) document.getElementById('user-info').textContent = name;
}

async function loginWithKey() {
    const key = document.getElementById('login-key-input').value.trim();
    const st = document.getElementById('login-status');
    if (!key) { st.textContent = 'Enter a key'; return; }
    st.textContent = 'Validating...';
    document.getElementById('login-btn').disabled = true;
    try {
        const r = await fetch('/api/keys', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({api_key:key})});
        const d = await r.json();
        if (r.ok) {
            localStorage.setItem('myKeyPlayer', d.player_id);
            localStorage.setItem('myKeyName', d.name);
            st.style.color='var(--green)'; st.textContent=`Welcome, ${d.name}!`;
            setTimeout(()=>{ showApp(); refresh(); }, 500);
        } else {
            st.style.color='var(--red)'; st.textContent=d.detail||'Invalid key';
        }
    } catch(e) { st.style.color='var(--red)'; st.textContent=e.message; }
    document.getElementById('login-btn').disabled = false;
}

async function initAuth() {
    const pid = localStorage.getItem('myKeyPlayer');
    if (!pid) { document.getElementById('login-gate').style.display = 'flex'; return; }
    try {
        const r = await fetch('/api/overview', {headers: {'X-Player-Id': pid}});
        if (r.status === 401) { logout(); return; }
        showApp();
        refresh();
    } catch(e) { logout(); }
}

initAuth();
setInterval(() => { if (localStorage.getItem('myKeyPlayer')) refresh(); }, REFRESH_INTERVAL);
