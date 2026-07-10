const STATUS_ENDPOINTS = {
  bill: 'https://truespace-tunnel.fly.dev:8080/status',
  steve: 'https://truespace-tunnel.fly.dev:8090/status',
};

const GROUP_ORDER = ['Public', 'Bill', 'Steve'];
const GROUP_LABELS = {
  Public: 'Public',
  Bill: 'Bill server',
  Steve: 'Steve server',
};

const GROUP_HINTS = {
  Public: 'Customer-facing',
  Bill: 'ML & content services',
  Steve: 'APIs & platform',
};

const OVERALL_LABELS = {
  operational: 'All systems operational',
  degraded: 'Some services degraded',
  major: 'Major outage',
  unknown: 'Status partially unknown',
};

const STATUS_LABELS = {
  up: 'Healthy',
  down: 'Down',
  unknown: 'Unknown',
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

const SERVICE_ICONS = {
  app: '🌐',
  scraper: '🔍',
  'ml-tags': '🏷️',
  'ml-embeddings': '🧠',
  'ml-video': '🎬',
  translator: '🌍',
  cdn: '📦',
  images: '🖼️',
  'config-api': '⚙️',
  'users-api': '👤',
  'recommendations-api': '✨',
  'profiles-api': '🪪',
  'domains-api': '🔗',
  'bill-endpoint': '🖥️',
  'steve-endpoint': '🖥️',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function fetchServerStatus(name, url) {
  const started = performance.now();
  try {
    const response = await fetch(`${url}?ts=${Date.now()}`, { cache: 'no-store' });
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

function latencyClass(ms) {
  if (!ms) return 'neutral';
  if (ms < 300) return 'fast';
  if (ms < 1500) return 'medium';
  return 'slow';
}

function renderBanner(data) {
  const banner = document.getElementById('overall-banner');
  const title = banner.querySelector('.banner-title');
  const detail = document.getElementById('summary-text');

  banner.className = `banner banner-${data.overall}`;
  title.textContent = OVERALL_LABELS[data.overall] || 'Status update';
  detail.innerHTML = `
    <span class="summary-chip up">${data.summary.up} healthy</span>
    <span class="summary-chip down">${data.summary.down} down</span>
    ${data.summary.unknown ? `<span class="summary-chip unknown">${data.summary.unknown} unknown</span>` : ''}
  `;
}

function renderSources(sources) {
  const container = document.getElementById('source-meta');
  container.innerHTML = sources
    .map((source) => {
      const label = source.server === 'bill' ? 'Bill' : 'Steve';
      const statusClass = source.ok ? 'source-ok' : 'source-down';
      const statusLabel = source.ok ? 'reachable' : 'unreachable';
      const detail = source.ok
        ? `${formatLatency(source.latencyMs)} · ${formatTimestamp(source.updatedAt)}`
        : escapeHtml(source.error);

      return `
        <div class="source-chip ${statusClass}">
          <span class="source-chip-label">${label}</span>
          <span class="source-chip-status">${statusLabel}</span>
          <span class="source-chip-detail">${detail}</span>
        </div>
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
      <section class="metrics-card metrics-card-error">
        <div class="metrics-card-header">
          <h2>${label}</h2>
          <span class="metrics-host">unreachable</span>
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
          <h2>${label}</h2>
          <p class="metrics-host">${escapeHtml(hostname || '')}</p>
        </div>
        <span class="metrics-source">${metrics.source === 'netdata' ? 'Netdata history' : 'Live snapshot'}</span>
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
    <div class="section-heading">
      <h2>Server metrics</h2>
      <p>Averages from Netdata: now, 1m, 5m, 30m, 1h, 1d</p>
    </div>
    <div class="metrics-grid">
      ${servers.map(renderServerMetricsCard).join('')}
    </div>
  `;
}

function renderGroupHealthBar(items) {
  const total = items.length || 1;
  const up = items.filter((item) => item.status === 'up').length;
  const down = items.filter((item) => item.status === 'down').length;
  const unknown = items.filter((item) => item.status === 'unknown').length;

  const upPct = (up / total) * 100;
  const downPct = (down / total) * 100;
  const unknownPct = (unknown / total) * 100;

  return `
    <div class="health-bar" aria-hidden="true">
      <span class="health-bar-segment up" style="width:${upPct}%"></span>
      <span class="health-bar-segment down" style="width:${downPct}%"></span>
      <span class="health-bar-segment unknown" style="width:${unknownPct}%"></span>
    </div>
  `;
}

function renderGroups(items) {
  const container = document.getElementById('groups');
  const grouped = new Map(GROUP_ORDER.map((name) => [name, []]));

  for (const item of items) {
    if (!grouped.has(item.group)) {
      grouped.set(item.group, []);
    }
    grouped.get(item.group).push(item);
  }

  container.innerHTML = '';

  for (const groupName of GROUP_ORDER) {
    const groupItems = grouped.get(groupName) || [];
    if (groupItems.length === 0) continue;

    const up = groupItems.filter((item) => item.status === 'up').length;
    const card = document.createElement('section');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-header">
        <div class="group-heading">
          <h2>${GROUP_LABELS[groupName] || groupName}</h2>
          <p class="group-hint">${GROUP_HINTS[groupName] || ''}</p>
        </div>
        <div class="group-summary">
          <span class="group-count">${up}/${groupItems.length} healthy</span>
          ${renderGroupHealthBar(groupItems)}
        </div>
      </div>
      <div class="service-grid">
        ${groupItems.map(renderServiceItem).join('')}
      </div>
    `;
    container.appendChild(card);
  }
}

function renderServiceItem(item) {
  const icon = SERVICE_ICONS[item.id] || '•';
  const statusLabel = STATUS_LABELS[item.status] || item.status;
  const latency = formatLatency(item.latencyMs);
  const latencyTone = latencyClass(item.latencyMs);
  const http = item.httpStatus ? `HTTP ${item.httpStatus}` : null;
  const message = item.message ? escapeHtml(item.message) : '';

  return `
    <article class="service-card status-${item.status}" aria-label="${escapeHtml(item.name)}: ${statusLabel}">
      <div class="service-card-top">
        <div class="service-icon" aria-hidden="true">${icon}</div>
        <div class="service-pill status-${item.status}">
          <span class="status-dot" aria-hidden="true"></span>
          ${statusLabel}
        </div>
      </div>

      <h3 class="service-name">${escapeHtml(item.name)}</h3>

      <div class="service-metrics">
        <span class="metric latency-${latencyTone}" title="Response time">
          <span class="metric-label">Latency</span>
          <span class="metric-value">${latency}</span>
        </span>
        ${
          http
            ? `<span class="metric metric-http" title="HTTP status code">
                <span class="metric-label">Response</span>
                <span class="metric-value">${escapeHtml(http)}</span>
              </span>`
            : ''
        }
      </div>

      ${message ? `<p class="service-message">${message}</p>` : ''}
    </article>
  `;
}

function renderLoading() {
  const banner = document.getElementById('overall-banner');
  banner.className = 'banner banner-loading';
  banner.querySelector('.banner-title').textContent = 'Checking status…';
  document.getElementById('summary-text').textContent = '';

  document.getElementById('server-metrics').innerHTML = `
    <div class="section-heading">
      <h2>Server metrics</h2>
      <p>Loading Bill and Steve metrics…</p>
    </div>
    <div class="metrics-grid">
      <section class="metrics-card skeleton-metrics"></section>
      <section class="metrics-card skeleton-metrics"></section>
    </div>
  `;

  document.getElementById('groups').innerHTML = GROUP_ORDER.map(
    (group) => `
      <section class="group-card group-card-loading">
        <div class="group-header">
          <div class="group-heading">
            <h2>${GROUP_LABELS[group]}</h2>
            <p class="group-hint">${GROUP_HINTS[group]}</p>
          </div>
        </div>
        <div class="service-grid">
          ${'<div class="service-card skeleton"></div>'.repeat(group === 'Public' ? 1 : group === 'Bill' ? 4 : 3)}
        </div>
      </section>
    `,
  ).join('');

  document.getElementById('source-meta').innerHTML = `
    <div class="source-chip skeleton-chip"></div>
    <div class="source-chip skeleton-chip"></div>
  `;
}

function renderError(message) {
  const banner = document.getElementById('overall-banner');
  banner.className = 'banner banner-major';
  banner.querySelector('.banner-title').textContent = 'Unable to load status';
  document.getElementById('summary-text').textContent = message;

  document.getElementById('groups').innerHTML = `
    <div class="error-box">
      Could not reach one or both server status endpoints. Make sure
      <code>/status</code> is deployed on Bill and Steve.
    </div>
  `;
  document.getElementById('source-meta').textContent = '';
  document.getElementById('server-metrics').innerHTML = '';
}

async function refresh() {
  const button = document.getElementById('refresh-btn');
  button.disabled = true;
  renderLoading();

  try {
    const data = await loadStatus();
    document.getElementById('last-updated').textContent = `Checked: ${formatTimestamp(new Date().toISOString())}`;
    renderSources(data.sources);
    renderBanner(data);
    renderServerMetrics(data.servers);
    renderGroups(data.items);
  } catch (error) {
    renderError(error.message);
  } finally {
    button.disabled = false;
  }
}

document.getElementById('refresh-btn').addEventListener('click', refresh);
refresh();
setInterval(refresh, 5 * 60 * 1000);
