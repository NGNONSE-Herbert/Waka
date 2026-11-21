export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <div className="bg-night-900 pb-24 pt-8">
        <div className="container-w space-y-4">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-white/10" />
          <div className="h-12 w-3/4 max-w-lg animate-pulse rounded-xl bg-white/10" />
        </div>
      </div>
      <div className="container-w relative z-10 -mt-16 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <div className="skeleton h-48 rounded-3xl" />
          <div className="skeleton h-40 rounded-3xl" />
          <div className="skeleton h-40 rounded-3xl" />
        </div>
        <div className="skeleton h-96 rounded-[2rem]" />
      </div>
    </div>
  );
}
