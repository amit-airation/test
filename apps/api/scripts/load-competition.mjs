/**
 * Phase 8 load scenario (details.md §54).
 *
 * Simulates N participants publishing jobs concurrently plus O observer
 * WebSocket joins against a running API.
 *
 * Usage (API must already be running + migrated):
 *   node scripts/load-competition.mjs
 *   PARTICIPANTS=50 OBSERVERS=5 PUBLISHES_PER=2 node scripts/load-competition.mjs
 *
 * Env:
 *   API_URL   default http://localhost:3001/api
 *   WS_URL    default http://localhost:3001
 *   PARTICIPANTS  default 20 (use 100 for full §54 target)
 *   OBSERVERS     default 5
 *   PUBLISHES_PER default 2
 */
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WS = process.env.WS_URL ?? 'http://localhost:3001';
const PARTICIPANTS = Number(process.env.PARTICIPANTS ?? 20);
const OBSERVERS = Number(process.env.OBSERVERS ?? 5);
const PUBLISHES_PER = Number(process.env.PUBLISHES_PER ?? 2);
const suffix = String(Date.now());

const httpLatencies = [];

async function json(method, path, body, token, headers = {}) {
  const started = performance.now();
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
  httpLatencies.push(performance.now() - started);
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

function summarize(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    label,
    count: sorted.length,
    p50_ms: Math.round(percentile(sorted, 50)),
    p95_ms: Math.round(percentile(sorted, 95)),
    p99_ms: Math.round(percentile(sorted, 99)),
    max_ms: Math.round(sorted[sorted.length - 1] ?? 0),
  };
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
      'Set ADMIN_EMAIL/ADMIN_PASSWORD or ADMIN_BOOTSTRAP_TOKEN for load scripts',
    );
  }
  return json(
    'POST',
    '/auth/admins',
    {
      email: `load-admin-${suffix}@hirance.test`,
      password: 'password123',
      name: 'Load Admin',
    },
    undefined,
    { 'x-admin-bootstrap-token': bootstrap },
  );
}

console.log(
  `load-competition: participants=${PARTICIPANTS} observers=${OBSERVERS} publishes_per=${PUBLISHES_PER}`,
);

const admin = await provisionAdmin();

const competition = await json(
  'POST',
  '/competitions',
  {
    name: `Load ${suffix}`,
    durationSeconds: 300,
    allowOpenJoin: true,
  },
  admin.access_token,
);

const scheduledStartAt = new Date(Date.now() + 60_000).toISOString();
await json(
  'POST',
  `/competitions/${competition.id}/schedule`,
  { scheduledStartAt },
  admin.access_token,
);
await json(
  'POST',
  `/competitions/${competition.id}/start`,
  {},
  admin.access_token,
);

const employers = [];
for (let i = 0; i < PARTICIPANTS; i += 1) {
  const user = await json('POST', '/auth/register', {
    email: `load-p${i}-${suffix}@hirance.test`,
    password: 'password123',
    name: `P${i}`,
  });
  const company = await json(
    'POST',
    '/companies',
    { name: `Load Co ${suffix}-${i}` },
    user.access_token,
  );
  await json(
    'POST',
    `/competitions/${competition.id}/join`,
    { companyId: company.id },
    user.access_token,
  );
  employers.push({ user, company });
}

const observerLatencies = [];
const observers = [];
for (let i = 0; i < OBSERVERS; i += 1) {
  const started = performance.now();
  const socket = io(`${WS}/competition`, {
    auth: { token: admin.access_token },
    transports: ['websocket'],
  });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('observer connect timeout')), 15_000);
  });
  const ack = await socket.emitWithAck('join_competition', {
    competitionId: competition.id,
  });
  if (!ack?.ok) throw new Error(`observer join failed: ${JSON.stringify(ack)}`);
  observerLatencies.push(performance.now() - started);
  observers.push(socket);
}

const publishLatencies = [];
const scoreEvents = [];
observers[0]?.on('SCORE_UPDATED', () => {
  scoreEvents.push(performance.now());
});

await Promise.all(
  employers.flatMap(({ user: employer, company }, idx) =>
    Array.from({ length: PUBLISHES_PER }, (_, j) =>
      (async () => {
        const started = performance.now();
        const job = await json(
          'POST',
          '/jobs',
          {
            title: `Job ${idx}-${j}`,
            companyId: company.id,
            competitionId: competition.id,
            idempotencyKey: `load-${suffix}-${idx}-${j}`,
          },
          employer.access_token,
        );
        await json(
          'POST',
          `/jobs/${job.id}/publish`,
          {},
          employer.access_token,
        );
        publishLatencies.push(performance.now() - started);
      })(),
    ),
  ),
);

await new Promise((r) => setTimeout(r, 1_500));

const metrics = await json('GET', '/metrics', undefined, admin.access_token);

for (const socket of observers) socket.close();

console.log(
  JSON.stringify(
    {
      competition_id: competition.id,
      http: summarize('all_http', httpLatencies),
      publish_cycle: summarize('create_and_publish', publishLatencies),
      observer_join: summarize('observer_ws_join', observerLatencies),
      score_events_seen: scoreEvents.length,
      metrics_snapshot: {
        publish: metrics.publish,
        websocket: metrics.websocket,
        realtime: metrics.realtime,
        leaderboard: metrics.leaderboard,
        alerts: metrics.alerts,
      },
    },
    null,
    2,
  ),
);
