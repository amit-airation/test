# Deployment & setup — Hirance Live Competition server

This document covers **production/staging deployment**, environment
configuration, and **external job-server integration**.

For a hands-on local webhook walkthrough (PowerShell), see
[`LOCAL_TESTING.md`](./LOCAL_TESTING.md).

Product rules and API semantics: [`details.md`](../details.md) §15 / §15.1.

---

## 1. What this service is

The competition monorepo is a **scoring / leaderboard / realtime** server.

| This server owns | This server does **not** own |
|------------------|------------------------------|
| Competitions, timer, presence | Job create / edit / publish UI |
| Scores & leaderboard | Authoritative job catalog |
| WebSocket live updates | Job-server user accounts |
| HMAC webhook ingest | |
| Optional LiveKit screen-share tokens | Media SFU hosting (you run LiveKit) |

```text
┌─────────────────────────┐   HMAC JOB_PUBLISHED    ┌──────────────────────────────┐
│ Hirance job server      │ ───────────────────────►│ Competition API              │
│ api.hirance.com         │                         │ api.test.amitverma01.dev     │
│ (create / publish)      │                         │ NestJS /api + Socket.IO      │
└─────────────────────────┘                         └──────────────┬───────────────┘
                                                                   │
                    ┌──────────────────────┐                       │
                    │ Participant / TV UI  │ ◄── JWT + WS ─────────┤
                    │ test.amitverma01.dev │                       │
                    └──────────────────────┘                       ▼
                                                        PostgreSQL + Redis
                                                        (+ LiveKit optional)
```

---

## 2. Repository layout

```text
apps/api/     NestJS API (global prefix /api)
apps/web/     Next.js participant + observer UI
docker/nginx/        reverse-proxy image + templates
docker-compose.yml   postgres, redis, livekit, nginx (profile)
docker-compose.prod.yml   production nginx edge
docs/LOCAL_TESTING.md
docs/DEPLOYMENT.md   ← this file
```

Default ports (override with env):

| Process | Default port |
|---------|--------------|
| API | `3001` (`API_PORT`) |
| Web | `3000` |
| Nginx (edge) | `80` / `443` — UI `test.amitverma01.dev`, API `api.test.amitverma01.dev` |
| Postgres | `5432` |
| Redis | `6379` |
| LiveKit | `7880` |

---

## 3. Prerequisites

- Node.js 22+ (repo uses modern Nest / Next)
- npm workspaces (root `package.json`)
- Docker (Postgres + Redis; LiveKit optional)
- Outbound HTTPS from the **job server** to this API’s public URL
- Shared HMAC secret between job server and this API

---

## 4. Environment reference

Copy [`.env.example`](../.env.example) into:

- `apps/api/.env` — API runtime
- `apps/web/.env.local` — browser-facing URLs only

### Required (API)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Prisma 7) |
| `REDIS_HOST` / `REDIS_PORT` | Presence, rate limits, Socket.IO adapter / Bull root |
| `JWT_SECRET` | HTTP + WebSocket JWT (≥ 32 chars in production) |
| `CORS_ORIGIN` | Explicit origin(s); no `*` in production |
| `EXTERNAL_JOB_WEBHOOK_SECRET` | HMAC secret for job-events (≥ 32 chars in production) |

### Strongly recommended (API)

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_PORT` | `3001` | Listen port |
| `EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS` | `300` | Replay window for webhook timestamps |
| `EXTERNAL_JOB_WEBHOOK_ENABLED` | `true` | Soft kill-switch (`false` → HTTP 503) |
| `REQUIRE_EXTERNAL_USER_ID_ON_JOIN` | `false` | Force `externalUserId` on register/join |
| `ADMIN_BOOTSTRAP_TOKEN` | empty | First-admin only; disable after bootstrap |
| `THROTTLE_*` | see `.env.example` | Auth / competition / WS connect limits |

### Web (build + runtime)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | e.g. `https://api.test.amitverma01.dev/api` |
| `NEXT_PUBLIC_WS_URL` | e.g. `https://api.test.amitverma01.dev` (Socket.IO origin) |

These are baked into the Next.js client bundle — set them for the **build**
environment that produces the web image/artifacts.

