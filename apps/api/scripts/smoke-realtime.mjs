/**
 * Smoke: competition lifecycle + webhook score → Socket.IO events.
 *
 * Requires EXTERNAL_JOB_WEBHOOK_SECRET and ADMIN_EMAIL/ADMIN_PASSWORD
 * (or ADMIN_BOOTSTRAP_TOKEN for first admin).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const WS = process.env.WS_URL ?? 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.EXTERNAL_JOB_WEBHOOK_SECRET;
const suffix = String(Math.floor(Math.random() * 1_000_000));
const externalUserId = `ext-smoke-${suffix}`;

if (!WEBHOOK_SECRET) {
  throw new Error('Set EXTERNAL_JOB_WEBHOOK_SECRET for smoke-realtime');
}

async function json(method, path, body, token, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
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
    throw new Error('Set ADMIN_EMAIL/ADMIN_PASSWORD or ADMIN_BOOTSTRAP_TOKEN');
  }
  return json(
    'POST',
    '/auth/admins',
    {
      email: `smoke-admin-${suffix}@hirance.test`,
      password: 'password123',
      name: 'Smoke Admin',
    },
    undefined,
    { 'x-admin-bootstrap-token': bootstrap },
  );
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

const admin = await provisionAdmin();
const employer = await json('POST', '/auth/register', {
  email: `hr${suffix}@hirance.test`,
  password: 'password123',
  name: 'HR User',
});

const company = await json(
  'POST',
  '/companies',
  { name: `Acme ${suffix}` },
  employer.access_token,
);

const comp = await json(
  'POST',
  '/competitions',
  { name: `P3 ${suffix}`, durationSeconds: 300, allowOpenJoin: true },
  admin.access_token,
);

const scheduledStartAt = new Date(Date.now() + 5 * 60_000).toISOString();
await json(
  'POST',
  `/competitions/${comp.id}/schedule`,
  { scheduledStartAt },
  admin.access_token,
);
await json(
  'POST',
  `/competitions/${comp.id}/join`,
  { companyId: company.id, externalUserId },
  employer.access_token,
);

const seen = [];
const socket = io(`${WS}/competition`, {
  auth: { token: employer.access_token },
  transports: ['websocket'],
});

await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
  setTimeout(() => reject(new Error('socket connect timeout')), 10_000);
});

const joinAck = await socket.emitWithAck('join_competition', {
  competitionId: comp.id,
});
console.log('JOIN_ACK', JSON.stringify(joinAck));

for (const event of [
  'COMPETITION_STARTED',
  'SCORE_UPDATED',
  'LEADERBOARD_UPDATED',
  'JOB_PUBLISHED',
]) {
  socket.on(event, (payload) => {
    seen.push(event);
    console.log('EVENT', event, JSON.stringify(payload).slice(0, 180));
  });
}

await json('POST', `/competitions/${comp.id}/start`, {}, admin.access_token);

const ingest = await postJobEvent({
  event_id: randomUUID(),
  event: 'JOB_PUBLISHED',
  external_user_id: externalUserId,
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
    joinStatus: joinAck?.status,
    scored: ingest?.scored === true,
    seen: [...new Set(seen)],
    gotStarted: seen.includes('COMPETITION_STARTED'),
    gotScore: seen.includes('SCORE_UPDATED'),
    gotLeaderboard: seen.includes('LEADERBOARD_UPDATED'),
  }),
);

socket.disconnect();
process.exit(0);
