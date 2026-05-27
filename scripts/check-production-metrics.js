#!/usr/bin/env node

const DEFAULT_METRICS_URL = 'http://localhost:3000/health/metrics';

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : String(value).trim();
}

async function loadMetrics() {
  const inlineJson = readEnv('METRICS_JSON');
  if (inlineJson) return JSON.parse(inlineJson);

  const metricsUrl = readEnv('METRICS_URL', DEFAULT_METRICS_URL);
  const response = await fetch(metricsUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(Number(readEnv('METRICS_TIMEOUT_MS', '10000'))),
  });

  if (!response.ok) {
    throw new Error(`Metrics endpoint returned HTTP ${response.status}`);
  }

  return response.json();
}

function getFiredAlerts(metrics) {
  if (!metrics || !Array.isArray(metrics.alerts)) {
    throw new Error('Metrics payload missing alerts[]');
  }

  return metrics.alerts.filter((alert) => alert && alert.fired === true);
}

function formatAlertText(firedAlerts, metrics) {
  const lines = [
    'ALERT: Calorie AI production metrics out of threshold',
    `snapshot_at=${metrics.snapshot_at ?? 'unknown'}`,
  ];

  for (const alert of firedAlerts) {
    lines.push(
      `${alert.name}: value=${alert.value ?? 'n/a'}${alert.unit ?? ''} threshold=${alert.threshold ?? 'n/a'}${alert.unit ?? ''}`,
    );
  }

  return lines.join('\n');
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(readEnv('ALERT_TIMEOUT_MS', '10000'))),
  });

  if (!response.ok) {
    throw new Error(`Alert webhook returned HTTP ${response.status}`);
  }
}

async function sendAlert(firedAlerts, metrics) {
  const text = formatAlertText(firedAlerts, metrics);
  const genericWebhook = readEnv('ALERT_WEBHOOK_URL');
  const telegramToken = readEnv('TELEGRAM_BOT_TOKEN');
  const telegramChatId = readEnv('TELEGRAM_CHAT_ID');

  if (genericWebhook) {
    await postJson(genericWebhook, {
      text,
      alerts: firedAlerts,
      snapshot_at: metrics.snapshot_at,
      window_start: metrics.window_start,
    });
    return 'webhook';
  }

  if (telegramToken && telegramChatId) {
    const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    await postJson(url, {
      chat_id: telegramChatId,
      text,
      disable_web_page_preview: true,
    });
    return 'telegram';
  }

  return 'none';
}

async function main() {
  const metrics = await loadMetrics();
  const firedAlerts = getFiredAlerts(metrics);

  if (firedAlerts.length === 0) {
    console.log('OK: no production metric alerts fired');
    return 0;
  }

  const destination = await sendAlert(firedAlerts, metrics);
  console.error(formatAlertText(firedAlerts, metrics));
  console.error(`Alert destination: ${destination}`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
