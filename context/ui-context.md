# UI Context

Inspect the existing Hirance Next.js design system first.
Reuse its tokens, typography, buttons, forms, and job
creation components. The tokens below are competition
defaults only when the existing kit does not already
define an equivalent.

## Theme

Live-event product UI: high contrast, large numbers,
unambiguous status. Participant screens stay dense and
operable. Observer / TV screens stay readable from a
distance on 16:9 displays.

Reuse the existing Hirance light/dark theme. Do not
introduce a second design system.

Competition UI must always show a single unambiguous
state: not started, registration, ready, starting, live,
final 60 seconds, ended, finalizing, results, cancelled,
disqualified, disconnected, reconnecting, or screen share
unavailable.

## Colors

Use existing Hirance CSS variables when present. Map
competition meaning onto those tokens.

| Role                 | Meaning                                         |
| -------------------- | ----------------------------------------------- |
| Page background      | Existing app / presentation background          |
| Surface              | Cards, score panel, ranking rows                |
| Primary text         | Names, scores, titles                           |
| Muted text           | “jobs published”, helper copy                   |
| Primary accent       | Create Job, rank highlight, live emphasis       |
| Live / danger        | LIVE badge, final-30s timer                     |
| Success              | Published job check, +1 job feedback            |
| Warning              | Disconnect, reconnecting, time warning          |
| Border               | Existing default border                         |

No hardcoded hex in new competition components if the
Hirance kit already exposes tokens.

## Typography

| Role                         | Guidance                                      |
| ---------------------------- | --------------------------------------------- |
| UI text                      | Existing Hirance sans                         |
| Score / countdown            | Extra-large tabular numerals                  |
| Rank names on TV             | Large, high-contrast, readable at distance    |
| Job titles in recents        | Existing body / label scale                   |

TV / live mode uses much larger type than the participant
dashboard. Keep controls minimal.

## Border Radius

Follow the existing Hirance radius scale for cards,
buttons, badges, and overlays. Do not invent a new
radius system.

## Component Library

Reuse the existing Next.js / Hirance component library
and the existing job creation form.

Do not build a second job form unless the current form
cannot carry competition context.

New competition components stay in
`components/competition/` (or the existing equivalent):

- countdown
- score card
- rank badge
- leaderboard
- recent publications
- observer dashboard / top 3
- live / TV shell
- reconnect / disconnected banners

Live score, rank, timer, and socket subscriptions must be
Client Components. Do not hold Socket.IO connections in
React Server Components.

## Routes

| Route                         | Audience        | Purpose                          |
| ----------------------------- | --------------- | -------------------------------- |
| `/competition/[id]`           | Participant     | Score, timer, create job, recents |
| `/competition/[id]/live`      | Observer / TV   | Presentation leaderboard         |

Follow the existing `app/` or `pages/` convention.

## Layout Patterns

### Participant dashboard

```text
┌─────────────────────────────────────────────┐
│ 🏆 HIRANCE JOB CHALLENGE                    │
│              ⏱ 04:32                       │
│ YOUR SCORE  12                              │
│ Current Rank: #2                            │
│            [ CREATE JOB ]                   │
│ Recent Publications                         │
└─────────────────────────────────────────────┘
```

Must always show: competition active, time remaining,
jobs published, current rank, leaderboard. No manual
refresh required.

### Observer / TV

```text
┌──────────────────────────────────────────────┐
│ 🏆 HIRANCE LIVE JOB CHALLENGE  🔴 LIVE 04:32 │
│ 🥇  🥈  🥉   live ranking   remaining time   │
└──────────────────────────────────────────────┘
```

Requirements:

- large typography
- high contrast
- minimal controls
- WebSocket auto-update
- browser full-screen support
- readable from distance
- 16:9
- no unnecessary admin chrome

Emphasize time remaining, top 3, live job counts, and
live ranking. At the last 30 seconds the timer becomes
visually dominant. At zero show `TIME'S UP`, then
`FINAL RESULTS`.

### Ranking motion

Score change shows `+1 JOB`. Rank change animates row
position (`#3 → #2`). Animation must not break
functionality or accessibility.

## Screen sharing (optional, later)

Grid mode and focus mode. Explicit browser permission.
Clear copy: “Your screen is being shared with competition
observers.” Screen share never determines score.

## Icons

Use the existing Hirance icon set (likely Lucide or the
current kit). Keep LIVE, trophy, and timer treatment
consistent with existing status badges.

## Accessibility

- Timer and score updates must remain readable without
  animation.
- Do not convey rank only by motion or color.
- TV mode still needs sufficient contrast.
- Disconnected / reconnecting states must be announced
  in the participant UI.
