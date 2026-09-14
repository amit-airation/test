# Local testing guide — competition server (webhook scoring)

This API does **not** create jobs. Jobs are published on an external job
server; this service only scores via signed webhooks and shows live
leaderboards.

For a hands-on local webhook walkthrough (PowerShell), see this file.
For staging/production setup and job-server integration, see
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Architecture under test

```text
Participant UI (Next.js :3000)
        │  JWT + Socket.IO
        ▼
Competition API (Nest :3006)  ←── HMAC webhook ──  you (simulating job server)
        │
   PostgreSQL + Redis
```

Score path:

```text
POST /api/integrations/job-events  (JOB_PUBLISHED)
  → mirror Job (source=EXTERNAL)
  → CompetitionJobScore ledger (+1)
  → SCORE_UPDATED / LEADERBOARD_UPDATED over Socket.IO
```

---

## 1. Local data / credentials

### Ports

| Service | Port | Notes |
|---------|------|--------|
| Competition Next.js UI | `3000` | `apps/web` |
| Competition Nest API | `3006` | Use **3006** if another app already owns `3001` |
| PostgreSQL | `5432` | Docker `hirance-postgres` |
| Redis | `6379` | Docker `hirance-redis` |
| LiveKit (optional) | `7880` | Screen share only |

### `apps/api/.env` (local)

```env
DATABASE_URL="postgresql://hirance:hirance@localhost:5432/hirance?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=dev-local-jwt-secret-at-least-32-chars
API_PORT=3006
CORS_ORIGIN=http://localhost:3000
ADMIN_BOOTSTRAP_TOKEN=bootstrap-token-at-least-32-characters!!
EXTERNAL_JOB_WEBHOOK_SECRET=webhook-secret-at-least-32-characters!!
EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS=300
EXTERNAL_JOB_WEBHOOK_ENABLED=true
REQUIRE_EXTERNAL_USER_ID_ON_JOIN=false
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3006/api
NEXT_PUBLIC_WS_URL=http://localhost:3006
```

### Accounts

| Role | Email | Password | Notes |
|------|-------|----------|--------|
| Admin | `admin@hirance.test` | `password123` | Already provisioned in local DB |
| Employer | create via UI or `/auth/register` | `password123` | Link an `externalUserId` on join |

Bootstrap token (`ADMIN_BOOTSTRAP_TOKEN`) only works for the **first** admin.
After that, use admin login.

### Webhook signing

| Item | Value |
|------|--------|
| URL | `POST http://localhost:3006/api/integrations/job-events` |
| Secret | `webhook-secret-at-least-32-characters!!` |
| Timestamp header | `x-hirance-timestamp` (Unix seconds) |
| Signature header | `x-hirance-signature` (HMAC-SHA256 hex of `` `${timestamp}.${rawBody}` ``) |
| Auth | **No JWT** — HMAC only |

---

## 2. Start stack

```powershell
# Repo root
cd e:\compettion
docker compose up -d postgres redis

# API
cd e:\compettion\apps\api
npx prisma migrate deploy
npm run start:dev

# Web (new terminal) — restart after changing .env.local
cd e:\compettion\apps\web
npm run dev
```

### Health checks

```powershell
Invoke-RestMethod http://localhost:3006/api/health/live
Invoke-RestMethod http://localhost:3006/api/health/ready
Invoke-RestMethod http://localhost:3006/api/metrics
```

Expect `status: ok` and postgres/redis `up`.

### Confirm local jobs API is gone

```powershell
try {
  Invoke-WebRequest -Method POST http://localhost:3006/api/jobs -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__   # expect 404
}
```

---

## 3. Create a LIVE competition (admin)

```powershell
$API = 'http://localhost:3006/api'

$admin = Invoke-RestMethod -Method POST "$API/auth/login" `
  -Headers @{ 'Content-Type' = 'application/json' } `
  -Body '{"email":"admin@hirance.test","password":"password123"}'
$adminToken = $admin.access_token

$comp = Invoke-RestMethod -Method POST "$API/competitions" `
  -Headers @{
    Authorization = "Bearer $adminToken"
    'Content-Type' = 'application/json'
  } `
  -Body (@{
    name = "Local Webhook Test"
    durationSeconds = 300
    allowOpenJoin = $true
  } | ConvertTo-Json)

$compId = $comp.id
Write-Host "COMPETITION_ID=$compId"

$startAt = (Get-Date).ToUniversalTime().AddMinutes(5).ToString('o')
Invoke-RestMethod -Method POST "$API/competitions/$compId/schedule" `
  -Headers @{
    Authorization = "Bearer $adminToken"
    'Content-Type' = 'application/json'
  } `
  -Body (@{ scheduledStartAt = $startAt } | ConvertTo-Json) | Out-Null

Invoke-RestMethod -Method POST "$API/competitions/$compId/start" `
  -Headers @{ Authorization = "Bearer $adminToken" } | Out-Null

