'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  adminCreateCompetition,
  adminListCompetitions,
  fetchHealthReady,
  fetchMetrics,
  type AdminCompetitionListItem,
} from '@/lib/competition/api';
import { clearAdminKey } from '@/lib/competition/admin-session';
import { StatusBadge } from '@/components/competition/status-badge';

type AdminHomeProps = {
  onSignOut: () => void;
};

export function AdminHome({ onSignOut }: AdminHomeProps) {
  const [items, setItems] = useState<AdminCompetitionListItem[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<string>('…');
  const [metricsHint, setMetricsHint] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await adminListCompetitions();
    setItems(list);
  }, []);

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
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
  }, [reload]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    try {
      await adminCreateCompetition({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    clearAdminKey();
    onSignOut();
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-accent">
              Hirance Admin
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">
              Competitions
            </h1>
            <p className="mt-1 text-sm text-muted-text">
              API health: <span className="font-medium text-foreground">{health}</span>
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
          <h2 className="text-lg font-semibold text-foreground">
            Create competition
          </h2>
          <p className="mt-1 text-sm text-muted-text">
            Join PIN defaults to <code className="font-mono text-xs">123456</code>.
            Change it on the competition console.
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

        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">All competitions</h2>
            <button
              type="button"
              onClick={() => void reload()}
              className="text-sm text-primary-accent underline"
            >
              Refresh
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-text">No competitions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {c.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-text">
                      {c.id}
                    </p>
                    <p className="mt-1 text-xs text-muted-text">
                      {c.roundCount} round{c.roundCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.status} />
                    <Link
                      href={`/admin/${c.id}`}
                      className="rounded-lg bg-primary-accent px-3 py-2 text-sm font-semibold text-white"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
