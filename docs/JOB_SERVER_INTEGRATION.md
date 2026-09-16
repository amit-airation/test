# Job-server integration guide

This document is for the **Hirance job server** team.
It describes how to drive the competition API: create the
single competition, manage rounds and participants, and
score publishes via the HMAC webhook.

Canonical product rules: [`details.md`](../details.md) §15 / §15.1.  
Deploy / env setup: [`DEPLOYMENT.md`](./DEPLOYMENT.md).  
Local PowerShell walkthrough: [`LOCAL_TESTING.md`](./LOCAL_TESTING.md).

---

## 1. Responsibilities

| Actor | Responsibility |
|-------|----------------|
| Job server | Create/start/end rounds (admin REST); register roster; publish/unpublish jobs; POST signed webhook on success |
| Competition API | Match `company_id` → LIVE round participant; score; broadcast Socket.IO |
| Competition admin UI (`/admin`) | Same admin REST as the job server (optional operator console) |
| Participant UI | Mobile + PIN join, then **screen share only** |
| TV / live UI | Observer leaderboard + remote screens |

The job server must **never**:

- Trust client scores or timers
- Put `competition_id` / `round_id` on the scoring webhook
  (attribution is by `company_id` → exactly one LIVE membership)
- Use `EVENT_ACCESS_KEY` for lifecycle or scoring
- Webhook drafts, failed validation, or failed publishes

This API does **not** send outbound webhooks to the job
server. The job server already knows when it starts or ends
a round.

---

## 2. Auth

| Call type | Header(s) | Secret / env |
|-----------|-----------|--------------|
| Lifecycle REST (create, rounds, register, start, end, finalize, PIN) | `x-admin-key` | `ADMIN_KEY` |
| Score ingest | `x-hirance-timestamp` + `x-hirance-signature` | `EXTERNAL_JOB_WEBHOOK_SECRET` |
| Browser / TV only — **do not use on job server** | `x-event-key` | `EVENT_ACCESS_KEY` |

Base URL examples:

| Environment | API base |
|-------------|----------|
| Local | `http://localhost:3001/api` |
| Staging | `https://api.test.amitverma01.dev/api` |

All paths below are relative to that `/api` prefix.

Require `EXTERNAL_JOB_WEBHOOK_ENABLED=true` for scoring.

---

## 3. Product model

- **One competition** for the whole product. Creating a
  second competition returns **409 Conflict**.
- **Many rounds** under that competition
  (`POST .../rounds`).
- **Participants are per round.** Register the roster on
  each round before start. The same company UUID can appear
  in multiple rounds as separate `RoundParticipant` rows.
- Starting a round sets `activeRoundId` and rejects a second
  concurrent `LIVE` round on the same competition.

---

## 4. Operator sequence

### 4.1 Get or create the singleton competition

```http
GET /competitions
x-admin-key: <ADMIN_KEY>
```

Response: array of competitions (0 or 1 in normal operation).

If empty:

```http
POST /competitions
x-admin-key: <ADMIN_KEY>
Content-Type: application/json

{
  "name": "Hirance Live Job Creation",
  "description": "Optional"
}
```

A second `POST /competitions` returns **409**.

Default join PIN is `123456`. Change it with:

```http
PATCH /competitions/:competitionId/join-pin
x-admin-key: <ADMIN_KEY>
Content-Type: application/json

{ "password": "your-shared-pin" }
```

Participants join with **mobile + this PIN** on the web UI.
They never see scores; they only screen-share.

### 4.2 Create a round

```http
POST /competitions/:competitionId/rounds
x-admin-key: <ADMIN_KEY>
Content-Type: application/json

{
  "roundNumber": 1,
  "name": "Opening heat",
  "durationSeconds": 300
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `roundNumber` | yes | Unique per competition; integer ≥ 1 |
| `name` | no | Display label |
| `durationSeconds` | no | Default `300` (5 minutes); min 30, max 3600 |

### 4.3 Register participants for that round

```http
POST /competitions/:competitionId/rounds/:roundId/register
x-admin-key: <ADMIN_KEY>
Content-Type: application/json