Write-Host "UI  http://localhost:3000/competition/$compId"
Write-Host "LIVE http://localhost:3000/competition/$compId/live"
```

---

## 4. Participant join (UI)

1. Open `http://localhost:3000/competition/<COMPETITION_ID>`
2. Register or sign in as employer
3. Enter a job-server user id, e.g. `hirance-user-demo-1`
4. Join

You should see:

- Score `0`
- Linked job-server id
- **No** “Create job” form (jobs are external-only)

Optional API join (same idea):

```powershell
$employer = Invoke-RestMethod -Method POST "$API/auth/register" `
  -Headers @{ 'Content-Type' = 'application/json' } `
  -Body (@{
    email = "hr-demo@$(Get-Random).test"
    password = 'password123'
    name = 'Demo HR'
  } | ConvertTo-Json)

$empToken = $employer.access_token
$company = Invoke-RestMethod -Method POST "$API/companies" `
  -Headers @{
    Authorization = "Bearer $empToken"
    'Content-Type' = 'application/json'
  } `
  -Body '{"name":"Demo Company"}'

$ext = 'hirance-user-demo-1'
Invoke-RestMethod -Method POST "$API/competitions/$compId/join" `
  -Headers @{
    Authorization = "Bearer $empToken"
    'Content-Type' = 'application/json'
  } `
  -Body (@{
    companyId = $company.id
    externalUserId = $ext
  } | ConvertTo-Json)
```

---

## 5. Hit the webhook (score +1)

### Helper function (paste once per PowerShell session)

```powershell
$API = 'http://localhost:3006/api'
$WebhookSecret = 'webhook-secret-at-least-32-characters!!'

function Send-JobEvent {
  param(
    [Parameter(Mandatory)] [hashtable] $Payload
  )
  $body = $Payload | ConvertTo-Json -Depth 6 -Compress
  $ts = [int][double]::Parse((Get-Date -UFormat %s))
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($WebhookSecret)
  $sig = (
    $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$ts.$body")) |
      ForEach-Object { $_.ToString('x2') }
  ) -join ''

  Invoke-RestMethod -Method POST "$API/integrations/job-events" `
    -Headers @{
      'Content-Type' = 'application/json'
      'x-hirance-timestamp' = "$ts"
      'x-hirance-signature' = $sig
    } `
    -Body $body
}
```

### Publish event (increments score)

```powershell
$ext = 'hirance-user-demo-1'   # must match linked externalUserId
$jobId = "job-demo-$(Get-Random)"

Send-JobEvent @{
  event_id = [guid]::NewGuid().ToString()
  event = 'JOB_PUBLISHED'
  external_user_id = $ext
  external_job_id = $jobId
  published_at = (Get-Date).ToUniversalTime().ToString('o')
  job = @{
    title = 'Backend Engineer'
    description = 'Local webhook test job description'
    location = 'Remote'
    employment_type = 'FULL_TIME'
  }
}
```

Expected response:

```json
{
  "scored": true,
  "my_score": 1,
  "competition_id": "<uuid>",
  "job_id": "<uuid>"
}
```

### UI checks after webhook

- Participant score → `1` (live, no refresh)
- Leaderboard updates
- Recent publications shows the title
- Observer page `/live` updates

### Second publish (score → 2)

Use a **new** `external_job_id`:

```powershell
Send-JobEvent @{
  event_id = [guid]::NewGuid().ToString()
  event = 'JOB_PUBLISHED'
  external_user_id = $ext
  external_job_id = "job-demo-$(Get-Random)"
  published_at = (Get-Date).ToUniversalTime().ToString('o')
  job = @{
    title = 'Second Job'
    description = 'Another local webhook test job'
    location = 'Remote'
    employment_type = 'FULL_TIME'
  }
}
```

---

## 6. Idempotency (same external job again)

Reuse the **same** `external_job_id` from a previous publish:

```powershell
Send-JobEvent @{
  event_id = [guid]::NewGuid().ToString()   # new event id is fine
  event = 'JOB_PUBLISHED'
  external_user_id = $ext
  external_job_id = $jobId                  # SAME as before
  published_at = (Get-Date).ToUniversalTime().ToString('o')
  job = @{
    title = 'Backend Engineer'
    description = 'Local webhook test job description'
    location = 'Remote'
    employment_type = 'FULL_TIME'
  }
}
```

