import type { LeaderboardEntry, TimerSnapshot } from './types';
import { getAdminKey } from './admin-session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const EVENT_KEY =
  process.env.NEXT_PUBLIC_EVENT_KEY ?? '';

async function parseError(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const json = JSON.parse(body) as { message?: string | string[] };
    if (Array.isArray(json.message)) return json.message.join(', ');
    if (typeof json.message === 'string') return json.message;
  } catch {
    /* raw */
  }
  return body || `Request failed: ${response.status}`;
}

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
    throw new Error(await parseError(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const adminKey = getAdminKey();
  if (!adminKey) {
    throw new Error('Admin key required. Unlock /admin first.');
  }

  const { headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
      ...(headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Probe admin key without storing — used by the unlock gate. */
export async function probeAdminKey(adminKey: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/competitions`, {
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
  });
  return response.ok;
}

// ─── Competition (event key) ─────────────────────────────────────────────────

export function fetchCurrentCompetition() {
  return apiFetch<{
    id: string;
    name: string;
    status: string;
    activeRoundId: string | null;
    joinPinSet?: boolean;
    rounds: Array<{
      id: string;
      roundNumber: number;
      name: string | null;
      status: string;
      durationSeconds: number;
      actualStartAt: string | null;
      endAt: string | null;
      winnerCompanyId?: string | null;
      _count?: { participants: number };
    }>;
  }>('/competitions/current');
}

export function fetchCompetitionSnapshot(competitionId: string) {
  return apiFetch<{
    id: string;
    name: string;
    status: string;
    activeRoundId: string | null;
    joinPinSet?: boolean;
    rounds: Array<{
      id: string;
      roundNumber: number;
      name: string | null;
      status: string;
      durationSeconds: number;
      actualStartAt: string | null;
      endAt: string | null;
      winnerCompanyId?: string | null;
      _count?: { participants: number };
    }>;
  }>(`/competitions/${competitionId}`);
}

// ─── Rounds (event key) ──────────────────────────────────────────────────────

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
      mobile?: string;
      last_scored_at: string | null;
    };
  }>(
    `/competitions/${competitionId}/rounds/${roundId}/me?company_id=${encodeURIComponent(companyId)}`,
  );
}

export function joinRound(
  competitionId: string,
  roundId: string,
  body: { mobile: string; password: string },
) {
  return apiFetch<{
    id: string;
    companyId: string;
    companyName: string;
    mobile: string;
    status: string;
  }>(`/competitions/${competitionId}/rounds/${roundId}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
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

// ─── Admin APIs ──────────────────────────────────────────────────────────────

export type AdminCompetitionListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  activeRoundId: string | null;
  joinPinSet: boolean;
  roundCount: number;
  createdAt: string;
  updatedAt: string;
};

export function adminListCompetitions() {
  return adminFetch<AdminCompetitionListItem[]>('/competitions');
}

export function adminCreateCompetition(body: {
  name: string;
  description?: string;
}) {
  return adminFetch<{
    id: string;
    name: string;
    status: string;
    joinPinSet: boolean;
  }>('/competitions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function adminGetCompetition(competitionId: string) {
  // Detail read uses event key (same snapshot participants use).
  return fetchCompetitionSnapshot(competitionId);
}

export function adminCancelCompetition(competitionId: string) {
  return adminFetch(`/competitions/${competitionId}/cancel`, {
    method: 'POST',
  });
}

export function adminSetActiveRound(
  competitionId: string,
  roundId: string | null,
) {
  return adminFetch(`/competitions/${competitionId}/active-round`, {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export function adminUpdateJoinPin(competitionId: string, password: string) {
  return adminFetch<{ ok: boolean; joinPinSet: boolean }>(
    `/competitions/${competitionId}/join-pin`,
    {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    },
  );
}

export function adminListEvents(
  competitionId: string,
  params?: { eventType?: string; limit?: number; offset?: number },
) {
  const q = new URLSearchParams();
  if (params?.eventType) q.set('eventType', params.eventType);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  return adminFetch<{
    total: number;
    events: Array<{
      id: string;
      eventType: string;
      roundId: string | null;
      createdAt: string;
      metadata: unknown;
      participant: {
        id: string;
        companyId: string;
        companyName: string;
        mobile: string;
      } | null;
    }>;
  }>(`/competitions/${competitionId}/events${qs ? `?${qs}` : ''}`);
}

export function adminCreateRound(
  competitionId: string,
  body: { roundNumber: number; name?: string; durationSeconds?: number },
) {
  return adminFetch<{ id: string; roundNumber: number; status: string }>(
    `/competitions/${competitionId}/rounds`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function adminScheduleRound(
  competitionId: string,
  roundId: string,
  scheduledStartAt: string,
) {
  return adminFetch(
    `/competitions/${competitionId}/rounds/${roundId}/schedule`,
    {
      method: 'POST',
      body: JSON.stringify({ scheduledStartAt }),
    },
  );
}

export function adminStartRound(competitionId: string, roundId: string) {
  return adminFetch(
    `/competitions/${competitionId}/rounds/${roundId}/start`,
    { method: 'POST' },
  );
}

export function adminEndRound(competitionId: string, roundId: string) {
  return adminFetch(`/competitions/${competitionId}/rounds/${roundId}/end`, {
    method: 'POST',
  });
}

export function adminFinalizeRound(competitionId: string, roundId: string) {
  return adminFetch(
    `/competitions/${competitionId}/rounds/${roundId}/finalize`,
    { method: 'POST' },
  );
}

export function adminCancelRound(competitionId: string, roundId: string) {
  return adminFetch(
    `/competitions/${competitionId}/rounds/${roundId}/cancel`,
    { method: 'POST' },
  );
}

export function adminRegisterParticipants(
  competitionId: string,
  roundId: string,
  participants: Array<{
    companyId: string;
    companyName: string;
    mobile: string;
  }>,
) {
  return adminFetch(
    `/competitions/${competitionId}/rounds/${roundId}/register`,
    {
      method: 'POST',
      body: JSON.stringify({ participants }),
    },
  );
}

export function adminListParticipants(
  competitionId: string,
  roundId: string,
) {
  return apiFetch<
    Array<{
      id: string;
      status: string;
      finalScore: number;
      finalRank: number | null;
      joinedAt: string | null;
      lastScoredAt: string | null;
      scoreReachedAt: string | null;
      company: { id: string; name: string; mobile: string };
    }>
  >(`/competitions/${competitionId}/rounds/${roundId}/participants`);
}

export function adminDisqualify(
  competitionId: string,
  roundId: string,
  participantId: string,
  reason: string,
) {
  return adminFetch(
    `/competitions/${competitionId}/rounds/${roundId}/participants/${participantId}/disqualify`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

export function fetchHealthReady() {
  return fetch(`${API_URL}/health/ready`).then(async (r) => {
    const json = await r.json();
    return { ok: r.ok, ...json };
  });
}

export function fetchMetrics() {
  return fetch(`${API_URL}/metrics`).then(async (r) => {
    if (!r.ok) throw new Error('metrics unavailable');
    return r.json();
  });
}
