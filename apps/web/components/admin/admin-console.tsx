'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  adminCancelCompetition,
  adminCancelRound,
  adminCreateRound,
  adminDisqualify,
  adminEndRound,
  adminFinalizeRound,
  adminGetCompetition,
  adminListEvents,
  adminListParticipants,
  adminRegisterParticipants,
  adminScheduleRound,
  adminSetActiveRound,
  adminStartRound,
  adminUpdateJoinPin,
} from '@/lib/competition/api';
import { StatusBadge } from '@/components/competition/status-badge';

type RoundRow = {
  id: string;
  roundNumber: number;
  name: string | null;
  status: string;
  durationSeconds: number;
  actualStartAt: string | null;
  endAt: string | null;
  winnerCompanyId?: string | null;
  _count?: { participants: number };
};

type ParticipantRow = {
  id: string;
  status: string;
  finalScore: number;
  finalRank: number | null;
  joinedAt: string | null;
  company: { id: string; name: string; mobile: string };
};

type EventRow = {
  id: string;
  eventType: string;
  roundId: string | null;
  createdAt: string;
  participant: {
    id: string;
    companyId: string;
    companyName: string;
    mobile: string;
  } | null;
};

type AdminConsoleProps = {
  competitionId: string;
};

export function AdminConsole({ competitionId }: AdminConsoleProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [joinPinSet, setJoinPinSet] = useState(false);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [roundNumber, setRoundNumber] = useState('1');
  const [roundName, setRoundName] = useState('Round 1');
  const [durationSeconds, setDurationSeconds] = useState('300');
  const [scheduleAt, setScheduleAt] = useState('');

  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');

  const [joinPin, setJoinPin] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';

  const selectedRound =
    rounds.find((r) => r.id === selectedRoundId) ?? rounds[0] ?? null;

  const reload = useCallback(async () => {
    const snap = await adminGetCompetition(competitionId);
    setName(snap.name);
    setStatus(snap.status);
    setActiveRoundId(snap.activeRoundId);
    setJoinPinSet(Boolean(snap.joinPinSet));
    const nextRounds = (snap.rounds ?? []) as RoundRow[];
    setRounds(nextRounds);
    setSelectedRoundId((prev) => {
      if (prev && nextRounds.some((r) => r.id === prev)) return prev;
      return snap.activeRoundId ?? nextRounds[0]?.id ?? null;
    });
  }, [competitionId]);

  const reloadParticipants = useCallback(async (roundId: string) => {
    const rows = await adminListParticipants(competitionId, roundId);
    setParticipants(rows);
  }, [competitionId]);

  const reloadEvents = useCallback(async () => {
    const res = await adminListEvents(competitionId, {
      eventType: eventFilter || undefined,
      limit: 80,
    });
    setEvents(res.events);
  }, [competitionId, eventFilter]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load'),
    );
  }, [reload]);

  useEffect(() => {
    if (!selectedRoundId) {
      setParticipants([]);
      return;
    }
    void reloadParticipants(selectedRoundId).catch(() => undefined);
  }, [selectedRoundId, reloadParticipants]);

  useEffect(() => {
    void reloadEvents().catch(() => undefined);
  }, [reloadEvents]);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await reload();
      if (selectedRoundId) await reloadParticipants(selectedRoundId);
      await reloadEvents();
      if (success) setMessage(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const createRound = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const round = await adminCreateRound(competitionId, {
        roundNumber: Number(roundNumber),
        name: roundName.trim() || undefined,
        durationSeconds: Number(durationSeconds) || 300,
      });
      if (!activeRoundId) {
        await adminSetActiveRound(competitionId, round.id);
      }
      setSelectedRoundId(round.id);
    }, 'Round created');
  };

  const registerOne = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRoundId) {
      setError('Select a round first');
      return;
    }
    await run(async () => {
      await adminRegisterParticipants(competitionId, selectedRoundId, [
        {
          companyId: companyId.trim(),
          companyName: companyName.trim(),
          mobile: mobile.trim(),
        },
      ]);
      setCompanyId('');
      setCompanyName('');
      setMobile('');
    }, 'Participant registered');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied');
    } catch {
      setMessage(text);
    }
  };

  const confirmRun = async (
    label: string,
    fn: () => Promise<unknown>,
    success: string,
  ) => {
    if (!window.confirm(label)) return;
    await run(fn, success);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-primary-accent underline">
              ← All competitions
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">
              {name || 'Competition'}
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-text">
              {competitionId}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <span className="text-xs text-muted-text">
                Join PIN {joinPinSet ? 'set' : 'missing'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() =>
                void copy(`${origin}/competition/${competitionId}`)
              }
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Copy participant link
            </button>
            <button
              type="button"
              onClick={() =>
                void copy(`${origin}/competition/${competitionId}/live`)
              }
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Copy TV link
            </button>
            <Link
              href={`/competition/${competitionId}/live`}
              target="_blank"
              className="text-sm text-primary-accent underline"
            >
              Open TV
            </Link>
          </div>
        </header>

        {error ? (
          <p className="rounded-xl bg-live-danger/10 px-4 py-3 text-sm text-live-danger" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success" role="status">
            {message}
          </p>
        ) : null}

        {/* Join PIN */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Join PIN</h2>
          <p className="mt-1 text-sm text-muted-text">
            Shared password for all participants (default 123456). Never shown again after save.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!joinPin.trim()) return;
              void run(
                () => adminUpdateJoinPin(competitionId, joinPin.trim()),
                'Join PIN updated',
              ).then(() => setJoinPin(''));
            }}
          >
            <input
              type="password"
              value={joinPin}
              onChange={(e) => setJoinPin(e.target.value)}
              placeholder="New PIN (min 4)"
              className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-4 py-2.5"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Set PIN
            </button>
          </form>
        </section>

        {/* Rounds */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Rounds</h2>
          <form onSubmit={createRound} className="mt-3 grid gap-2 sm:grid-cols-4">
            <input
              value={roundNumber}
              onChange={(e) => setRoundNumber(e.target.value)}
              placeholder="Number"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
            <input
              value={roundName}
              onChange={(e) => setRoundName(e.target.value)}
              placeholder="Name"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
            <input
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder="Duration (s)"
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add round
            </button>
          </form>

          <ul className="mt-4 space-y-3">
            {rounds.map((r) => {
              const isActive = r.id === activeRoundId;
              const isSelected = r.id === selectedRoundId;
              return (
                <li
                  key={r.id}
                  className={`rounded-xl border p-4 ${
                    isSelected
                      ? 'border-primary-accent bg-primary-accent/5'
                      : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRoundId(r.id)}
                      className="text-left"
                    >
                      <p className="font-semibold">
                        Round {r.roundNumber}
                        {r.name ? ` — ${r.name}` : ''}
                        {isActive ? (
                          <span className="ml-2 text-xs text-success">ACTIVE DISPLAY</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-text">
                        {r.durationSeconds}s · {r._count?.participants ?? 0} registered
                      </p>
                    </button>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => adminSetActiveRound(competitionId, r.id),
                          'Active round set',
                        )
                      }
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    >
                      Set active
                    </button>
                    {(r.status === 'DRAFT' || r.status === 'SCHEDULED') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void confirmRun(
                            `Start round ${r.roundNumber} now?`,
                            () => adminStartRound(competitionId, r.id),
                            'Round started',
                          )
                        }
                        className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Start
                      </button>
                    )}
                    {r.status === 'LIVE' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void confirmRun(
                            'End this round?',
                            () => adminEndRound(competitionId, r.id),
                            'Round ended',
                          )
                        }
                        className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        End
                      </button>
                    )}
                    {r.status === 'ENDED' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void confirmRun(
                            'Finalize results? This locks the leaderboard.',
                            () => adminFinalizeRound(competitionId, r.id),
                            'Round finalized',
                          )
                        }
                        className="rounded-lg bg-primary-accent px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Finalize
                      </button>
                    )}
                    {r.status !== 'FINALIZED' && r.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void confirmRun(
                            'Cancel this round?',
                            () => adminCancelRound(competitionId, r.id),
                            'Round cancelled',
                          )
                        }
                        className="rounded-lg border border-live-danger px-3 py-1.5 text-xs font-semibold text-live-danger"
                      >
                        Cancel round
                      </button>
                    )}
                  </div>
                  {r.status === 'DRAFT' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        disabled={busy || !scheduleAt}
                        onClick={() => {
                          const iso = new Date(scheduleAt).toISOString();
                          void run(
                            () => adminScheduleRound(competitionId, r.id, iso),
                            'Round scheduled',
                          );
                        }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                      >
                        Schedule
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Roster */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">
            Roster
            {selectedRound
              ? ` · Round ${selectedRound.roundNumber}`
              : ' · select a round'}
          </h2>
          <form onSubmit={registerOne} className="mt-3 grid gap-2 sm:grid-cols-4">
            <input
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="Company ID (UUID)"
              required
              className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name"
              required
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="Mobile (10–15 digits)"
              required
              className="rounded-xl border border-border bg-background px-3 py-2"
            />
            <button
              type="submit"
              disabled={busy || !selectedRoundId}
              className="rounded-xl bg-primary-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs uppercase text-muted-text">
                <tr>
                  <th className="py-2 pr-2">Company</th>
                  <th className="py-2 pr-2">Mobile</th>
                  <th className="py-2 pr-2">Score</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 pr-2">
                      <p className="font-medium">{p.company.name}</p>
                      <p className="font-mono text-xs text-muted-text">
                        {p.company.id}
                      </p>
                    </td>
                    <td className="py-2 pr-2 font-mono">{p.company.mobile}</td>
                    <td className="py-2 pr-2">
                      {p.finalScore}
                      {p.finalRank != null ? ` (#${p.finalRank})` : ''}
                    </td>
                    <td className="py-2 pr-2">{p.status}</td>
                    <td className="py-2">
                      {p.status !== 'DISQUALIFIED' && selectedRoundId ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt(
                              'Disqualify reason (min 5 chars)',
                            );
                            if (!reason || reason.trim().length < 5) return;
                            void run(
                              () =>
                                adminDisqualify(
                                  competitionId,
                                  selectedRoundId,
                                  p.id,
                                  reason.trim(),
                                ),
                              'Participant disqualified',
                            );
                          }}
                          className="text-xs font-semibold text-live-danger underline"
                        >
                          Disqualify
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {participants.length === 0 ? (
              <p className="mt-3 text-sm text-muted-text">No participants yet.</p>
            ) : null}
          </div>
        </section>

        {/* Events */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Audit events</h2>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {[
                'CREATED',
                'ROUND_CREATED',
                'ROUND_STARTED',
                'ROUND_ENDED',
                'ROUND_FINALIZED',
                'REGISTERED',
                'JOINED',
                'DISQUALIFIED',
                'JOB_PUBLISHED',
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="font-semibold">{ev.eventType}</p>
                <p className="text-xs text-muted-text">
                  {new Date(ev.createdAt).toLocaleString()}
                  {ev.participant
                    ? ` · ${ev.participant.companyName} (${ev.participant.mobile})`
                    : ''}
                </p>
              </li>
            ))}
            {events.length === 0 ? (
              <li className="text-muted-text">No events.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-live-danger/40 bg-live-danger/5 p-6">
          <h2 className="text-lg font-semibold text-live-danger">Danger zone</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void confirmRun(
                'Cancel the entire competition?',
                () => adminCancelCompetition(competitionId),
                'Competition cancelled',
              )
            }
            className="mt-3 rounded-xl border border-live-danger px-4 py-2 text-sm font-semibold text-live-danger"
          >
            Cancel competition
          </button>
        </section>
      </div>
    </div>
  );
}
