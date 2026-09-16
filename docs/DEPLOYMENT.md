# Production setup — Hirance Live Competition server

Complete guide to deploy and operate the competition
**scoring / leaderboard / realtime** server in staging or
production.

Job-server API + webhook guide: [`JOB_SERVER_INTEGRATION.md`](./JOB_SERVER_INTEGRATION.md).  
Local webhook walkthrough: [`LOCAL_TESTING.md`](./LOCAL_TESTING.md).  
Product rules: [`details.md`](../details.md) §15 / §15.1.

---

## 1. What you are deploying

This monorepo is **not** the Hirance job catalog. It only:

| Owns | Does not own |
|------|----------------|
| Competitions, rounds, server timer | Job create / edit / publish UI |
| Scores, leaderboard, presence | Authoritative job database |
| Socket.IO live updates | User login / JWT accounts |
| HMAC webhook ingest (`company_id`) | Hirance employer accounts |
| LiveKit token minting | Media SFU (LiveKit Cloud; not hosted on this EC2) |

```text
┌──────────────────────────┐  HMAC JOB_PUBLISHED   ┌─────────────────────────────┐
│ Hirance job server       │  company_id + job ───►│ Competition API (Nest)      │
│ (create / publish jobs)  │                       │ /api + Socket.IO            │
└──────────────────────────┘                       └──────────────┬──────────────┘
                                                                  │
                 ┌───────────────────────┐                        │
                 │ Participant + TV UI   │◄── x-event-key + WS ───┤
                 │ (Next.js)             │                        ▼
                 └───────────────────────┘              PostgreSQL + Redis
                                                        LiveKit Cloud (screen)
                                                        Nginx TLS edge (UI+API)
```

**Identity:** company UUID + company name from the main
job server. No `User`, no JWT, no `externalUserId`.

**Scoring window:** receive time in
`[actualStartAt, endAt + 3 seconds]`.

---

## 2. Public hosts (default staging)

| Role | URL |
|------|-----|
| Competition UI | `https://test.amitverma01.dev` |
| API + Socket.IO | `https://api.test.amitverma01.dev` |
| LiveKit (screen share) | LiveKit Cloud `LIVEKIT_PUBLIC_URL` (e.g. `wss://….livekit.cloud`) |
| Job-server webhook target | `POST https://api.test.amitverma01.dev/api/integrations/job-events` |

Override UI/API with `UI_SERVER_NAME` / `API_SERVER_NAME`
and matching DNS. Screen share does **not** use a
`live.*` hostname on this host.

---

## 3. Prerequisites

- Ubuntu EC2 (or similar) with Elastic IP, **or** any host
  that can run Docker Compose
- DNS A/AAAA for UI and API hostnames → EIP
- Docker Engine + Compose plugin (`npm run ec2:bootstrap`)
- Outbound HTTPS from the **job server** to the competition API
- Outbound HTTPS/WSS from browsers and the API to **LiveKit Cloud**
- Shared secrets: `ADMIN_KEY`, `EVENT_ACCESS_KEY`,
  `EXTERNAL_JOB_WEBHOOK_SECRET` (each ≥ 32 chars in production)
- LiveKit Cloud API key + secret in `.env`

Security group / firewall inbound:

| Port | Proto | Purpose |
|------|-------|---------|
| 22 | TCP | SSH (restrict to your IP) |
| 80 | TCP | ACME + HTTP→HTTPS |
| 443 | TCP | HTTPS (UI + API only) |

No EC2 ports 7881/7882 when using LiveKit Cloud.

---

## 4. Authentication model

There is **no** `/api/auth/*` and **no** JWT.

| Client | Credential | Header / mechanism |
|--------|------------|--------------------|
| Admin (create/start rounds) | `ADMIN_KEY` | `x-admin-key` |
| Participant + observer UI / WS | `EVENT_ACCESS_KEY` | `x-event-key` or Socket.IO `auth.eventKey` |
| Hirance job server | `EXTERNAL_JOB_WEBHOOK_SECRET` | HMAC `x-hirance-timestamp` + `x-hirance-signature` |

Web build must embed the event key:

```env
NEXT_PUBLIC_EVENT_KEY=<same as EVENT_ACCESS_KEY>
```

