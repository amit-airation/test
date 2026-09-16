'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminCreateCompetition,
  adminListCompetitions,
  fetchHealthReady,
  fetchMetrics,
} from '@/lib/competition/api';
import { clearAdminKey } from '@/lib/competition/admin-session';

type AdminHomeProps = {
  onSignOut: () => void;
};

export function AdminHome({ onSignOut }: AdminHomeProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<string>('…');
  const [metricsHint, setMetricsHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await adminListCompetitions();
    if (list.length > 0) {
      router.replace(`/admin/${list[0].id}`);
      return;
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setLoading(false);
    });
    void fetchHealthReady()
      .then((h) => setHealth(String(h.status ?? 'unknown')))
      .catch(() => setHealth('unreachable'));
    void fetchMetrics()
      .then((m) => {
        const scored = m?.scores_committed ?? m?.job_events_scored;
        setMetricsHint(
          scored != null ? `scores_committed≈${scored}` : 'metrics ok',
        );
      })
      .catch(() => setMetricsHint(null));
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    try {
      const created = await adminCreateCompetition({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.replace(`/admin/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
      setBusy(false);
    }
  };

  const signOut = () => {
    clearAdminKey();
    onSignOut();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-text">Opening competition console…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-accent">
              Hirance Admin
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">
              Create competition
            </h1>
            <p className="mt-1 text-sm text-muted-text">
              Only one competition is allowed. Create it once, then manage
              rounds and participants from the console.
            </p>
            <p className="mt-1 text-sm text-muted-text">
              API health:{' '}
              <span className="font-medium text-foreground">{health}</span>
              {metricsHint ? (
                <>
                  {' '}
                  · <span className="font-mono text-xs">{metricsHint}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-muted-text underline"
          >
            Sign out
          </button>
        </header>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted-text">
            Join PIN defaults to <code className="font-mono text-xs">123456</code>.
            Change it on the competition console after create.
          </p>
          <form onSubmit={create} className="mt-4 space-y-3" noValidate>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Competition name"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-primary-accent focus:outline-none"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-primary-accent focus:outline-none"
            />
            {error ? (
              <p className="text-sm text-live-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
