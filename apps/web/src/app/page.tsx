export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium tracking-wide text-slate-300 uppercase">
        SafeSignal
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Digital Safety &amp; Accountability Platform
      </h1>
      <p className="mt-3 max-w-xl text-sm text-slate-400">
        Monorepo scaffold initialized. Frontend, API, and database services are ready for
        feature development.
      </p>
    </main>
  );
}
