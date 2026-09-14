import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3006/api';
const WS = process.env.WS_URL ?? 'http://localhost:3006';
const suffix = String(Math.floor(Math.random() * 1_000_000));

async function json(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const admin = await json('POST', '/auth/register', {
  email: `admin${suffix}@hirance.test`,
  password: 'password123',
  name: 'Admin',
  role: 'ADMIN',
});
const employer = await json('POST', '/auth/register', {
  email: `hr${suffix}@hirance.test`,
  password: 'password123',
  name: 'HR User',
  role: 'EMPLOYER',
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
  { name: `P3 ${suffix}`, durationSeconds: 300 },
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
  `/competitions/${comp.id}/register`,
  { userId: employer.user.id, companyId: company.id },
  admin.access_token,
);
await json(
  'POST',
  `/competitions/${comp.id}/join`,
  { companyId: company.id },
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

await json(`POST`, `/competitions/${comp.id}/start`, null, admin.access_token);

const job = await json(
  'POST',
  '/jobs',
  {
    title: 'Realtime Engineer',
    description: 'Ship Socket.IO competition events',
    companyId: company.id,
    competitionId: comp.id,
  },
  employer.access_token,
);
await json('POST', `/jobs/${job.id}/publish`, null, employer.access_token);

await new Promise((r) => setTimeout(r, 1500));

console.log(
  JSON.stringify({
    joinOk: joinAck?.ok === true,
    joinStatus: joinAck?.status,
    seen: [...new Set(seen)],
    gotStarted: seen.includes('COMPETITION_STARTED'),
    gotScore: seen.includes('SCORE_UPDATED'),
    gotLeaderboard: seen.includes('LEADERBOARD_UPDATED'),
  }),
);

socket.disconnect();
process.exit(0);