### Optional — screen share (LiveKit)

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_URL` | Server SDK HTTP URL (Nest mints tokens / closes rooms) |
| `LIVEKIT_PUBLIC_URL` | Browser WebSocket URL (`ws` / `wss`) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Strong secrets in production |

Leave unset to disable screen share gracefully in the UI.

### Production boot rules

With `NODE_ENV=production`, the API **refuses to start** if:

- `JWT_SECRET` is missing/weak (`change-me`, short, etc.)
- `CORS_ORIGIN` is missing or `*`
- `EXTERNAL_JOB_WEBHOOK_SECRET` is missing or &lt; 32 characters
- LiveKit is configured with weak/dev keys

See `apps/api/src/config/security.config.ts`.

---

## 5. Local setup (short)

```bash
# Infrastructure
docker compose up -d postgres redis
# optional: docker compose up -d livekit

# API
cd apps/api
cp ../../.env.example .env   # then edit
npx prisma migrate deploy
npm run start:dev

# Web
cd apps/web
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" > .env.local
echo "NEXT_PUBLIC_WS_URL=http://localhost:3001" >> .env.local
npm run dev
```

First admin (once):

```http
POST /api/auth/admins
Header: x-admin-bootstrap-token: <ADMIN_BOOTSTRAP_TOKEN>
Body: { "email", "password", "name" }
```

After the first ADMIN exists, bootstrap is disabled — use an admin JWT to
provision more admins.

Detailed local webhook testing: [`LOCAL_TESTING.md`](./LOCAL_TESTING.md).

---

## 6. Staging / production deployment

### 6.1 Infrastructure

1. Provision **PostgreSQL 16+** and **Redis 7+** (managed or self-hosted).
2. Ensure the API can reach both (private network preferred).
3. Optionally provision a **LiveKit** cluster (not the docker `--dev` image).
4. Put TLS termination in front of API + web (load balancer / **nginx** — see §6.7).
5. Allow WebSocket upgrade on the API host (Socket.IO namespace `/competition`).

### 6.2 Database migrations

Run from the API package against the target `DATABASE_URL`:

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate   # CI/build image should already do this
```

Do **not** use `prisma migrate dev` in production.

### 6.3 Build & run API

```bash
cd apps/api
npm ci
npx prisma generate
npm run build
NODE_ENV=production node dist/main.js
# or: npm run start:prod
```

Health endpoints (no auth):

| Path | Meaning |
|------|---------|
| `GET /api/health/live` | Process up |
| `GET /api/health/ready` | Postgres required; Redis down → `degraded` |
| `GET /api/metrics` | In-process counters + alert hints |

Configure load-balancer health checks on `/api/health/ready` (treat `503` as
unhealthy; `degraded` with Redis down still returns 200 by design so scoring
can continue).

### 6.4 Build & run web

```bash
cd apps/web
# Set NEXT_PUBLIC_* for the public API/WS URLs before build
npm ci
npm run build
npm run start   # or serve `.next` via your platform
```

### 6.5 Multi-instance API

If you run more than one Nest replica:

- Share the same `JWT_SECRET`, webhook secret, and Postgres.
- Redis must be reachable from every instance (presence + Socket.IO adapter).
- Sticky sessions are helpful but not a substitute for the Redis adapter.

### 6.6 Suggested production env sketch

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@db-host:5432/hirance?schema=public
REDIS_HOST=redis-host
REDIS_PORT=6379
API_PORT=3001
CORS_ORIGIN=https://test.amitverma01.dev
JWT_SECRET=<random-40+-chars>
EXTERNAL_JOB_WEBHOOK_SECRET=<random-40+-chars>
EXTERNAL_JOB_WEBHOOK_ENABLED=true
EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS=300
REQUIRE_EXTERNAL_USER_ID_ON_JOIN=true
ADMIN_BOOTSTRAP_TOKEN=   # empty after first admin
# LIVEKIT_* only if screen share is enabled
```

Web (build-time):

```env
NEXT_PUBLIC_API_URL=https://api.test.amitverma01.dev/api
NEXT_PUBLIC_WS_URL=https://api.test.amitverma01.dev
```

Public hosts:

| Role | Host |
|------|------|
| Competition UI | `https://test.amitverma01.dev` |
| Competition API + Socket.IO | `https://api.test.amitverma01.dev` |
| Hirance job server (external) | `https://api.hirance.com` |

Job-server webhook target (configure on Hirance, not in this nginx):

```text
POST https://api.test.amitverma01.dev/api/integrations/job-events
```

### 6.7 Nginx reverse proxy (Docker)

Image and templates live under [`docker/nginx/`](../docker/nginx/).

