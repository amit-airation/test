# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Score + event-time ranking (no target job count).
- Single job-server webhook contract documented.
- LiveKit Cloud for screen share; singleton competition;
  screen-share-only participants; admin console + closed roster.

## Current Goal

- Operate admin UI on staging; run events with mobile
  join; ingest signed job-events; monitor `/api/metrics`.

## Completed

- **Removed target job count**: drop `Competition.targetJobCount`
  and `RoundParticipant.targetReachedAt`. Ranking is
  `finalScore DESC` then `scoreReachedAt ASC` (webhook time).
- **Single webhook**: `POST /api/integrations/job-events`
  with `company_id`, `external_job_id`, `job.title|name`.
- Admin roster: score, time reached, last webhook.
- TV: plain score (+ optional time); no `/N` race chrome.
- Singleton competition, closed roster, Phases 0–8.

## In Progress

- None yet.

## Next Up

- Deploy schema to staging (`prisma migrate deploy` /
  rebuild) including `remove_target_job_count`.
- Wire host monitoring/alerts to `/api/metrics`.
- Run §54 100-participant load against staging.

## Open Questions

- None for admin surface — Next.js `/admin` is the operator UI.

## Architecture Decisions

- One competition; many rounds; winner = most scored jobs;
  ties broken by earlier `scoreReachedAt`.
- One scoring webhook URL for the job server.
- Participant UI is screen-share only (no score chrome).
- Webhook attribution remains `company_id`.

## Session Notes

- Admin: `/admin` — score + time reached from events.
- Job-server guide: [`docs/JOB_SERVER_INTEGRATION.md`](../docs/JOB_SERVER_INTEGRATION.md).
- Local webhook walkthrough: [`docs/LOCAL_TESTING.md`](../docs/LOCAL_TESTING.md).
- Production: [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