Never put `ADMIN_KEY` or the webhook secret in the browser bundle.

---

## 5. Environment (production)

Copy [`.env.example`](../.env.example) to **repo-root `.env`**
(Compose `env_file` for the API). Generate strong secrets:

```bash
openssl rand -hex 32   # run three times for the three keys
```

### 5.1 Required — API (`.env`)

```env
NODE_ENV=production

# Compose overrides DATABASE_URL / REDIS_* inside the stack;
# keep these for non-Compose runs and tooling.
DATABASE_URL=postgresql://hirance:hirance@postgres:5432/hirance?schema=public
REDIS_HOST=redis
REDIS_PORT=6379

API_PORT=3001
CORS_ORIGIN=https://test.amitverma01.dev

ADMIN_KEY=<random-≥32-chars>
EVENT_ACCESS_KEY=<random-≥32-chars>
EXTERNAL_JOB_WEBHOOK_SECRET=<random-≥32-chars>
EXTERNAL_JOB_WEBHOOK_ENABLED=true
EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS=300

# Rate limits (optional overrides)
THROTTLE_DEFAULT_TTL_MS=60000
THROTTLE_DEFAULT_LIMIT=300
THROTTLE_COMPETITION_TTL_MS=10000
THROTTLE_COMPETITION_LIMIT=120
```

### 5.2 Required — Web (Compose build args / `.env`)

```env
NEXT_PUBLIC_API_URL=https://api.test.amitverma01.dev/api
NEXT_PUBLIC_WS_URL=https://api.test.amitverma01.dev
NEXT_PUBLIC_EVENT_KEY=<same as EVENT_ACCESS_KEY>
```

`NEXT_PUBLIC_*` are baked into the Next.js image at **build**
time. Changing them requires `docker compose up -d --build web`
(or a full rebuild).

### 5.3 LiveKit Cloud screen share (staging + production)

Use the **same LiveKit Cloud project** for staging and
production. Nest mints room tokens; browsers connect to
Cloud directly — nginx does not proxy media.

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_PUBLIC_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=<cloud-api-key>
LIVEKIT_API_SECRET=<cloud-api-secret>
```

Compose passes these into the API container from repo-root
`.env`. Recreate the API after changing them:

```bash
docker compose up -d --force-recreate api
```

The self-hosted Compose `livekit` service is **off by
default** (profile `self-hosted-livekit`). Do not open
7881/7882 or set `LIVEKIT_NODE_IP` when using Cloud.

Weak `devkey`/`secret` values **fail production boot** when
`LIVEKIT_URL` is set.

### 5.4 Production boot rules

With `NODE_ENV=production`, the API **refuses to start** if:

- `EVENT_ACCESS_KEY` missing or &lt; 32 characters
- `ADMIN_KEY` missing or &lt; 32 characters
- `EXTERNAL_JOB_WEBHOOK_SECRET` missing or &lt; 32 characters
- `CORS_ORIGIN` missing or `*`
- LiveKit enabled with weak/dev keys

See [`apps/api/src/config/security.config.ts`](../apps/api/src/config/security.config.ts).

---

## 6. One-command Docker production stack

Everything runs from the repo root via
[`docker-compose.yml`](../docker-compose.yml):

`postgres` · `redis` · `api` · `web` · `nginx` · `certs`

(Screen share: LiveKit Cloud via `.env`. Optional self-hosted
SFU: `docker compose --profile self-hosted-livekit up -d`.)

### 6.1 Bootstrap host (once)

```bash
sudo bash scripts/ec2-bootstrap.sh
# or: npm run ec2:bootstrap
# log out/in so the docker group applies
```

### 6.2 Configure secrets

```bash
cp .env.example .env
# edit .env — set ADMIN_KEY, EVENT_ACCESS_KEY,
# EXTERNAL_JOB_WEBHOOK_SECRET (≥32 each), CORS_ORIGIN,
# NEXT_PUBLIC_*, LIVEKIT_* for production
```

### 6.3 Point DNS

Create records for UI and API hostnames → Elastic IP.
Port **80** must be reachable for Let's Encrypt.
No `live.*` DNS record is required for LiveKit Cloud.

### 6.4 Start stack + TLS

```bash
# Full build + start
docker compose up -d --build
# or: npm run up

