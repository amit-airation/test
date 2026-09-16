'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { fetchCompetitionSnapshot, fetchRoundMe, joinRound } from '@/lib/competition/api';
import {
  clearIdentity,
  getIdentity,
  setIdentity,
  type SessionIdentity,
} from '@/lib/competition/session';

type JoinGateProps = {
  competitionId: string;
  onReady: (identity: SessionIdentity) => void;
};

export function JoinGate({ competitionId, onReady }: JoinGateProps) {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const saved = getIdentity();
    if (!saved) {
      setRestoring(false);
      return;
    }

    void (async () => {
      try {
        const snapshot = await fetchCompetitionSnapshot(competitionId);
        const roundId = snapshot.activeRoundId;
        if (!roundId) {
          clearIdentity();
          setRestoring(false);
          return;
        }
        await fetchRoundMe(competitionId, roundId, saved.companyId);
        onReady(saved);
      } catch {
        clearIdentity();
        setRestoring(false);
      }
    })();
  }, [competitionId, onReady]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!mobile.trim()) {
      setError('Mobile number is required');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setBusy(true);
    try {
      const snapshot = await fetchCompetitionSnapshot(competitionId);
      const roundId = snapshot.activeRoundId;

      if (!roundId) {
        setError('No active round. Ask the admin to set the active round.');
        setBusy(false);
        return;
      }

      const joined = await joinRound(competitionId, roundId, {
        mobile: mobile.trim(),
        password: password.trim(),
      });

      const identity: SessionIdentity = {
        companyId: joined.companyId,
        companyName: joined.companyName,
        mobile: joined.mobile,
      };

      setIdentity(identity);
      onReady(identity);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not join. Try again.',
      );
      setBusy(false);
    }
  };

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-text">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary-accent">
            Hirance
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">
            Live Challenge
          </h1>
          <p className="mt-2 text-sm text-muted-text">
            Enter the mobile number the admin registered for your company,
            and the join password.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-7">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <label
                htmlFor="mobile"
                className="block text-xs font-semibold uppercase tracking-wide text-muted-text"
              >
                Mobile number
              </label>
              <input
                id="mobile"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10–15 digit mobile"
                inputMode="tel"
                autoComplete="tel"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-text focus:border-primary-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wide text-muted-text"
              >
                Join password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Default 123456"
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-text focus:border-primary-accent focus:outline-none"
              />
              <p className="text-xs text-muted-text">
                Default is <code className="font-mono">123456</code> unless the
                admin changed it.
              </p>
            </div>

            {error ? (
              <p
                className="rounded-lg bg-live-danger/10 px-3 py-2 text-sm text-live-danger"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-primary-accent py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Joining…' : 'Join competition'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
