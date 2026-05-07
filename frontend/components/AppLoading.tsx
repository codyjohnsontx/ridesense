export function AppLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius)] border border-border bg-card px-5 py-5">
        <div className="h-3 w-24 rounded-sm bg-muted" />
        <div className="h-8 w-48 rounded-sm bg-muted" />
        <div className="h-3 w-32 rounded-sm bg-muted" />
      </div>
    </main>
  );
}
