'use client';

import { type FormEvent, useState } from 'react';
import { probeAdminKey } from '@/lib/competition/api';
import { setAdminKey } from '@/lib/competition/admin-session';

type AdminKeyGateProps = {
  onUnlocked: () => void;
};

export function AdminKeyGate({ onUnlocked }: AdminKeyGateProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = key.trim();
    if (trimmed.length < 8) {
      setError('Enter the ADMIN_KEY from the server environment.');
      return;
    }
    setBusy(true);
    try {
      const ok = await probeAdminKey(trimmed);
      if (!ok) {
        setError('Invalid admin key');
        setBusy(false);
        return;
      }
      setAdminKey(trimmed);
      onUnlocked();
    } catch {
      setError('Could not reach the API. Check NEXT_PUBLIC_API_URL.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary-accent">
            Hirance
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">
            Admin unlock
          </h1>
          <p className="mt-2 text-sm text-muted-text">
            Paste the server <code className="font-mono text-xs">ADMIN_KEY</code>.
            It stays in this browser tab only.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-7">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <label
                htmlFor="adminKey"
                className="block text-xs font-semibold uppercase tracking-wide text-muted-text"
              >
                Admin key
              </label>
              <input
                id="adminKey"
                type="password"
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground focus:border-primary-accent focus:outline-none"
              />
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
              {busy ? 'Checking…' : 'Unlock admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