{
  "participants": [
    {
      "companyId": "hirance-company-uuid",
      "companyName": "Acme Recruiting",
      "mobile": "9876543210"
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `companyId` | yes | Hirance main-server company UUID — **must** match webhook `company_id` |
| `companyName` | yes | Display name |
| `mobile` | yes | Digits (unique across companies); used for closed-roster join |

Re-registering the same company on the same round is rejected
(conflict). Register **before** start.

### 4.4 Start the round

```http
POST /competitions/:competitionId/rounds/:roundId/start
x-admin-key: <ADMIN_KEY>
```

Effects:

1. Round status → `LIVE`
2. `actualStartAt` / `endAt` set from server clock + `durationSeconds`
3. Competition `activeRoundId` → this round
4. Socket.IO `ROUND_STARTED` + `ACTIVE_ROUND_CHANGED`
5. Scoring window opens: receive time in
   `[actualStartAt, endAt + 3s]`

If another round is already `LIVE`, the API returns **409**.

Optional (usually unnecessary after start):

```http
POST /competitions/:competitionId/active-round
x-admin-key: <ADMIN_KEY>
Content-Type: application/json

{ "roundId": "<uuid>" }
```

### 4.5 Score publishes (HMAC webhook)

On every **successful** job publish on the job server:

```http
POST /integrations/job-events
Content-Type: application/json
x-hirance-timestamp: <unix-seconds>
x-hirance-signature: <hex>   # or sha256=<hex>
```

Do **not** call this for drafts, validation failures, or
failed publishes.

### 4.6 End and finalize

```http
POST /competitions/:competitionId/rounds/:roundId/end
x-admin-key: <ADMIN_KEY>

POST /competitions/:competitionId/rounds/:roundId/finalize
x-admin-key: <ADMIN_KEY>
```

After `endAt + 3s` (or after `end`), new publishes are not
scored. Finalize freezes ranks and winner. Unpublish after
finalize is blocked (`round_finalized`).

---

## 5. HMAC scoring webhook

### 5.1 Signature

```text
payload   = `${x-hirance-timestamp}.${rawBodyUtf8}`
signature = HMAC_SHA256_HEX(EXTERNAL_JOB_WEBHOOK_SECRET, payload)
```

Sign the **exact** raw body bytes you POST. Do not
re-serialize JSON after signing. Timestamp must fall within
`EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS` (default 300).

#### Node.js example

```js
import { createHmac, randomUUID } from 'node:crypto';

function sign(secret, timestampSeconds, rawBody) {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
}

async function notifyPublished({ secret, baseUrl, event }) {
  const rawBody = JSON.stringify(event);
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${baseUrl}/integrations/job-events`, {
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

await notifyPublished({
  secret: process.env.EXTERNAL_JOB_WEBHOOK_SECRET,
  baseUrl: 'https://api.test.amitverma01.dev/api',
  event: {
    event_id: randomUUID(),
    event: 'JOB_PUBLISHED',
    company_id: 'hirance-company-uuid',
    company_name: 'Acme Recruiting',
    external_job_id: 'hirance-job-987',
    published_at: new Date().toISOString(),
    job: {
      title: 'Backend Engineer',
      description: '…',
      location: 'Remote',
      employment_type: 'FULL_TIME',
    },
  },
});
```

### 5.2 `JOB_PUBLISHED` payload

```json
{
  "event_id": "11111111-1111-1111-1111-111111111111",
  "event": "JOB_PUBLISHED",
  "company_id": "hirance-company-uuid",
  "company_name": "Acme Recruiting",
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
| `event_id` | yes | UUID; audit metadata |
| `event` | yes | `JOB_PUBLISHED` or `JOB_UNPUBLISHED` |
| `company_id` | yes | Match key (same UUID as register `companyId`) |
| `company_name` | no | Display refresh only — never used to match |
| `external_job_id` | yes | Idempotency key |
| `published_at` | no | Audit only; eligibility uses **receive time** |
| `job.title` | for publish | Min 3 characters |

### 5.3 `JOB_UNPUBLISHED`

Same envelope with `"event": "JOB_UNPUBLISHED"`. Reverses the
ledger (score floor 0). Blocked if the round is `FINALIZED`.

### 5.4 Resolution rules

On `JOB_PUBLISHED`:

1. Find `RoundParticipant` with `company_id` in a **LIVE** round.
   - 0 matches → `no_live_round` (not scored)
   - &gt;1 matches → `multiple_live_rounds` (not scored)
2. Receive time must be in `[actualStartAt, endAt + 3s]`.
3. Upsert mirrored `Job` (`source = EXTERNAL`, unique
   `externalJobId`).
4. Insert `RoundJobScore` (unique on `jobId`); `finalScore += 1`;
   store `postDurationSeconds` since previous score.
5. After commit, emit Socket.IO score / leaderboard events
   (TV / admin; not shown on participant screen-share UI).

Retries with the same `external_job_id` score at most once
(`already_scored`).

### 5.5 Response

```json
{
  "scored": true,
  "my_score": 12,
  "round_id": "uuid",
  "job_id": "uuid",
  "post_duration_seconds": 14.2,
  "reason": null
}
```

| `reason` | Meaning |
|----------|---------|
| `no_live_round` | Company not in a LIVE round |
| `multiple_live_rounds` | Ambiguous LIVE membership |
| `outside_scoring_window` | After `endAt + 3s` (or before start) |
| `already_scored` | Idempotent retry |
| `publish_rejected` | Validation (e.g. short title) |
| `round_finalized` | Unpublish blocked |
| `job_owner_mismatch` | Unpublish company ≠ job owner |

Treat `2xx` + `scored: false` as a handled business outcome.
Retry `5xx` / network errors with the **same** `external_job_id`.

### 5.6 When to call

| Job-server event | Webhook |
|------------------|---------|
| Job successfully published | `JOB_PUBLISHED` |
| Job unpublished / deleted | `JOB_UNPUBLISHED` |
| Draft saved / validation failed | **Do not call** |

---

## 6. Other useful admin endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/competitions/:id/events` | Audit trail |
| `GET` | `/competitions/:id/rounds` | List rounds (event key; prefer admin list via console) |
| `GET` | `/competitions/:id/rounds/:roundId/participants` | Roster |
| `GET` | `/competitions/:id/rounds/:roundId/leaderboard` | Scores |
| `POST` | `/competitions/:id/rounds/:roundId/cancel` | Cancel round |
| `POST` | `/competitions/:id/rounds/:roundId/participants/:participantId/disqualify` | Disqualify |
| `POST` | `/competitions/:id/cancel` | Cancel competition |

Participant discovery (browser):

```http
GET /competitions/current
x-event-key: <EVENT_ACCESS_KEY>
```

Returns the singleton competition or **404**.

---

## 7. Checklist

- [ ] Store `ADMIN_KEY` and `EXTERNAL_JOB_WEBHOOK_SECRET` only
      in the job-server secrets manager
- [ ] Create at most one competition; reuse it for all rounds
- [ ] Register each round’s roster with the same `companyId`
      UUIDs you will send on webhooks
- [ ] Start at most one LIVE round at a time
- [ ] HTTPS webhook URL only in staging/production
- [ ] Sign the exact raw body; do not re-serialize after signing
- [ ] NTP-synced clocks on the job server
- [ ] Stable `external_job_id` across retries
- [ ] Never put JWT / admin / event keys on the webhook
- [ ] Confirm network path job-server → competition API
- [ ] Do not webhook drafts or failed publishes

---

## 8. Curl smoke test (lifecycle + one score)

Replace secrets and IDs.

```bash
BASE=https://api.test.amitverma01.dev/api
ADMIN=your-admin-key-at-least-32-chars!!!!
SECRET=your-webhook-secret-at-least-32-chars!

# 1) Create competition (skip if one already exists)
curl -sS -X POST "$BASE/competitions" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN" \
  -d '{"name":"Hirance Live"}'

# 2) Create round (set COMPETITION_ID from step 1)
curl -sS -X POST "$BASE/competitions/$COMPETITION_ID/rounds" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN" \
  -d '{"roundNumber":1,"durationSeconds":300}'

# 3) Register
curl -sS -X POST "$BASE/competitions/$COMPETITION_ID/rounds/$ROUND_ID/register" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN" \
  -d '{"participants":[{"companyId":"company-uuid","companyName":"Acme","mobile":"9876543210"}]}'

# 4) Start
curl -sS -X POST "$BASE/competitions/$COMPETITION_ID/rounds/$ROUND_ID/start" \
  -H "x-admin-key: $ADMIN"
```

Then POST a signed `JOB_PUBLISHED` (see Node sample in §5.1).