| Host | Routes |
|------|--------|
| `test.amitverma01.dev` | `/` → Next.js |
| `api.test.amitverma01.dev` | `/api/` → NestJS, `/socket.io/` → Socket.IO |
| both (HTTP `:80`) | ACME webroot + redirect to HTTPS |

`api.hirance.com` is **not** served by this stack — it is the external
job server that calls our API webhook.

HTTP `:80` redirects to HTTPS. TLS terminates on `:443`.

#### Issue TLS certificate (Let's Encrypt)

DNS for **both** `test.amitverma01.dev` and
`api.test.amitverma01.dev` must point at this host. Port **80** must be
free for the first issue (standalone). One SAN certificate covers both.

```bash
# EC2 Ubuntu (default)
npm run ssl:cert

# Staging CA (safe while testing rate limits)
npm run ssl:cert:staging

# Renew while nginx is already up (ACME webroot) + reload
npm run ssl:renew
```

Defaults: domains `test.amitverma01.dev,api.test.amitverma01.dev`,
email `amitz.airation@gmail.com`. Override with `DOMAINS` / `EMAIL`
or flags `--domains` / `--email`.

Certs are written to:

- `docker/nginx/certs/fullchain.pem`
- `docker/nginx/certs/privkey.pem`

(Let’s Encrypt account data stays under `docker/nginx/certbot/` — not
committed.)

#### Start the edge

```bash
npm run edge:up          # requires certs already on disk
npm run edge:up:cert     # issue/renew certs, then up
npm run edge:down
```

Equivalent:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

If API/web run as Compose services named `api` / `web` on a shared
network, set `API_UPSTREAM=api:3001` and `WEB_UPSTREAM=web:3000`.

