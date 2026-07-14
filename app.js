const STATUS_ENDPOINTS = {
  bill: 'https://truespace-tunnel.fly.dev:8080/status',
  steve: 'https://truespace-tunnel.fly.dev:8090/status',
};

const GROUP_ORDER = ['Public', 'Bill', 'Steve'];
const GROUP_LABELS = {
  Public: 'Public',
  Bill: 'Bill',
  Steve: 'Steve',
};

const OVERALL_LABELS = {
  operational: 'operational',
  degraded: 'degraded',
  major: 'major outage',
  unknown: 'partially unknown',
};

const STATUS_BADGE = {
  up: 'up',
  down: 'down',
  unknown: 'secondary',
};

const METRIC_WINDOWS = ['current', '1m', '5m', '30m', '1h', '1d'];
const METRIC_WINDOW_LABELS = {
  current: 'Now',
  '1m': '1m',
  '5m': '5m',
  '30m': '30m',
  '1h': '1h',
  '1d': '1d',
};

const METRIC_ROWS = [
  { key: 'cpu', label: 'CPU', unit: 'percent' },
  { key: 'memory', label: 'Memory', unit: 'percent' },
  { key: 'disk', label: 'Disk', unit: 'percent' },
  { key: 'load', label: 'Load (1m)', unit: 'load' },
  { key: 'swap', label: 'Swap', unit: 'percent' },
  { key: 'networkInKbps', label: 'Network in', unit: 'kbps' },
  { key: 'networkOutKbps', label: 'Network out', unit: 'kbps' },
];

const SERVER_LABELS = {
  bill: 'Bill',
  steve: 'Steve',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function badge(text, kind = 'secondary') {
  return `<span class="badge badge-${kind}">${escapeHtml(text)}</span>`;
}

async function fetchServerStatus(name, url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return {
      ok: true,
      name,
      latencyMs: Math.round(performance.now() - started),
      data,
    };
  } catch (error) {
    return {
      ok: false,
      name,
      latencyMs: Math.round(performance.now() - started),
      error: error.message,
    };
  }
}

function mergeStatus(results) {
  const items = [];
  const serverStates = [];
  let latestUpdatedAt = null;

  for (const result of results) {
    if (result.ok) {
      serverStates.push(result.data.overall);
      if (!latestUpdatedAt || result.data.updatedAt > latestUpdatedAt) {
        latestUpdatedAt = result.data.updatedAt;
      }
      items.push(...result.data.items);
      continue;
    }

    serverStates.push('major');
    const group = result.name === 'bill' ? 'Bill' : 'Steve';
    items.push({
      id: `${result.name}-endpoint`,
      name: `${GROUP_LABELS[group]} status endpoint`,
      group,
      status: 'down',
      latencyMs: result.latencyMs,
      httpStatus: null,
      message: result.error,
    });
  }

  const summary = {
    up: items.filter((item) => item.status === 'up').length,
    down: items.filter((item) => item.status === 'down').length,
    unknown: items.filter((item) => item.status === 'unknown').length,
    total: items.length,
  };

  let overall = 'operational';
  if (serverStates.includes('major') || summary.down > 0) {
    const critical = items.some(
      (item) => item.status === 'down' && (item.id === 'app' || item.id.endsWith('-endpoint')),
    );
    overall = critical ? 'major' : 'degraded';
  }

  return {
    updatedAt: latestUpdatedAt || new Date().toISOString(),
    overall,
    summary,
    items,
    servers: results.map((result) => ({
      name: result.name,
      ok: result.ok,
      latencyMs: result.latencyMs,
      hostname: result.ok ? result.data.hostname : null,
      updatedAt: result.ok ? result.data.updatedAt : null,
      metrics: result.ok ? result.data.metrics : null,
      error: result.ok ? null : result.error,
    })),
    sources: results.map((result) => ({
      server: result.name,
      ok: result.ok,
      latencyMs: result.latencyMs,
      updatedAt: result.ok ? result.data.updatedAt : null,
      error: result.ok ? null : result.error,
    })),
  };
}

