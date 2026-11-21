import { TripCardSkeleton } from '@/components/trip/TripBits';

export default function Loading() {
  return (
    <div className="container-w py-8" role="status" aria-busy="true">
      <div className="skeleton h-14 w-full rounded-2xl" />
      <div className="skeleton mt-8 h-8 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[17rem_1fr]">
        <div className="hidden space-y-3 lg:block">
          <div className="skeleton h-11" />
          <div className="skeleton h-11" />
          <div className="skeleton h-11" />
        </div>
        <div className="grid gap-4">
          <TripCardSkeleton />
          <TripCardSkeleton />
          <TripCardSkeleton />
        </div>
      </div>
    </div>
  );
}
