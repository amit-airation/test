import type { CompetitionMe } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return apiFetch<{
    access_token: string;
    user: { id: string; email: string; name: string; role: string };
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** Public sign-up always creates an employer; admins are provisioned server-side. */
export function register(input: {
  email: string;
  password: string;
  name: string;
}) {
  return apiFetch<{
    access_token: string;
    user: { id: string; email: string; name: string; role: string };
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** HTTP snapshot used after socket reconnect. */
export function fetchCompetitionSnapshot(competitionId: string, token: string) {
  return apiFetch<{
    id: string;
    name: string;
    status: string;
    timer: {
      competition_id: string;
      status: string;
      server_time: string;
      start_at: string | null;
      end_at: string | null;
      duration_seconds: number;
      time_remaining_seconds: number | null;
    };
  }>(`/competitions/${competitionId}`, { token });
}

export function fetchMyCompetitionState(competitionId: string, token: string) {
  return apiFetch<CompetitionMe>(`/competitions/${competitionId}/me`, { token });
}

export function fetchLeaderboard(competitionId: string, token: string) {
  return apiFetch<{
    competition_id: string;
    status: string;
    participants: Array<{
      rank: number;
      user_id: string;
      name: string;
      score: number;
      status?: string;
    }>;
  }>(`/competitions/${competitionId}/leaderboard`, { token });
}

export function joinCompetition(
  competitionId: string,
  token: string,
  companyId?: string,
  externalUserId?: string,
) {
  return apiFetch(`/competitions/${competitionId}/join`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      ...(companyId ? { companyId } : {}),
      ...(externalUserId ? { externalUserId } : {}),
    }),
  });
}

export function listCompanies(token: string) {
  return apiFetch<Array<{ id: string; name: string }>>('/companies', {
    token,
  });
}

export function createCompany(token: string, name: string) {
  return apiFetch<{ id: string; name: string }>('/companies', {
    method: 'POST',
    token,
    body: JSON.stringify({ name }),
  });
}

export function createJob(
  token: string,
  input: {
    title: string;
    description?: string;
    location?: string;
    employmentType?: string;
    companyId: string;
    competitionId: string;
    idempotencyKey?: string;
  },
) {
  return apiFetch<{
    id: string;
    title: string;
    status: string;
    publishedAt: string | null;
  }>('/jobs', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  });
}

export function publishJob(token: string, jobId: string) {
  return apiFetch<{
    job: { id: string; title: string; status: string; publishedAt: string | null };
    scored: boolean;
    my_score: number | null;
    competition_id: string | null;
  }>(`/jobs/${jobId}/publish`, {
    method: 'POST',
    token,
  });
}

export function fetchScreenShareStatus(competitionId: string, token: string) {
  return apiFetch<{ configured: boolean }>(
    `/competitions/${competitionId}/screen-share`,
    { token },
  );
}

export function fetchScreenShareToken(
  competitionId: string,
  token: string,
  intent: 'publish' | 'watch',
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
  }>(`/competitions/${competitionId}/screen-share/token`, {
    method: 'POST',
    token,
    body: JSON.stringify({ intent }),
  });
}
