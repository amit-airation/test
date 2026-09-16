'use client';

import { useEffect, useState } from 'react';
import { AdminKeyGate } from '@/components/admin/admin-key-gate';
import { AdminHome } from '@/components/admin/admin-home';
import { getAdminKey } from '@/lib/competition/admin-session';

export default function AdminPage() {
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

  return <AdminHome onSignOut={() => setUnlocked(false)} />;
}
