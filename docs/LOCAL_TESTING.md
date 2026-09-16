# Local testing — competition server (webhook scoring)

This API does **not** create jobs. Jobs are published on an
external job server; this service scores via signed webhooks
and shows live leaderboards.

Production / EC2 setup: [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Architecture under test

```text
Participant / TV UI (Next.js :3000)
        │  x-event-key + Socket.IO
        ▼
Competition API (Nest :3001/3006)  ←── HMAC webhook ──  you (job server)
        │
   PostgreSQL + Redis
```

Score path:

```text
POST /api/integrations/job-events  (JOB_PUBLISHED, company_id)
  → match LIVE RoundParticipant by company_id
  → require now ≤ endAt + 3s
  → mirror Job (source=EXTERNAL)
  → RoundJobScore ledger (+1, postDurationSeconds)
  → SCORE_UPDATED / LEADERBOARD_UPDATED over Socket.IO
```

---

## 1. Credentials

### Ports

| Service | Port | Notes |
|---------|------|--------|
| Next.js UI | `3000` | `apps/web` |
| Nest API | `3001` or `3006` | Use `3006` if `3001` is taken |
| PostgreSQL | `5432` | Docker |
| Redis | `6379` | Docker |
| LiveKit (optional) | `7880` | Screen share |

### `apps/api/.env`

```env
DATABASE_URL="postgresql://hirance:hirance@localhost:5432/hirance?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
API_PORT=3006
CORS_ORIGIN=http://localhost:3000
ADMIN_KEY=admin-key-secret-at-least-32-characters!!
EVENT_ACCESS_KEY=event-access-key-secret-32chars!!
EXTERNAL_JOB_WEBHOOK_SECRET=webhook-secret-at-least-32-characters!!
EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS=300
EXTERNAL_JOB_WEBHOOK_ENABLED=true
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3006/api
NEXT_PUBLIC_WS_URL=http://localhost:3006
NEXT_PUBLIC_EVENT_KEY=event-access-key-secret-32chars!!
```

### Access

| Role | Credential |
|------|------------|
| Admin | `x-admin-key: ADMIN_KEY` |
| Participant / observer | `x-event-key` / `NEXT_PUBLIC_EVENT_KEY` |
| Job server | HMAC webhook secret |

Join identity: **closed roster**. Admin registers
`companyId` + `companyName` + `mobile`. Participants
join with **mobile + join PIN** (default `123456`).
No company-id self-join.

### Webhook signing

| Item | Value |
|------|--------|
| URL | `POST http://localhost:3006/api/integrations/job-events` |
| Match key | `company_id` (optional `company_name`) |
| Headers | `x-hirance-timestamp`, `x-hirance-signature` |
| Auth | HMAC only — no JWT |

---

## 2. Start stack

```powershell
cd e:\compettion
docker compose up -d postgres redis

cd e:\compettion\apps\api
npx prisma migrate deploy
npm run start:dev

# new terminal
cd e:\compettion\apps\web
npm run dev
```

### Health

```powershell
Invoke-RestMethod http://localhost:3006/api/health/live
Invoke-RestMethod http://localhost:3006/api/health/ready
```

### Confirm `/api/jobs` is gone

```powershell
try {
  Invoke-WebRequest -Method POST http://localhost:3006/api/jobs -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__   # expect 404
}
```

---

## 3. Create competition + LIVE round (admin UI or API)

### Preferred: Admin UI

1. Open `http://localhost:3000/admin`
2. Paste `ADMIN_KEY` from `apps/api/.env`
3. Create a competition
4. Open it → add a round → Start (or Schedule)
5. Roster: add company ID, name, and mobile
6. Copy participant / TV links

### API (PowerShell)

```powershell
$API = 'http://localhost:3006/api'
$AdminKey = 'admin-key-secret-at-least-32-characters!!'
$EventKey = 'event-access-key-secret-32chars!!'
$AdminHeaders = @{
  'Content-Type' = 'application/json'
  'x-admin-key' = $AdminKey
}
$EventHeaders = @{
  'Content-Type' = 'application/json'
  'x-event-key' = $EventKey
}

$comp = Invoke-RestMethod -Method POST "$API/competitions" `
  -Headers $AdminHeaders `
  -Body (@{ name = 'Local Webhook Test' } | ConvertTo-Json)
$compId = $comp.id

$round = Invoke-RestMethod -Method POST "$API/competitions/$compId/rounds" `
  -Headers $AdminHeaders `
  -Body (@{
    roundNumber = 1
    name = 'Round 1'
    durationSeconds = 300
  } | ConvertTo-Json)
$roundId = $round.id

Invoke-RestMethod -Method POST "$API/competitions/$compId/active-round" `
  -Headers $AdminHeaders `
  -Body (@{ roundId = $roundId } | ConvertTo-Json) | Out-Null

$companyId = [guid]::NewGuid().ToString()
$companyName = 'Demo Company'
$mobile = '9876543210'

Invoke-RestMethod -Method POST "$API/competitions/$compId/rounds/$roundId/register" `
  -Headers $AdminHeaders `
  -Body (@{
    participants = @(
      @{ companyId = $companyId; companyName = $companyName; mobile = $mobile }
    )
  } | ConvertTo-Json -Depth 5) | Out-Null

Invoke-RestMethod -Method POST "$API/competitions/$compId/rounds/$roundId/start" `
  -Headers $AdminHeaders | Out-Null

Write-Host "COMPETITION_ID=$compId"
Write-Host "ROUND_ID=$roundId"
Write-Host "COMPANY_ID=$companyId"
Write-Host "MOBILE=$mobile"
Write-Host "UI   http://localhost:3000/competition/$compId"
Write-Host "LIVE http://localhost:3000/competition/$compId/live"
Write-Host "ADMIN http://localhost:3000/admin/$compId"
```

---

## 4. Participant join (UI)

1. Open `http://localhost:3000/competition/<COMPETITION_ID>`
2. Enter **Mobile** (registered above) + **Join password** (`123456` unless changed)
3. Join

You should see score `0`, rank, timer — **no** create-job form.

---

## 5. Hit the webhook (score +1)

```powershell
$API = 'http://localhost:3006/api'
$WebhookSecret = 'webhook-secret-at-least-32-characters!!'

function Send-JobEvent {
  param([Parameter(Mandatory)] [hashtable] $Payload)
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

$jobId = "job-demo-$(Get-Random)"
Send-JobEvent @{
  event_id = [guid]::NewGuid().ToString()
  event = 'JOB_PUBLISHED'
  company_id = $companyId
  company_name = $companyName
  external_job_id = $jobId
  published_at = (Get-Date).ToUniversalTime().ToString('o')
  job = @{
    title = 'Backend Engineer'
    description = 'Local webhook test job'
    location = 'Remote'
    employment_type = 'FULL_TIME'
  }
}
```

Expected:

```json
{
  "scored": true,
  "my_score": 1,
  "round_id": "<uuid>",
  "job_id": "<uuid>",
  "post_duration_seconds": null
}
```

Replay the same `external_job_id` → `scored: false`, reason `already_scored`.

### UI checks

- Participant score → `1` (live)
- Leaderboard / `/live` updates
- Second publish shows `post_duration_seconds`

### Outside window

After the round ends (+ 3s grace), a new `external_job_id` should
return `scored: false` with `outside_scoring_window`.

---

## 6. Automated smoke / load

```powershell
$env:EXTERNAL_JOB_WEBHOOK_SECRET = 'webhook-secret-at-least-32-characters!!'
$env:ADMIN_KEY = 'admin-key-secret-at-least-32-characters!!'
$env:EVENT_ACCESS_KEY = 'event-access-key-secret-32chars!!'
$env:API_URL = 'http://localhost:3006/api'
$env:WS_URL = 'http://localhost:3006'

npm run smoke:realtime -w api
npm run load:competition -w api
```

---

## 7. Checklist

- [ ] Health live/ready OK
- [ ] `/api/jobs` → 404
- [ ] Admin `/admin` unlock with `ADMIN_KEY`
- [ ] Register with companyId + companyName + mobile
- [ ] Join with mobile + PIN only
- [ ] Webhook scores within LIVE window
- [ ] Duplicate `external_job_id` does not double-count
- [ ] Score rejected after `endAt + 3s`
- [ ] TV page `/live` updates without refresh
- [ ] No JWT / `/auth/*` required

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `401` on webhook | Secret mismatch / clock skew / wrong raw body |
| `no_live_round` | Round not started, or wrong `company_id` |
| `outside_scoring_window` | Past `endAt + 3s` |
| UI cannot call API | `NEXT_PUBLIC_EVENT_KEY` ≠ `EVENT_ACCESS_KEY` |
| Socket unauthorized | Missing `auth.eventKey` / event key |

Production deploy: [`DEPLOYMENT.md`](./DEPLOYMENT.md).
