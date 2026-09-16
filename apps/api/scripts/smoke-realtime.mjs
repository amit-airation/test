/**
 * Smoke: round lifecycle + webhook score → Socket.IO events.
 *
 * Requires:
 *   EXTERNAL_JOB_WEBHOOK_SECRET
 *   ADMIN_KEY
 *   EVENT_ACCESS_KEY
 */
import { createHmac, randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WS = process.env.WS_URL ?? 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.EXTERNAL_JOB_WEBHOOK_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;
const EVENT_KEY = process.env.EVENT_ACCESS_KEY ?? process.env.NEXT_PUBLIC_EVENT_KEY;
const suffix = String(Math.floor(Math.random() * 1_000_000));
const companyId = randomUUID();
const companyName = `Acme Smoke ${suffix}`;

if (!WEBHOOK_SECRET) throw new Error('Set EXTERNAL_JOB_WEBHOOK_SECRET');
if (!ADMIN_KEY) throw new Error('Set ADMIN_KEY');
if (!EVENT_KEY) throw new Error('Set EVENT_ACCESS_KEY');

async function json(method, path, body, { admin = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'x-admin-key': ADMIN_KEY } : { 'x-event-key': EVENT_KEY }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function postJobEvent(payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
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
  if (!res.ok) throw new Error(`webhook: ${text}`);
  return text ? JSON.parse(text) : null;
}

const competition = await json(
  'POST',
  '/competitions',
  { name: `Smoke ${suffix}` },
  { admin: true },
);

const round = await json(
  'POST',
  `/competitions/${competition.id}/rounds`,
  { roundNumber: 1, name: 'Round 1', durationSeconds: 300 },
  { admin: true },
);

await json(
  'POST',
  `/competitions/${competition.id}/active-round`,
  { roundId: round.id },
  { admin: true },
);

await json(
  'POST',
  `/competitions/${competition.id}/rounds/${round.id}/join`,
  { companyId, companyName },
);

const seen = [];
const socket = io(`${WS}/competition`, {
  auth: { eventKey: EVENT_KEY },
  transports: ['websocket'],
});

await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket connect timeout')), 10_000);
});

const joinAck = await socket.emitWithAck('join_competition', {
  competitionId: competition.id,
  companyId,
  companyName,
});
console.log('JOIN_ACK', JSON.stringify(joinAck));

await socket.emitWithAck('join_round', {
  competitionId: competition.id,
  roundId: round.id,
  companyId,
});

for (const event of [
  'ROUND_STARTED',
  'SCORE_UPDATED',
  'LEADERBOARD_UPDATED',
  'JOB_PUBLISHED',
]) {
  socket.on(event, (payload) => {
    seen.push(event);
    console.log('EVENT', event, JSON.stringify(payload).slice(0, 180));
  });
}

await json(
  'POST',
  `/competitions/${competition.id}/rounds/${round.id}/start`,
  {},
  { admin: true },
);

const ingest = await postJobEvent({
  event_id: randomUUID(),
  event: 'JOB_PUBLISHED',
  company_id: companyId,
  company_name: companyName,
  external_job_id: `job-smoke-${suffix}`,
  published_at: new Date().toISOString(),
  job: {
    title: 'Realtime Engineer',
    description: 'Ship Socket.IO competition events',
    location: 'Remote',
    employment_type: 'FULL_TIME',
  },
});
console.log('INGEST', JSON.stringify(ingest));

await new Promise((r) => setTimeout(r, 1500));

console.log(
  JSON.stringify({
    joinOk: joinAck?.ok === true,
    scored: ingest?.scored === true,
    seen: [...new Set(seen)],
    gotStarted: seen.includes('ROUND_STARTED'),
    gotScore: seen.includes('SCORE_UPDATED'),
    gotLeaderboard: seen.includes('LEADERBOARD_UPDATED'),
  }),
);

socket.disconnect();
process.exit(0);
