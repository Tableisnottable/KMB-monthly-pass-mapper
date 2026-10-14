import Link from 'next/link';

export default function EnglishHome() {
  return (
    <main className="min-h-screen bg-cm-paper font-cm text-cm-ink">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="rounded-3xl bg-cm-ink p-6 text-white shadow-card">
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">
            Transit Compass HK
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Hong Kong journey planner</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
            Compare public transport and walking options by time, fare and
            service status, without promoting any single operator.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="rounded-xl bg-cm-green px-4 py-2 text-sm font-extrabold text-white" href="/">
              Chinese (Hong Kong)
            </Link>
            <Link className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold text-white" href="/updates">
              Route updates
            </Link>
            <Link className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold text-white" href="/traffic">
              Traffic events
            </Link>
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            ['Search routes', 'Plan journeys with scheduled service information and fare comparisons.'],
            ['Use GPS', 'Find yourself on the Hong Kong map in the browser; your location never leaves the device.'],
            ['Check alerts', 'See route changes and traffic events that may affect your journey.'],
          ].map(([title, description]) => (
            <article className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-cm-line" key={title}>
              <h2 className="font-extrabold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-cm-muted">{description}</p>
            </article>
          ))}
        </section>

        <p className="mt-6 rounded-2xl bg-cm-green/10 p-4 text-sm leading-6 text-cm-greenDeep">
          Live ETA is not connected yet. Current route results use scheduled
          headways and will not be presented as real-time arrivals until an
          official provider feed is configured and validated.
        </p>
      </div>
    </main>
  );
}
