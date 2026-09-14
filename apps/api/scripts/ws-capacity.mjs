/**
 * Phase 8 WebSocket capacity probe (details.md §54 / Phase 8).
 *
 * Opens N authenticated admin observer sockets against one LIVE competition
 * and reports connect + join latency percentiles.
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_TOKEN=... node scripts/ws-capacity.mjs
 *   SOCKETS=100 ADMIN_BOOTSTRAP_TOKEN=... node scripts/ws-capacity.mjs
 */
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WS = process.env.WS_URL ?? 'http://localhost:3001';
const SOCKETS = Number(process.env.SOCKETS ?? 50);
const suffix = String(Date.now());

async function json(method, path, body, token, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[idx];
}

async function provisionAdmin() {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    return json('POST', '/auth/login', {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
  }
  const bootstrap = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!bootstrap) {
    throw new Error(
      'Set ADMIN_EMAIL/ADMIN_PASSWORD or ADMIN_BOOTSTRAP_TOKEN for ws-capacity',
    );
  }
  return json(
    'POST',
    '/auth/admins',
    {
      email: `ws-admin-${suffix}@hirance.test`,
      password: 'password123',
      name: 'WS Admin',
    },
    undefined,
    { 'x-admin-bootstrap-token': bootstrap },
  );
}

console.log(`ws-capacity: sockets=${SOCKETS}`);

const admin = await provisionAdmin();
const competition = await json(
  'POST',
  '/competitions',
  {
    name: `WS Cap ${suffix}`,
    durationSeconds: 300,
    allowOpenJoin: true,
  },
  admin.access_token,
);
await json(
  'POST',
  `/competitions/${competition.id}/schedule`,
  { scheduledStartAt: new Date(Date.now() + 60_000).toISOString() },
  admin.access_token,
);
await json(
  'POST',
  `/competitions/${competition.id}/start`,
  {},
  admin.access_token,
);

const connectMs = [];
const joinMs = [];
const sockets = [];
let failures = 0;

await Promise.all(
  Array.from({ length: SOCKETS }, async () => {
    const started = performance.now();
    const socket = io(`${WS}/competition`, {
      auth: { token: admin.access_token },
      transports: ['websocket'],
    });
    try {
      await new Promise((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('connect timeout')), 20_000);
      });
      connectMs.push(performance.now() - started);
      const joinStarted = performance.now();
      const ack = await socket.emitWithAck('join_competition', {
        competitionId: competition.id,
      });
      joinMs.push(performance.now() - joinStarted);
      if (!ack?.ok) failures += 1;
      sockets.push(socket);
    } catch {
      failures += 1;
      socket.close();
    }
  }),
);

connectMs.sort((a, b) => a - b);
joinMs.sort((a, b) => a - b);

const metrics = await json('GET', '/metrics');

for (const socket of sockets) socket.close();

console.log(
  JSON.stringify(
    {
      sockets_requested: SOCKETS,
      sockets_connected: sockets.length,
      failures,
      connect_ms: {
        p50: Math.round(percentile(connectMs, 50)),
        p95: Math.round(percentile(connectMs, 95)),
        p99: Math.round(percentile(connectMs, 99)),
        max: Math.round(connectMs[connectMs.length - 1] ?? 0),
      },
      join_ms: {
        p50: Math.round(percentile(joinMs, 50)),
        p95: Math.round(percentile(joinMs, 95)),
        p99: Math.round(percentile(joinMs, 99)),
        max: Math.round(joinMs[joinMs.length - 1] ?? 0),
      },
      metrics_websocket: metrics.websocket,
    },
    null,
    2,
  ),
);
