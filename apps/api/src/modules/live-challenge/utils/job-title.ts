/** Resolve display title from job.title or job.name. */
export function resolveJobTitle(
  job?: { title?: string; name?: string } | null,
): string {
  return (job?.title ?? job?.name ?? '').trim();
}
