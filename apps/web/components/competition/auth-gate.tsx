'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createCompany, joinCompetition, listCompanies, login, register } from '@/lib/competition/api';
import {
  clearSession,
  getAccessToken,
  getSessionUser,
  setSession,
  type SessionUser,
} from '@/lib/competition/session';

type AuthGateProps = {
  competitionId: string;
  onReady: (session: {
    token: string;
    user: SessionUser;
    companyId: string | null;
  }) => void;
};

async function ensureCompany(token: string, userName: string) {
  let companies = await listCompanies(token);
  if (companies.length === 0) {
    companies = [await createCompany(token, `${userName}'s Company`)];
  }
  return companies[0]?.id ?? null;
}

export function AuthGate({ competitionId, onReady }: AuthGateProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    const user = getSessionUser();
    if (!token || !user) return;

    void (async () => {
      try {
        const companyId = await ensureCompany(token, user.name);
        await joinCompetition(competitionId, token, companyId ?? undefined);
        onReady({ token, user, companyId });
      } catch (err) {
        setRosterError(
          err instanceof Error ? err.message : 'Unable to join this competition',
        );
      }
    })();
  }, [competitionId, onReady]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'login'
          ? await login(email, password)
          : await register({
              email,
              password,
              name: name || email.split('@')[0],
            });

      setSession(result.access_token, result.user);
      const companyId = await ensureCompany(
        result.access_token,
        result.user.name,
      );

      try {
        await joinCompetition(
          competitionId,
          result.access_token,
          companyId ?? undefined,
        );
      } catch (err) {
        setRosterError(
          err instanceof Error ? err.message : 'Unable to join this competition',
        );
        return;
      }

      onReady({
        token: result.access_token,
        user: result.user,
        companyId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  if (rosterError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-surface p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
            Hirance
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Not on this roster
          </h1>
          <p className="mt-2 text-sm text-muted-text">{rosterError}</p>
          <button
            type="button"
            onClick={() => {
              clearSession();
              setRosterError(null);
            }}
            className="mt-6 w-full rounded-xl bg-primary-accent py-3 text-sm font-semibold text-white"
          >
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
          Hirance
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Join competition
        </h1>
        <p className="mt-2 text-sm text-muted-text">
          Sign in to sync your live score, timer, and job publishing.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' ? (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          ) : null}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-border bg-background px-3 py-2"
          />
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-border bg-background px-3 py-2"
          />
          {error ? (
            <p className="text-sm text-live-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary-accent py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-muted-text underline"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login'
            ? 'Need an account? Register'
            : 'Already registered? Sign in'}
        </button>
      </div>
    </div>
  );
}
