import Link from "next/link";

export default function Home() {
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
          Participant dashboards live at{" "}
          <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-sm dark:bg-white/[.08]">
            /competition/[id]
          </code>
          . Open a competition UUID from the API to join, publish jobs, and
          watch your score update in real time.
        </p>
        <p className="mt-6 text-sm text-muted-text">
          API health:{" "}
          <code className="font-mono text-xs">
            {`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/health`}
          </code>
        </p>
        <Link
          href="/competition/00000000-0000-0000-0000-000000000000"
          className="mt-8 inline-flex rounded-xl bg-primary-accent px-4 py-3 text-sm font-semibold text-white"
        >
          Open sample competition route
        </Link>
      </main>
    </div>
  );
}
