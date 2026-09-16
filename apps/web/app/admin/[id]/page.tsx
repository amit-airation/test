'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminKeyGate } from '@/components/admin/admin-key-gate';
import { AdminConsole } from '@/components/admin/admin-console';
import { getAdminKey } from '@/lib/competition/admin-session';

export default function AdminCompetitionPage() {
  const params = useParams<{ id: string }>();
  const competitionId = params.id;
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnlocked(Boolean(getAdminKey()));
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-text">Loading…</p>
      </div>
    );
  }

  if (!unlocked) {
    return <AdminKeyGate onUnlocked={() => setUnlocked(true)} />;
  }

  if (!competitionId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-live-danger">Missing competition id</p>
      </div>
    );
  }

  return <AdminConsole competitionId={competitionId} />;
}
