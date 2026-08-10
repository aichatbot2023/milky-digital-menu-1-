const TOKEN_KEY = 'milky_aivs_token';

const tokenInput = document.getElementById('token');
tokenInput.value = localStorage.getItem(TOKEN_KEY) || '';
document.getElementById('saveToken').addEventListener('click', () => {
  localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  refreshAll();
});

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function refreshHealth() {
  const dot = document.getElementById('healthDot');
  try {
    const health = await api('/api/health');
    dot.className = `dot ${health.ok ? 'ok' : 'bad'}`;
    dot.title = health.ok ? 'healthy' : health.problems.join(' ');
  } catch {
    dot.className = 'dot bad';
    dot.title = 'unreachable';
  }
}

async function refreshCameras() {
  const grid = document.getElementById('cameraGrid');
  let cameras = [];
  try {
    ({ cameras } = await api('/api/cameras'));
  } catch (err) {
    grid.innerHTML = `<div class="empty">Failed to load cameras: ${escapeHtml(err.message)}</div>`;
    return;
  }

  if (!cameras.length) {
    grid.innerHTML = '<div class="empty">No cameras yet — add one above.</div>';
    return;
  }

  grid.innerHTML = cameras.map((cam) => {
    const status = cam.status?.status || 'stopped';
    const snapUrl = `/api/cameras/${cam.id}/snapshot?t=${Date.now()}`;
    const hasSnap = cam.status?.hasSnapshot;
    return `
      <div class="camera-card" data-id="${cam.id}">
        ${hasSnap
          ? `<img class="snap" src="${snapUrl}" alt="${escapeHtml(cam.name)} snapshot" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'snap-placeholder', textContent:'no signal'}))" />`
          : '<div class="snap-placeholder">no snapshot yet</div>'}
        <div class="body">
          <div class="name">
            <span>${escapeHtml(cam.name)}</span>
            <span class="status-pill ${status}">${status}</span>
          </div>
          <div class="meta">${escapeHtml(cam.kind)}${cam.location ? ' · ' + escapeHtml(cam.location) : ''}</div>
          <div class="meta">motion score: ${(cam.status?.lastMotionScore ?? 0).toFixed(3)} · alert@${escapeHtml(cam.alertMinLevel)}${cam.record ? ' · recording' : ''}</div>
          ${cam.status?.lastError ? `<div class="meta" style="color:#ff8a8f">${escapeHtml(cam.status.lastError)}</div>` : ''}
          <div class="actions">
            <button data-action="toggle">${cam.enabled ? 'disable' : 'enable'}</button>
            <button data-action="delete">delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.camera-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
      const cam = cameras.find((c) => c.id === id);
      await api(`/api/cameras/${id}`, { method: 'PUT', body: JSON.stringify({ enabled: !cam.enabled }) });
      refreshCameras();
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('Delete this camera?')) return;
      await api(`/api/cameras/${id}`, { method: 'DELETE' });
      refreshCameras();
    });
  });
}

async function refreshEvents() {
  const list = document.getElementById('eventList');
  let events = [];
  try {
    ({ events } = await api('/api/events?limit=50'));
  } catch (err) {
    list.innerHTML = `<div class="empty">Failed to load events: ${escapeHtml(err.message)}</div>`;
    return;
  }

  if (!events.length) {
    list.innerHTML = '<div class="empty">No events yet.</div>';
    return;
  }

  list.innerHTML = events.map((ev) => `
    <div class="event-row">
      <time>${new Date(ev.createdAt).toLocaleString()}</time>
      <span class="threat-badge threat-${ev.threatLevel || 'none'}">${ev.threatLevel || 'n/a'}</span>
      <div class="event-summary">
        <span class="camera-name">${escapeHtml(ev.kind)} · camera ${escapeHtml(ev.cameraId || '')}</span>
        ${escapeHtml(ev.summary || ev.error || '')}
      </div>
    </div>
  `).join('');
}

document.getElementById('cameraForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  data.record = form.record.checked;
  try {
    await api('/api/cameras', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    refreshCameras();
  } catch (err) {
    alert(`Failed to add camera: ${err.message}`);
  }
});

function refreshAll() {
  refreshHealth();
  refreshCameras();
  refreshEvents();
}

refreshAll();
setInterval(refreshHealth, 15000);
setInterval(refreshCameras, 5000);
setInterval(refreshEvents, 10000);
