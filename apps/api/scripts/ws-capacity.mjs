/**
 * WebSocket capacity probe — opens N event-key observer sockets.
 *
 * Usage:
 *   EVENT_ACCESS_KEY=... ADMIN_KEY=... node scripts/ws-capacity.mjs
 *   SOCKETS=100 EVENT_ACCESS_KEY=... ADMIN_KEY=... node scripts/ws-capacity.mjs
 */
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WS = process.env.WS_URL ?? 'http://localhost:3001';
const SOCKETS = Number(process.env.SOCKETS ?? 50);
const ADMIN_KEY = process.env.ADMIN_KEY;
const EVENT_KEY = process.env.EVENT_ACCESS_KEY ?? process.env.NEXT_PUBLIC_EVENT_KEY;
const suffix = String(Date.now());

if (!ADMIN_KEY) throw new Error('Set ADMIN_KEY');
if (!EVENT_KEY) throw new Error('Set EVENT_ACCESS_KEY');

async function json(method, path, body, { admin = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'x-admin-key': ADMIN_KEY } : { 'x-event-key': EVENT_KEY }),
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

console.log(`ws-capacity: sockets=${SOCKETS}`);

const competition = await json(
  'POST',
  '/competitions',
  { name: `WS Cap ${suffix}` },
  { admin: true },
);

const connectMs = [];
const joinMs = [];
const sockets = [];
let failures = 0;

await Promise.all(
  Array.from({ length: SOCKETS }, async () => {
    const started = performance.now();
    const socket = io(`${WS}/competition`, {
      auth: { eventKey: EVENT_KEY },
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

let metrics = null;
try {
  metrics = await json('GET', '/metrics', undefined, { admin: true });
} catch {
  metrics = null;
}

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
      metrics_websocket: metrics?.websocket ?? null,
    },
    null,
    2,
  ),
);
