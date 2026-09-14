'use client';

import { FormEvent, useState } from 'react';
import { createJob, publishJob } from '@/lib/competition/api';

type JobCreateEntryProps = {
  token: string;
  competitionId: string;
  companyId: string | null;
  disabled?: boolean;
  onPublished: (job: {
    id: string;
    title: string;
    publishedAt: string;
    myScore: number | null;
  }) => void;
};

export function JobCreateEntry({
  token,
  competitionId,
  companyId,
  disabled,
  onPublished,
}: JobCreateEntryProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyId) {
      setError('Join the competition with a company before publishing jobs.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const draft = await createJob(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        employmentType,
        companyId,
        competitionId,
        idempotencyKey: `web-${competitionId}-${Date.now()}`,
      });
      const published = await publishJob(token, draft.id);
      onPublished({
        id: published.job.id,
        title: published.job.title,
        publishedAt: published.job.publishedAt ?? new Date().toISOString(),
        myScore: published.my_score,
      });
      setTitle('');
      setDescription('');
      setLocation('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish job');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-primary-accent px-6 py-4 text-center text-base font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Create job
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div>
        <label className="text-sm text-muted-text" htmlFor="job-title">
          Title
        </label>
        <input
          id="job-title"
          required
          minLength={3}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary-accent"
          placeholder="Senior Backend Engineer"
        />
      </div>
      <div>
        <label className="text-sm text-muted-text" htmlFor="job-description">
          Description
        </label>
        <textarea
          id="job-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary-accent"
          placeholder="Build NestJS APIs for Hirance live competitions"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-muted-text" htmlFor="job-location">
            Location
          </label>
          <input
            id="job-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary-accent"
            placeholder="Remote"
          />
        </div>
        <div>
          <label className="text-sm text-muted-text" htmlFor="job-type">
            Employment type
          </label>
          <select
            id="job-type"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary-accent"
          >
            <option value="FULL_TIME">Full time</option>
            <option value="PART_TIME">Part time</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-live-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || disabled}
          className="flex-1 rounded-xl bg-primary-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Publishing…' : 'Publish job'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-border px-4 py-3 text-sm text-muted-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