Env vars substituted at container start (`envsubst`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_UPSTREAM` | `host.docker.internal:3001` | Nest listen host:port |
| `WEB_UPSTREAM` | `host.docker.internal:3000` | Next listen host:port |
| `UI_SERVER_NAME` | `test.amitverma01.dev` | UI `server_name` |
| `API_SERVER_NAME` | `api.test.amitverma01.dev` | API `server_name` |

### 6.8 Deploy on EC2 Ubuntu

Assumes one Ubuntu EC2 instance (or similar) with Elastic IP, API on
host `:3001`, web on host `:3000`, nginx in Docker.

1. **Security group** — inbound TCP `22` (your IP), `80`, `443`.
2. **DNS** — `test.amitverma01.dev` and `api.test.amitverma01.dev` → EIP.
3. **Bootstrap Docker** (once):

```bash
sudo bash scripts/ec2-bootstrap.sh
# log out/in so docker group applies
```

4. **App env** — production `apps/api/.env` and `apps/web/.env.local`:

```env
CORS_ORIGIN=https://test.amitverma01.dev
NEXT_PUBLIC_API_URL=https://api.test.amitverma01.dev/api
NEXT_PUBLIC_WS_URL=https://api.test.amitverma01.dev
```

5. **Start API + web** on the host (`npm run start:prod` / `npm run start`
   under process manager), then:

```bash
npm run ssl:cert
npm run edge:up
```

Or combined: `npm run edge:up:cert`.

6. **TLS renew cron** (example, monthly):

```cron
0 3 1 * * cd /home/ubuntu/compettion && npm run ssl:renew >> /var/log/hirance-ssl-renew.log 2>&1
```

Scripts (bash, EC2-oriented):

| Script / npm | Purpose |
|--------------|---------|
| `npm run ec2:bootstrap` | Install Docker + open ufw 80/443 |
| `npm run ssl:cert` | Let's Encrypt SAN issue (standalone) |
| `npm run ssl:renew` | Webroot renew + nginx reload |
| `npm run edge:up` | `docker compose -f docker-compose.prod.yml up` |
| `npm run edge:up:cert` | Cert then edge up |
| `npm run edge:down` | Stop nginx edge |

Windows note: `scripts/generate-ssl-cert.ps1` remains for local PowerShell;
production npm scripts call the bash versions.

---

## 7. Job server integration

### 7.1 Responsibilities

| Actor | Responsibility |
|-------|----------------|
| Job server | Create/publish/unpublish jobs; call webhook on success |
| Competition API | Attribute publish to a LIVE participant; score; broadcast |
| Competition UI | Show score/rank/leaderboard; link `externalUserId` |

The job server must **never**:

- Send this API’s internal `User.id`
- Trust client-side scores or timers
- Call competition JWT endpoints for scoring

### 7.2 Identity linking

1. Job server has its own user id (string), e.g. `hirance-user-123`.
2. On competition register/join, store it as `User.externalUserId` (unique).
3. Webhook body uses `external_user_id` = that same value.
4. API resolves the user’s single **LIVE** `CompetitionParticipant`.

Linking options:

- Admin: `POST /api/competitions/:id/register` with `externalUserId`
- Participant: join UI field / `POST /api/competitions/:id/join` with `externalUserId`

Set `REQUIRE_EXTERNAL_USER_ID_ON_JOIN=true` in production so unscored
participants cannot silently join without a link.

### 7.3 Endpoint

Configure the Hirance job server (`https://api.hirance.com`) to POST to
the competition API host:

```http
POST https://api.test.amitverma01.dev/api/integrations/job-events
Content-Type: application/json
x-hirance-timestamp: <unix-seconds>
x-hirance-signature: <hex>   # or sha256=<hex>
```

Path form (same route behind any public base URL):

```http
POST /api/integrations/job-events
Content-Type: application/json
x-hirance-timestamp: <unix-seconds>
x-hirance-signature: <hex>   # or sha256=<hex>
```

No JWT. Requires `EXTERNAL_JOB_WEBHOOK_ENABLED=true` and a configured secret.

### 7.4 Signature algorithm

```text
payload   = `${x-hirance-timestamp}.${rawBodyUtf8}`
signature = HMAC_SHA256_HEX(EXTERNAL_JOB_WEBHOOK_SECRET, payload)
```

Rules:

- Sign the **exact raw body bytes** as received (same JSON string you POST).
- Timestamp must be within `EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS` of server time.
- Prefer constant-time compare on the job-server side when verifying responses
  is not required; this API verifies inbound signatures that way.

#### Pseudocode (Node)

```js
import { createHmac } from 'node:crypto';

function sign(secret, timestampSeconds, rawBody) {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
}

async function notifyPublished({ secret, baseUrl, event }) {
  const rawBody = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(`${baseUrl}/api/integrations/job-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hirance-timestamp': ts,
      'x-hirance-signature': sign(secret, ts, rawBody),
    },
    body: rawBody,
  });
  return res.json();
}
```

### 7.5 Event payloads

#### `JOB_PUBLISHED`

```json
{
  "event_id": "11111111-1111-1111-1111-111111111111",
  "event": "JOB_PUBLISHED",
  "external_user_id": "hirance-user-123",
  "external_job_id": "hirance-job-987",
  "published_at": "2026-09-14T10:21:32.412Z",
  "job": {
    "title": "Backend Engineer",
    "description": "…",
    "location": "Remote",
    "employment_type": "FULL_TIME"
  }
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `event_id` | yes | UUID; stored in audit metadata (not the dedup key) |
| `event` | yes | `JOB_PUBLISHED` or `JOB_UNPUBLISHED` |
| `external_user_id` | yes | Job-server user id |
| `external_job_id` | yes | Stable unique job id on job server; **idempotency key** |
| `published_at` | no | Audit only; eligibility uses receive time vs `end_at` |
| `job.*` | for publish | Validated like competition job fields |

#### `JOB_UNPUBLISHED`

Same envelope with `"event": "JOB_UNPUBLISHED"`. Reverses the score ledger
(floor 0) and archives the mirrored job. Rejected if competition is
`FINALIZED`.

### 7.6 Resolution & scoring rules

On `JOB_PUBLISHED`:

1. Find `User` where `externalUserId = external_user_id`.
2. Find that user’s currently `LIVE` participation.
   - 0 → not scored (`no_live_competition`)
   - &gt;1 → HTTP `409` (`multiple_live_competitions`)
3. Competition must be `LIVE` and receive-time must be before `end_at`.
4. Upsert mirrored `Job` with `source = EXTERNAL`, `externalJobId` unique.
5. Insert `CompetitionJobScore` (unique on `jobId`) and `finalScore += 1`.
6. After commit, emit Socket.IO score/leaderboard events.

**Retries:** same `external_job_id` scores at most once
(`already_scored` / `scored: false`).

### 7.7 Response shape

```json
{
  "scored": true,
  "my_score": 12,
  "competition_id": "uuid",
  "reason": null,
  "job_id": "uuid"
}
```

Common `reason` values:

| reason | Meaning |
|--------|---------|
| `unknown_external_user` | No `User.externalUserId` match |
| `no_live_competition` | User not in a LIVE competition |
| `already_scored` | Idempotent retry |
| `competition_ended` | Past `end_at` / not eligible |
| `competition_not_live` | Status gate |
| `competition_finalized` | Unpublish blocked |
| `publish_rejected` | Validation / participant rules |

Treat HTTP `2xx` with `scored: false` as a handled business outcome (do not
infinite-retry unless you fix identity/competition state). Retry on `5xx` /
network errors with the **same** `external_job_id`.

### 7.8 When the job server should call

| Job-server event | Webhook |
|------------------|---------|
| Job successfully published | `JOB_PUBLISHED` |
| Job unpublished / deleted / taken down | `JOB_UNPUBLISHED` |
| Draft saved | **Do not call** |
| Validation failure | **Do not call** |

### 7.9 Network & security checklist (job server)

- [ ] Store `EXTERNAL_JOB_WEBHOOK_SECRET` only in job-server secrets manager
- [ ] POST only to HTTPS competition API URL
  (`https://api.test.amitverma01.dev/api/integrations/job-events`)
- [ ] Sign raw body; do not re-serialize after signing
- [ ] Use NTP-synced clocks (skew window defaults to 5 minutes)
- [ ] Idempotent retries with stable `external_job_id`
- [ ] Never embed competition JWT in webhook calls
- [ ] Log competition `reason` for support without logging the secret
- [ ] Confirm `api.hirance.com` can reach `api.test.amitverma01.dev`
  (firewall / allowlist if needed)

---

## 8. Competition operator runbook

1. Provision admin (`/api/auth/admins` once, then JWT).
2. `POST /api/competitions` (admin).
3. `POST /api/competitions/:id/schedule` then `/start` (or schedule automation).
4. Register participants with `externalUserId`, or allow open join + UI link.
5. Confirm job server can reach `/api/integrations/job-events`.
6. During LIVE: monitor `/api/metrics` and structured logs
   (`external_job_ingested`, `score_updated`, `realtime_score_broadcast_failed`).
7. `POST .../end` then `/finalize` when finished.

Participant UI: `/competition/<id>`  
Observer / TV: `/competition/<id>/live`

---

## 9. Observability & alerts

| Signal | Source | Suggest alert when |
|--------|--------|--------------------|
| API down | `/api/health/ready` → 503 | Postgres unreachable |
| Redis down | ready `degraded` | Presence/session features impaired |
| Publish failures | `/api/metrics` → `alerts.publish_failure_rate_high` | Elevated ingest validation failures |
| Realtime gaps | `alerts.realtime_emit_failures` | Clients missing live updates (scores still in DB) |
| Webhook auth | logs `401` on job-events | Secret mismatch / clock skew |

There is no Datadog agent in-repo — scrape `/api/metrics` or ship Nest JSON
logs to your platform.

---

## 10. Rollback & kill switches

| Switch | Effect |
|--------|--------|
| `EXTERNAL_JOB_WEBHOOK_ENABLED=false` | Ingest returns `503`; scores freeze at last committed values |
| Scale API to 0 | Stops HTTP/WS; Postgres scores remain authoritative |
| End competition | New publishes stop scoring after `end_at` / status gates |

Redeploy previous API image + re-run is usually enough; avoid reversing
migrations unless coordinated.

---

## 11. Smoke after deploy

1. `GET /api/health/ready` → ok  
2. Admin login + create short open-join competition + start  
3. Join participant with a test `externalUserId`  
4. Job server (or signed curl) sends `JOB_PUBLISHED`  
5. Confirm `scored: true` and UI/leaderboard update  
6. Replay same `external_job_id` → `already_scored`  
7. Confirm `POST /api/jobs` is **404**

Local equivalent: [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) +  
`npm run smoke:realtime -w api`.

---

## 12. Related docs

| Doc | Contents |
|-----|----------|
| [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) | Local PowerShell webhook + UI test |
| [`../docker/nginx/`](../docker/nginx/) | Nginx Docker image + proxy templates |
| [`../details.md`](../details.md) | Product + technical source of truth |
| [`../context/architecture.md`](../context/architecture.md) | Boundaries & invariants |
| [`../context/progress-tracker.md`](../context/progress-tracker.md) | Phase status |
| [`../.env.example`](../.env.example) | Env template |
