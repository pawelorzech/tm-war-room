const REFRESH_INTERVAL = 60_000;

let overviewData = null;
let detailData = null;

async function fetchOverview() {
    const resp = await fetch('/api/overview');
    return resp.json();
}

async function fetchDetail() {
    const resp = await fetch('/api/members/detail');
    return resp.json();
}

function formatCooldown(seconds) {
    if (!seconds || seconds <= 0) return '\u2014';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function getReadiness(member, detail) {
    const online = member.last_action.status;
    const state = member.status.state;

    if (state === 'Traveling' || state === 'Abroad') return 'red';
    if (state === 'Jail') return 'red';
    if (online === 'Offline') return 'red';

    if (state === 'Hospital') return 'yellow';
    if (detail && detail.bars) {
        if (detail.bars.cooldowns.drug > 3600) return 'yellow';
    }

    if (online === 'Online' && state === 'Okay') return 'green';
    if (online === 'Idle' && state === 'Okay') return 'yellow';

    return 'gray';
}

function renderWar(war) {
    const el = document.getElementById('war-status');
    if (!war || !war.war_id) {
        el.className = 'war-banner war-none';
        el.textContent = 'No active Ranked War';
        return;
    }

    const us = war.factions.find(f => f.id === 11559);
    const them = war.factions.find(f => f.id !== 11559);
    const now = Math.floor(Date.now() / 1000);
    const started = war.start <= now;

    if (started) {
        el.className = 'war-banner war-active';
        el.innerHTML = `RW ACTIVE vs <strong>${them?.name || '?'}</strong> \u2014 Score: <strong>${us?.score || 0}</strong> : ${them?.score || 0}`;
    } else {
        const diff = war.start - now;
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        el.className = 'war-banner war-upcoming';
        el.innerHTML = `RW in <strong>${hours}h ${mins}m</strong> vs <strong>${them?.name || '?'}</strong>`;
    }
}

function renderMembers(members, details) {
    const tbody = document.getElementById('members-body');
    const detailMap = {};
    if (details) {
        for (const d of details) {
            detailMap[d.player_id] = d;
        }
    }

    const order = { green: 0, yellow: 1, gray: 2, red: 3 };
    const sorted = [...members].sort((a, b) => {
        const ra = order[getReadiness(a, detailMap[a.id])] ?? 2;
        const rb = order[getReadiness(b, detailMap[b.id])] ?? 2;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
    });

    tbody.innerHTML = sorted.map(m => {
        const d = detailMap[m.id];
        const readiness = getReadiness(m, d);

        let energyHtml = '<span class="energy-unknown">\u2014</span>';
        let cdHtml = '<span class="energy-unknown">\u2014</span>';
        if (d && d.bars) {
            const e = d.bars.energy;
            const isStacking = e.current > e.maximum;
            energyHtml = isStacking
                ? `<span class="energy-stacking">${e.current}/${e.maximum}</span>`
                : `<span class="${e.current < e.maximum ? 'energy-low' : ''}">${e.current}/${e.maximum}</span>`;

            const drugCd = d.bars.cooldowns.drug;
            cdHtml = drugCd > 0
                ? `<span class="cd-active">${formatCooldown(drugCd)}</span>`
                : `<span class="cd-clear">Ready</span>`;
        }

        const stateText = m.status.state !== 'Okay' ? m.status.state : m.last_action.status;

        return `<tr>
            <td><span class="dot dot-${readiness}"></span></td>
            <td><a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a></td>
            <td>${m.level}</td>
            <td>${stateText}</td>
            <td>${m.last_action.relative}</td>
            <td>${energyHtml}</td>
            <td>${cdHtml}</td>
            <td>${m.position}</td>
            <td>${m.is_on_wall ? '\u2694\uFE0F' : ''}</td>
        </tr>`;
    }).join('');
}

async function refresh() {
    try {
        const [ov, det] = await Promise.all([fetchOverview(), fetchDetail()]);
        overviewData = ov;
        detailData = det;

        renderWar(ov.war);
        renderMembers(ov.members, det.members);

        document.getElementById('last-update').textContent =
            `Updated: ${new Date().toLocaleTimeString()}`;
        document.getElementById('member-count').textContent =
            `${ov.members.length} members`;
    } catch (e) {
        console.error('Refresh failed:', e);
    }
}

function showKeyModal() {
    document.getElementById('key-modal').style.display = 'flex';
    document.getElementById('key-input').value = '';
    document.getElementById('key-status').textContent = '';
}

function hideKeyModal() {
    document.getElementById('key-modal').style.display = 'none';
}

async function submitKey() {
    const key = document.getElementById('key-input').value.trim();
    const status = document.getElementById('key-status');
    if (!key) { status.textContent = 'Please enter a key'; return; }

    status.textContent = 'Validating...';
    try {
        const resp = await fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key }),
        });
        const data = await resp.json();
        if (resp.ok) {
            status.style.color = '#4ade80';
            status.textContent = `Registered: ${data.name} [${data.player_id}]`;
            setTimeout(() => { hideKeyModal(); refresh(); }, 1500);
        } else {
            status.style.color = '#f87171';
            status.textContent = data.detail || 'Invalid key';
        }
    } catch (e) {
        status.style.color = '#f87171';
        status.textContent = 'Error: ' + e.message;
    }
}

refresh();
setInterval(refresh, REFRESH_INTERVAL);
