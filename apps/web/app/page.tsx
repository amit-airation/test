'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCurrentCompetition } from '@/lib/competition/api';

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const competition = await fetchCurrentCompetition();
        if (!cancelled) {
          router.replace(`/competition/${competition.id}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No competition is available yet. Ask the admin to create one.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 font-sans">
      <main className="w-full max-w-xl rounded-2xl border border-border bg-surface p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-primary-accent">
          Hirance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Live Job Creation Competition
        </h1>
        {error ? (
          <p className="mt-4 text-base leading-7 text-live-danger" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-base leading-7 text-muted-text">
            Opening the competition…
          </p>
        )}
      </main>
    </div>
  );
}