Expected: `"scored": false`, `"reason": "already_scored"`, score unchanged.

---

## 7. Unpublish (score −1, floor 0)

```powershell
Send-JobEvent @{
  event_id = [guid]::NewGuid().ToString()
  event = 'JOB_UNPUBLISHED'
  external_user_id = $ext
  external_job_id = $jobId
  published_at = (Get-Date).ToUniversalTime().ToString('o')
}
```

Score decreases by 1 (not below 0). Leaderboard updates live.

---

## 8. Negative / config checks

| Case | How | Expect |
|------|-----|--------|
| Bad signature | Change signature to `deadbeef` | `401` |
| Missing headers | Omit `x-hirance-*` | `401` |
| Unknown external user | `external_user_id = "nobody"` | `scored: false`, `unknown_external_user` |
| No LIVE competition | End competition, then webhook | `no_live_competition` / not scored |
| Webhook disabled | `EXTERNAL_JOB_WEBHOOK_ENABLED=false` + restart API | `503` |
| Local `/jobs` | `POST /api/jobs` | `404` |

Bad signature example:

```powershell
$body = '{"event_id":"11111111-1111-1111-1111-111111111111","event":"JOB_PUBLISHED","external_user_id":"x","external_job_id":"y"}'
$ts = [int][double]::Parse((Get-Date -UFormat %s))
try {
  Invoke-WebRequest -Method POST "$API/integrations/job-events" `
    -Headers @{
      'Content-Type' = 'application/json'
      'x-hirance-timestamp' = "$ts"
      'x-hirance-signature' = 'deadbeef'
    } `
    -Body $body -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__   # 401
}
```

---

## 9. Read score / leaderboard via API

```powershell
# After employer login ($empToken) or admin token
Invoke-RestMethod "$API/competitions/$compId/me" `
  -Headers @{ Authorization = "Bearer $empToken" }

Invoke-RestMethod "$API/competitions/$compId/leaderboard" `
  -Headers @{ Authorization = "Bearer $empToken" }
```

---

## 10. One-command smoke script

API must already be running:

```powershell
cd e:\compettion\apps\api
$env:API_URL = 'http://localhost:3006/api'
$env:WS_URL = 'http://localhost:3006'
$env:EXTERNAL_JOB_WEBHOOK_SECRET = 'webhook-secret-at-least-32-characters!!'
$env:ADMIN_EMAIL = 'admin@hirance.test'
$env:ADMIN_PASSWORD = 'password123'
npm run smoke:realtime
```

Expect JSON with `scored: true`, `gotScore: true`, `gotLeaderboard: true`.

Load test (optional):

```powershell
$env:PARTICIPANTS = '20'
$env:OBSERVERS = '5'
$env:PUBLISHES_PER = '2'
npm run load:competition
```

---

## 11. Pass checklist

- [ ] `health/live` and `health/ready` are ok
- [ ] `POST /api/jobs` returns 404
- [ ] Participant UI has no job create form
- [ ] Join with `externalUserId` shows linked id
- [ ] Signed `JOB_PUBLISHED` → score +1 + live UI update
- [ ] Same `external_job_id` → no double count
- [ ] New `external_job_id` → score +1 again
- [ ] Optional: `JOB_UNPUBLISHED` reverses score
- [ ] Bad HMAC → 401

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| UI talks to wrong API / CORS errors | Restart `apps/web` after editing `.env.local`; confirm `NEXT_PUBLIC_*` points to `:3006` |
| `403` on `/auth/admins` | First admin already exists — login as `admin@hirance.test` |
| `External job webhook is not configured` | Set `EXTERNAL_JOB_WEBHOOK_SECRET` in `apps/api/.env` and restart API |
| `unknown_external_user` | Join again with the same `external_user_id` you send in the webhook |
| `no_live_competition` | Competition must be `LIVE` (`/start`) and participant joined |
| Port `3001` is wrong app | Competition API is intentionally on **3006** in local env |
| Socket not updating | Confirm `NEXT_PUBLIC_WS_URL=http://localhost:3006` and competition room joined |

---

## Quick reference — webhook body

```json
{
  "event_id": "uuid",
  "event": "JOB_PUBLISHED",
  "external_user_id": "hirance-user-demo-1",
  "external_job_id": "hirance-job-987",
  "published_at": "2026-09-14T10:21:32.412Z",
  "job": {
    "title": "...",
    "description": "...",
    "location": "...",
    "employment_type": "FULL_TIME"
  }
}
```

Also accepted: `"event": "JOB_UNPUBLISHED"` (omit or ignore job fields as needed).

Canonical product details: `details.md` §15 / §15.1.