# Issue / renew Let's Encrypt SAN cert (nginx must be up)
npm run ssl:cert:webroot
docker exec hirance-nginx nginx -s reload

# One-shot helper:
# npm run edge:up:cert
```

Until a real cert exists, Compose generates a short-lived
self-signed cert so nginx can start.

### 6.5 Verify

```bash
curl -fsS https://api.test.amitverma01.dev/api/health/live
curl -fsS https://api.test.amitverma01.dev/api/health/ready
curl -fsSI https://test.amitverma01.dev | head -n 5
```

| Path | Meaning |
|------|---------|
| `GET /api/health/live` | Process up |
| `GET /api/health/ready` | Postgres required; Redis down → `degraded` (still 200) |
| `GET /api/metrics` | In-process counters (admin/event key may apply depending on route wiring) |

LB health checks: use `/api/health/ready` (treat `503` as unhealthy).

### 6.6 Migrations

API image / start path should run Prisma migrate. To apply
manually against the Compose DB:

```bash
docker compose exec api npx prisma migrate deploy
# or from host with DATABASE_URL pointed at published Postgres
```

Never use `prisma migrate dev` in production.

### 6.7 TLS renew cron

```cron
0 3 1 * * cd /home/ubuntu/compettion && npm run ssl:renew >> /var/log/hirance-ssl-renew.log 2>&1
```

### 6.8 Useful npm scripts

| Script | Purpose |
|--------|---------|
| `npm run ec2:bootstrap` | Install Docker + open ufw 22/80/443 |
| `npm run up` | `docker compose up -d --build` |
| `npm run down` | Stop the stack |
| `npm run ssl:cert` | First-time Let's Encrypt (standalone) |
| `npm run ssl:cert:webroot` | Cert while nginx is up (ACME webroot) |
| `npm run ssl:renew` | Renew + nginx reload |
| `npm run edge:up:cert` | Full stack + cert + reload |

Nginx envsubst defaults:

| Variable | Default |
|----------|---------|
| `UI_SERVER_NAME` | `test.amitverma01.dev` |
| `API_SERVER_NAME` | `api.test.amitverma01.dev` |

---

## 7. Operator runbook (event day)

Admin APIs require `x-admin-key: $ADMIN_KEY`.

### 7.1 Create competition + round

```http
POST /api/competitions
x-admin-key: <ADMIN_KEY>
{ "name": "Live Job Challenge 2026" }

POST /api/competitions/{competitionId}/rounds
x-admin-key: <ADMIN_KEY>
{ "roundNumber": 1, "name": "Round 1", "durationSeconds": 300 }

POST /api/competitions/{competitionId}/active-round
x-admin-key: <ADMIN_KEY>
{ "roundId": "<roundId>" }
```

### 7.2 Roster companies

Pre-register (required — closed roster):

```http
POST /api/competitions/{competitionId}/rounds/{roundId}/register
x-admin-key: <ADMIN_KEY>
{
  "participants": [
    {
      "companyId": "<hirance-company-uuid>",
      "companyName": "Acme Recruiting",
      "mobile": "9876543210"
    }
  ]
}
```

Participants join from the UI / API with **mobile + join PIN**
(default `123456`) and `x-event-key`:

```http
POST /api/competitions/{competitionId}/rounds/{roundId}/join
x-event-key: <EVENT_ACCESS_KEY>
{ "mobile": "9876543210", "password": "123456" }
```

Or use the admin console at `/admin` (paste `ADMIN_KEY`
once per browser tab).

### 7.3 Start / end / finalize

```http
POST .../rounds/{roundId}/schedule   { "scheduledStartAt": "..." }
POST .../rounds/{roundId}/start
POST .../rounds/{roundId}/end
POST .../rounds/{roundId}/finalize
```

Timer authority is the API. Clients display
`time_remaining_seconds` from snapshots / Socket.IO.
Scores after `endAt + 3s` are rejected
(`outside_scoring_window`).

### 7.4 Screens for the room

| Audience | URL |
|----------|-----|
| Admin console | `https://test.amitverma01.dev/admin` |
| Participant (mobile + PIN) | `https://test.amitverma01.dev/competition/<id>` |
| Observer / TV | `https://test.amitverma01.dev/competition/<id>/live` |