async function loadStatus() {
  const results = await Promise.all(
    Object.entries(STATUS_ENDPOINTS).map(([name, url]) => fetchServerStatus(name, url)),
  );
  return mergeStatus(results);
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatLatency(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function overallBadgeKind(overall) {
  if (overall === 'operational') return 'up';
  if (overall === 'degraded') return 'warn';
  if (overall === 'major') return 'down';
  return 'secondary';
}

function renderSummary(data) {
  const container = document.getElementById('summary');
  const overall = OVERALL_LABELS[data.overall] || data.overall;
  container.innerHTML = [
    badge(overall, overallBadgeKind(data.overall)),
    badge(`${data.summary.up} up`, 'up'),
    badge(`${data.summary.down} down`, data.summary.down ? 'down' : 'secondary'),
    data.summary.unknown ? badge(`${data.summary.unknown} unknown`, 'secondary') : '',
    badge(`${data.summary.total} checks`, 'secondary'),
  ].join('');
}

function renderSources(sources) {
  const container = document.getElementById('source-meta');
  container.innerHTML = sources
    .map((source) => {
      const label = SERVER_LABELS[source.server] || source.server;
      const status = source.ok ? 'reachable' : 'unreachable';
      const statusKind = source.ok ? 'up' : 'down';
      const detail = source.ok
        ? `${formatLatency(source.latencyMs)} · ${formatTimestamp(source.updatedAt)}`
        : escapeHtml(source.error);

      return `
        <article class="card">
          <div class="card-body">
            <div class="card-header">
              <h2 class="card-title">${escapeHtml(label)}</h2>
              <div class="card-badges">
                ${badge('endpoint', 'primary')}
                ${badge(status, statusKind)}
              </div>
            </div>
            <p class="card-desc${source.ok ? '' : ' card-desc-error'}">${detail}</p>
          </div>
        </article>
      `;
    })
    .join('');
}

function metricTone(metricKey, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'neutral';

  if (metricKey === 'load') {
    if (value < 1.5) return 'good';
    if (value < 3) return 'warn';
    return 'bad';
  }

  if (['cpu', 'memory', 'disk', 'swap'].includes(metricKey)) {
    if (value < 70) return 'good';
    if (value < 85) return 'warn';
    return 'bad';
  }

  return 'neutral';
}

function formatMetricValue(unit, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'load') return value.toFixed(2);
  if (unit === 'kbps') return `${value.toFixed(1)} KB/s`;
  return String(value);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function renderMetricCell(metricKey, unit, value) {
  const tone = metricTone(metricKey, value);
  return `<td class="metric-cell tone-${tone}">${formatMetricValue(unit, value)}</td>`;
}

function renderServerMetricsCard(server) {
  const label = SERVER_LABELS[server.name] || server.name;
  if (!server.ok || !server.metrics) {
    return `
      <section class="metrics-card">
        <div class="metrics-card-header">
          <div>
            <h3>${label}</h3>
            <p class="metrics-host">unreachable</p>
          </div>
        </div>
        <p class="metrics-error">${escapeHtml(server.error || 'No metrics available')}</p>
      </section>
    `;
  }

  const { metrics, hostname } = server;
  const disk = metrics.disk || {};
  const bootTime = metrics.bootTime ? formatTimestamp(metrics.bootTime) : '—';
  const uptime = formatDuration(metrics.uptimeSeconds);
  const diskSummary = disk.totalBytes
    ? `${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)} (${disk.usedPercent ?? '—'}%)`
    : '—';

  const rows = METRIC_ROWS.map((row) => {
    const series = metrics.series?.[row.key] || {};
    const cells = METRIC_WINDOWS.map((window) =>
      renderMetricCell(row.key, row.unit, series[window]),
    ).join('');

    return `
      <tr>
        <th scope="row">${row.label}</th>
        ${cells}
      </tr>
    `;
  }).join('');

  const headers = METRIC_WINDOWS.map(
    (window) => `<th scope="col">${METRIC_WINDOW_LABELS[window]}</th>`,
  ).join('');

  return `
    <section class="metrics-card">
      <div class="metrics-card-header">
        <div>
          <h3>${label}</h3>
          <p class="metrics-host">${escapeHtml(hostname || '')}</p>
        </div>
        <span class="metrics-source">${metrics.source === 'netdata' ? 'netdata history' : 'live snapshot'}</span>
      </div>

      <div class="metrics-meta">
        <div class="metrics-meta-item">
          <span class="metrics-meta-label">Last restart</span>
          <span class="metrics-meta-value">${bootTime}</span>
        </div>
        <div class="metrics-meta-item">
          <span class="metrics-meta-label">Uptime</span>
          <span class="metrics-meta-value">${uptime}</span>
        </div>
        <div class="metrics-meta-item">
          <span class="metrics-meta-label">Disk (${escapeHtml(disk.mount || '/')})</span>
          <span class="metrics-meta-value">${diskSummary}</span>
        </div>
      </div>

      <div class="metrics-table-wrap">
        <table class="metrics-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              ${headers}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderServerMetrics(servers) {
  const container = document.getElementById('server-metrics');
  if (!servers?.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <h2 class="section-title">Server metrics</h2>
    <p class="section-lead">Averages from Netdata: now, 1m, 5m, 30m, 1h, 1d.</p>
    <div class="metrics-grid">
      ${servers.map(renderServerMetricsCard).join('')}
    </div>
  `;
}

function sortItems(items) {
  const order = new Map(GROUP_ORDER.map((group, index) => [group, index]));
  return [...items].sort((a, b) => {
    const groupDiff = (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99);
    if (groupDiff !== 0) return groupDiff;
    return a.name.localeCompare(b.name);
  });
}

function renderServiceCard(item) {
  const status = item.status || 'unknown';
  const statusKind = STATUS_BADGE[status] || 'secondary';
  const badges = [
    badge(item.group || 'Service', 'primary'),
    badge(status, statusKind),
  ];

  if (item.latencyMs || item.latencyMs === 0) {
    badges.push(badge(formatLatency(item.latencyMs), 'secondary'));
  }
  if (item.httpStatus) {
    badges.push(badge(`HTTP ${item.httpStatus}`, 'secondary'));
  }

  const description = item.message
    ? escapeHtml(item.message)
    : `${escapeHtml(item.id)} health check`;

  return `
    <article class="card">
      <div class="card-body">
        <div class="card-header">
          <h2 class="card-title">${escapeHtml(item.name)}</h2>
          <div class="card-badges">${badges.join('')}</div>
        </div>
        <p class="card-desc${item.message ? ' card-desc-error' : ''}">${description}</p>
      </div>
    </article>
  `;
}

function renderGroups(items) {
  const container = document.getElementById('groups');
  const sorted = sortItems(items);
  container.innerHTML = sorted.map(renderServiceCard).join('');
}

function renderLoading() {
  document.getElementById('summary').innerHTML = badge('checking…', 'secondary');
  document.getElementById('source-meta').innerHTML = `
    <article class="card skeleton-card skeleton-chip"></article>
    <article class="card skeleton-card skeleton-chip"></article>
  `;

  document.getElementById('server-metrics').innerHTML = `
    <h2 class="section-title">Server metrics</h2>
    <p class="section-lead">Loading Bill and Steve metrics…</p>
    <div class="metrics-grid">
      <section class="metrics-card skeleton-metrics"></section>
      <section class="metrics-card skeleton-metrics"></section>
    </div>
  `;

  document.getElementById('groups').innerHTML = Array.from({ length: 6 })
    .map(() => '<article class="card skeleton-card"></article>')
    .join('');
}

function renderError(message) {
  document.getElementById('summary').innerHTML = [
    badge('unable to load', 'down'),
    badge(message, 'secondary'),
  ].join('');

  document.getElementById('groups').innerHTML = `
    <div class="error-box">
      Could not reach one or both server status endpoints. Make sure
      <code>/status</code> is deployed on Bill and Steve.
    </div>
  `;
  document.getElementById('source-meta').innerHTML = '';
  document.getElementById('server-metrics').innerHTML = '';
}

async function refresh() {
  const button = document.getElementById('refresh-btn');
  button.disabled = true;
  renderLoading();

  try {
    const data = await loadStatus();
    document.getElementById('last-updated').textContent = `Checked ${formatTimestamp(new Date().toISOString())}`;
    renderSummary(data);
    renderSources(data.sources);
    renderServerMetrics(data.servers);
    renderGroups(data.items);
  } catch (error) {
    renderError(error.message);
  } finally {
    button.disabled = false;
  }
}

const THEME_STORAGE_KEY = 'truespace-status-theme';

function getPreferredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (error) {}

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const button = document.getElementById('theme-toggle-btn');
  if (!button) return;

  const isDark = theme === 'dark';
  button.textContent = isDark ? '☀' : '☾';
  button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  button.setAttribute('aria-pressed', String(isDark));
}

function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {}
}

function initTheme() {
  applyTheme(getPreferredTheme());

  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
}

document.getElementById('refresh-btn').addEventListener('click', refresh);
initTheme();
refresh();
setInterval(refresh, 5 * 60 * 1000);
