'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [competitionId, setCompetitionId] = useState('');

  const go = (e: FormEvent, suffix: '' | '/live') => {
    e.preventDefault();
    const id = competitionId.trim();
    if (!id) return;
    router.push(`/competition/${id}${suffix}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 font-sans">
      <main className="w-full max-w-xl rounded-2xl border border-border bg-surface p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
          Hirance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Live Job Creation Competition
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-text">
          Admins create competitions and register companies with a mobile
          number. Participants join with that mobile and the shared PIN.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex rounded-xl bg-primary-accent px-4 py-3 text-sm font-semibold text-white"
          >
            Open admin
          </Link>
        </div>

        <form className="mt-8 space-y-3 border-t border-border pt-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-text">
            Competition ID
          </label>
          <input
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
            placeholder="Paste competition UUID"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm focus:border-primary-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              onClick={(e) => go(e, '')}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Join as participant
            </button>
            <button
              type="button"
              onClick={(e) => go(e, '/live')}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Open TV / live
            </button>
          </div>
        </form>

        <p className="mt-6 text-sm text-muted-text">
          API:{' '}
          <code className="font-mono text-xs">
            {`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/health`}
          </code>
        </p>
      </main>
    </div>
  );
}
