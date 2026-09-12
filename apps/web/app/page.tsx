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
          Next.js UI is ready. Competition participant and observer screens will
          land in later phases. API health:{" "}
          <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-sm dark:bg-white/[.08]">
            {`${process.env.NEXT_PUBLIC_API_URL}/health`}
          </code>
        </p>
      </main>
    </div>
  );
}