Participants enter **mobile + join password** only
(admin must have registered that mobile).

---

## 8. Job-server integration

**Canonical guide for the job-server team:**
[`JOB_SERVER_INTEGRATION.md`](./JOB_SERVER_INTEGRATION.md).

That document covers:

- Admin REST: create the singleton competition, rounds,
  register participants, start / end / finalize
- HMAC webhook: `POST /api/integrations/job-events`
- Signature recipe, payloads, response reasons, checklist

Summary:

| Actor | Responsibility |
|-------|----------------|
| Job server | Lifecycle via `x-admin-key`; score via HMAC on publish |
| Competition API | Match `company_id` → LIVE round; score; broadcast |
| Participant UI | Screen share only after mobile + PIN join |
| TV / admin UI | Leaderboard, timer, remote screens |

Webhook target:

```http
POST https://api.test.amitverma01.dev/api/integrations/job-events
Content-Type: application/json
x-hirance-timestamp: <unix-seconds>
x-hirance-signature: <hex>
```

Requires `EXTERNAL_JOB_WEBHOOK_ENABLED=true`.

---

## 9. Multi-instance API

If you run more than one Nest replica outside Compose:

- Share `ADMIN_KEY`, `EVENT_ACCESS_KEY`, webhook secret, Postgres
- Every instance must reach the same Redis (presence + Socket.IO adapter)
- Sticky sessions help but do not replace the Redis adapter

---

## 10. Observability & kill switches

| Signal | Source | Action |
|--------|--------|--------|
| API down | `/api/health/ready` → 503 | Postgres / process |
| Redis down | ready `degraded` | Presence impaired; scores still in Postgres |
| Publish failures | `/api/metrics`, logs | Check webhook secret, roster, window |
| Realtime gaps | `realtime_emit_failures` | Scores in DB; clients may need reconnect |
| Webhook `401` | Access logs | Secret mismatch / clock skew |

Kill switches:

| Switch | Effect |
|--------|--------|
| `EXTERNAL_JOB_WEBHOOK_ENABLED=false` | Ingest `503`; scores frozen at last commit |
| Scale API to 0 | Stops HTTP/WS; Postgres remains authoritative |
| End + finalize round | Stops scoring; locks ranks |

Redeploy previous API image for rollback. Avoid reversing
migrations unless coordinated.

---

## 11. Smoke after deploy

1. `GET /api/health/ready` → healthy  
2. Admin create competition + round + set active round + start  
3. Admin registers company + mobile; join with mobile / PIN  
4. Signed `JOB_PUBLISHED` with that `company_id` → `scored: true`  
5. Replay same `external_job_id` → `already_scored`  
6. Open `/competition/<id>/live` — leaderboard updates  
7. Confirm `POST /api/jobs` is **404**

Automated (API up, keys set):

```bash
EXTERNAL_JOB_WEBHOOK_SECRET=... ADMIN_KEY=... EVENT_ACCESS_KEY=... \
  npm run smoke:realtime -w api
```

Load:

```bash
EXTERNAL_JOB_WEBHOOK_SECRET=... ADMIN_KEY=... EVENT_ACCESS_KEY=... \
  PARTICIPANTS=100 npm run load:competition -w api
```

---

## 12. Related docs

| Doc | Contents |
|-----|----------|
| [`JOB_SERVER_INTEGRATION.md`](./JOB_SERVER_INTEGRATION.md) | Job-server lifecycle REST + HMAC webhook |
| [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) | Local PowerShell webhook + UI |
| [`../docker/nginx/`](../docker/nginx/) | Nginx image + proxy templates |
| [`../docker-compose.yml`](../docker-compose.yml) | Full stack |
| [`../details.md`](../details.md) | Product + technical source of truth |
| [`../context/architecture.md`](../context/architecture.md) | Boundaries & invariants |
| [`../context/progress-tracker.md`](../context/progress-tracker.md) | Phase status |
| [`../.env.example`](../.env.example) | Env template |
