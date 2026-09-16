import type { LeaderboardEntry, TimerSnapshot } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const EVENT_KEY =
  process.env.NEXT_PUBLIC_EVENT_KEY ?? '';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'x-event-key': EVENT_KEY,
      ...(headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ─── Competition ─────────────────────────────────────────────────────────────

export function fetchCompetitionSnapshot(competitionId: string) {
  return apiFetch<{
    id: string;
    name: string;
    status: string;
    activeRoundId: string | null;
    rounds: Array<{
      id: string;
      roundNumber: number;
      name: string | null;
      status: string;
      durationSeconds: number;
      actualStartAt: string | null;
      endAt: string | null;
    }>;
  }>(`/competitions/${competitionId}`);
}

// ─── Rounds ──────────────────────────────────────────────────────────────────

export function fetchRound(competitionId: string, roundId: string) {
  return apiFetch<{
    id: string;
    competitionId: string;
    roundNumber: number;
    name: string | null;
    status: string;
    durationSeconds: number;
    actualStartAt: string | null;
    endAt: string | null;
    winnerCompanyId: string | null;
  }>(`/competitions/${competitionId}/rounds/${roundId}`);
}

export function fetchRoundLeaderboard(competitionId: string, roundId: string) {
  return apiFetch<{
    round_id: string;
    competition_id: string;
    status: string;
    timer: TimerSnapshot;
    participants: LeaderboardEntry[];
  }>(`/competitions/${competitionId}/rounds/${roundId}/leaderboard`);
}

export function fetchRoundMe(
  competitionId: string,
  roundId: string,
  companyId: string,
) {
  return apiFetch<{
    round_id: string;
    competition_id: string;
    status: string;
    my_score: number;
    my_rank: number | null;
    timer: TimerSnapshot;
    participant: {
      id: string;
      status: string;
      company_id: string;
      company_name: string;
      last_scored_at: string | null;
    };
  }>(
    `/competitions/${competitionId}/rounds/${roundId}/me?company_id=${encodeURIComponent(companyId)}`,
  );
}

export function joinRound(
  competitionId: string,
  roundId: string,
  body: { companyId: string; companyName: string },
) {
  return apiFetch(
    `/competitions/${competitionId}/rounds/${roundId}/join`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function fetchScreenShareStatus(
  competitionId: string,
  roundId: string,
) {
  return apiFetch<{ configured: boolean }>(
    `/competitions/${competitionId}/rounds/${roundId}/screen-share`,
  );
}

export function fetchScreenShareToken(
  competitionId: string,
  roundId: string,
  intent: 'publish' | 'watch',
  companyId?: string,
  companyName?: string,
) {
  return apiFetch<{
    configured: boolean;
    token: string;
    url: string;
    room: string;
    identity: string;
    intent: 'publish' | 'watch';
    can_publish: boolean;
    expires_in_seconds: number;
  }>(`/competitions/${competitionId}/rounds/${roundId}/screen-share/token`, {
    method: 'POST',
    body: JSON.stringify({ intent, companyId, companyName }),
  });
}
