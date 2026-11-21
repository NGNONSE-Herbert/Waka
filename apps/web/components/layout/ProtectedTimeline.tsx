import { ArrowDown, Lock } from 'lucide-react';
import type { Dict } from '@/lib/i18n';

/** Chaîne des états de paiement avec les libellés EXACTS du domaine (jamais « demandé » = « confirmé »). */
export function ProtectedTimeline({ t }: { t: Dict }) {
  const chain = ['PSP_PENDING', 'PSP_CONFIRMED_HELD', 'RELEASE_REQUESTED', 'PAID'] as const;
  return (
    <div className="mt-8 grid gap-4 rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line sm:grid-cols-[1fr_auto]">
      <ol className="space-y-2">
        {chain.map((s, i) => (
          <li key={s}>
            <div className="flex items-center gap-3 rounded-2xl bg-sand px-4 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-night-900 font-display text-sm font-extrabold text-amber-400">{i + 1}</span>
              <span className="font-semibold text-night-900">{t.paymentState[s]}</span>
            </div>
            {i < chain.length - 1 && <ArrowDown className="mx-auto my-1 h-4 w-4 text-green-600" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3 self-center rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:max-w-56">
        <Lock className="h-6 w-6 shrink-0 text-amber-800" aria-hidden="true" />
        <span className="text-sm font-semibold text-amber-800">{t.paymentState.FROZEN_DISPUTE}</span>
      </div>
    </div>
  );
}
