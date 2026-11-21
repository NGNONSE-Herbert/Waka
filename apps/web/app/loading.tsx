export default function Loading() {
  return (
    <div className="container-w space-y-6 py-10" role="status" aria-busy="true">
      <div className="skeleton h-10 w-64" />
      <div className="skeleton h-48 rounded-[2rem]" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-32 rounded-3xl" />
        <div className="skeleton h-32 rounded-3xl" />
        <div className="skeleton h-32 rounded-3xl" />
      </div>
    </div>
  );
}
