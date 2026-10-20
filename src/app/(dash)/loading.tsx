/** Shown the instant you switch tabs (the sidebar stays put) while the page's data loads. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-6 w-40 rounded bg-zinc-200" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
      <div className="card mt-6 h-64" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card h-40" />
        <div className="card h-40" />
      </div>
    </div>
  );
}
