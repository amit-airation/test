/**
 * Load scenario — webhook scoring only (company_id identity).
 *
 * Usage (API must already be running + migrated):
 *   EXTERNAL_JOB_WEBHOOK_SECRET=... ADMIN_KEY=... EVENT_ACCESS_KEY=... node scripts/load-competition.mjs
 *   PARTICIPANTS=50 OBSERVERS=5 PUBLISHES_PER=2 ...
 */
import { createHmac, randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WS = process.env.WS_URL ?? 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.EXTERNAL_JOB_WEBHOOK_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;
const EVENT_KEY = process.env.EVENT_ACCESS_KEY ?? process.env.NEXT_PUBLIC_EVENT_KEY;
const PARTICIPANTS = Number(process.env.PARTICIPANTS ?? 20);
const OBSERVERS = Number(process.env.OBSERVERS ?? 5);
const PUBLISHES_PER = Number(process.env.PUBLISHES_PER ?? 2);
const suffix = String(Date.now());

const httpLatencies = [];

if (!WEBHOOK_SECRET) throw new Error('Set EXTERNAL_JOB_WEBHOOK_SECRET');
if (!ADMIN_KEY) throw new Error('Set ADMIN_KEY');
if (!EVENT_KEY) throw new Error('Set EVENT_ACCESS_KEY');

async function json(method, path, body, { admin = false } = {}) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'x-admin-key': ADMIN_KEY } : { 'x-event-key': EVENT_KEY }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  httpLatencies.push(performance.now() - started);
  if (!res.ok) throw new Error(`${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function postJobEvent(payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const started = performance.now();
  const res = await fetch(`${API}/integrations/job-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hirance-timestamp': timestamp,
      'x-hirance-signature': signature,
    },
    body,
  });
  const text = await res.text();
  httpLatencies.push(performance.now() - started);
  if (!res.ok) throw new Error(`webhook: ${text}`);
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

console.log(
  `load-competition: participants=${PARTICIPANTS} observers=${OBSERVERS} publishes_per=${PUBLISHES_PER}`,
);

const competition = await json(
  'POST',
  '/competitions',
  { name: `Load ${suffix}` },
  { admin: true },
);

const round = await json(
  'POST',
  `/competitions/${competition.id}/rounds`,
  { roundNumber: 1, name: 'Load Round', durationSeconds: 300 },
  { admin: true },
);

await json(
  'POST',
  `/competitions/${competition.id}/active-round`,
  { roundId: round.id },
  { admin: true },
);

const companies = [];
for (let i = 0; i < PARTICIPANTS; i += 1) {
  const companyId = randomUUID();
  const companyName = `Load Co ${suffix}-${i}`;
  await json('POST', `/competitions/${competition.id}/rounds/${round.id}/join`, {
    companyId,
    companyName,
  });
  companies.push({ companyId, companyName });
}

await json(
  'POST',
  `/competitions/${competition.id}/rounds/${round.id}/start`,
  {},
  { admin: true },
);

const observerLatencies = [];
const observers = [];
for (let i = 0; i < OBSERVERS; i += 1) {
  const started = performance.now();
  const socket = io(`${WS}/competition`, {
    auth: { eventKey: EVENT_KEY },
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
  companies.flatMap(({ companyId, companyName }, idx) =>
    Array.from({ length: PUBLISHES_PER }, (_, j) =>
      (async () => {
        const started = performance.now();
        await postJobEvent({
          event_id: randomUUID(),
          event: 'JOB_PUBLISHED',
          company_id: companyId,
          company_name: companyName,
          external_job_id: `job-load-${suffix}-${idx}-${j}`,
          published_at: new Date().toISOString(),
          job: {
            title: `Job ${idx}-${j}`,
            description: 'Load-test competition job from external server',
            location: 'Remote',
            employment_type: 'FULL_TIME',
          },
        });
        publishLatencies.push(performance.now() - started);
      })(),
    ),
  ),
);

await new Promise((r) => setTimeout(r, 1_500));

const metrics = await json('GET', '/metrics', undefined, { admin: true });

for (const socket of observers) socket.close();

console.log(
  JSON.stringify(
    {
      competition_id: competition.id,
      round_id: round.id,
      http: summarize('all_http', httpLatencies),
      webhook_publish: summarize('job_events_webhook', publishLatencies),
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
