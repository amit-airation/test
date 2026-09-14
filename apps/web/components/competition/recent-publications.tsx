'use client';

type RecentPublicationsProps = {
  jobs: Array<{ id: string; title: string; publishedAt: string }>;
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
            Scores from the job server will appear here as they publish.
          </li>
        ) : (
          jobs.map((job) => (
            <li key={job.id} className="flex items-start justify-between gap-4">
              <span className="text-sm text-foreground">
                <span className="mr-2 text-success" aria-hidden>
                  ✓
                </span>
                {job.title}
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
