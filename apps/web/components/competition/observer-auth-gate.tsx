'use client';

import { FormEvent, useEffect, useState } from 'react';
import { fetchCompetitionSnapshot, login } from '@/lib/competition/api';
import {
  clearSession,
  getAccessToken,
  getSessionUser,
  setSession,
  type SessionUser,
} from '@/lib/competition/session';

type ObserverAuthGateProps = {
  competitionId: string;
  onReady: (session: { token: string; user: SessionUser }) => void;
};

export function ObserverAuthGate({
  competitionId,
  onReady,
}: ObserverAuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    const user = getSessionUser();

    if (!token || !user) {
      const timeout = window.setTimeout(() => setCheckingSession(false), 0);
      return () => window.clearTimeout(timeout);
    }

    void fetchCompetitionSnapshot(competitionId, token)
      .then(() => onReady({ token, user }))
      .catch(() => {
        clearSession();
        setCheckingSession(false);
      });
  }, [competitionId, onReady]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await login(email, password);
      await fetchCompetitionSnapshot(competitionId, result.access_token);
      setSession(result.access_token, result.user);
      onReady({ token: result.access_token, user: result.user });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-text" role="status">
          Restoring observer session…
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary-accent">
          Hirance live
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Observer sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-text">
          Authenticate to open the live competition display. This does not join
          you as a participant.
        </p>

        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm text-muted-text">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary-accent"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm text-muted-text">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary-accent"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? (
            <p className="text-sm text-live-danger" role="alert">
              Unable to open this competition. Check your credentials and
              access.
            </p>
          ) : null}

          <button
            className="w-full rounded-xl bg-primary-accent px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Opening display…' : 'Open live display'}
          </button>
        </form>
      </section>
    </main>
  );
}
