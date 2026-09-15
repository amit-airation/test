'use client';

import type { RecentJob } from '@/lib/competition/types';

type RecentPublicationsProps = {
  jobs: RecentJob[];
};

export function RecentPublications({ jobs }: RecentPublicationsProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-text">
        Recent publications
      </h2>
      <ul className="mt-4 space-y-3">
        {jobs.length === 0 ? (
          <li className="text-sm text-muted-text">
            Scored jobs will appear here as they arrive.
          </li>
        ) : (
          jobs.map((job) => (
            <li key={job.id} className="flex items-start justify-between gap-4">
              <span className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 text-success" aria-hidden>
                  ✓
                </span>
                <span className="space-y-0.5">
                  <span className="block">{job.title}</span>
                  {job.postDurationSeconds != null ? (
                    <span className="block text-xs text-muted-text">
                      ⏱{' '}
                      {job.postDurationSeconds < 60
                        ? `${job.postDurationSeconds.toFixed(1)}s after previous`
                        : `${(job.postDurationSeconds / 60).toFixed(1)}min after previous`}
                    </span>
                  ) : null}
                </span>
              </span>
              <time className="shrink-0 font-mono text-xs tabular-nums text-muted-text">
                {new Date(job.publishedAt).toLocaleTimeString()}
              </time>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
