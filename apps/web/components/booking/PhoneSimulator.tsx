'use client';
import { useState } from 'react';
import { FlaskConical, Signal, Wifi, BatteryMedium } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { money } from '@/lib/format';
import { ErrorState } from '@/components/ui/States';
import { Spinner } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Simulateur de téléphone — UNIQUEMENT en mode MOCK. Reproduit une invite USSD générique
 * (aucun logo d’opérateur). « Valider » / « Refuser » appellent POST /v1/dev/mock-psp/:ref/complete ;
 * le PSP mock émet alors un webhook signé vers l’API. L’UI n’affiche le succès QUE sur CONFIRMED serveur.
 */
export function PhoneSimulator({
  providerRef,
  amount,
  channel,
  onAnswered,
}: {
  providerRef: string;
  amount: number;
  channel: 'MTN_MOMO' | 'ORANGE_MONEY';
  onAnswered: () => void;
}) {
  const { t, locale } = useI18n();
  const [sending, setSending] = useState<null | 'SUCCEEDED' | 'FAILED'>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const yellow = channel === 'MTN_MOMO';

  const answer = async (outcome: 'SUCCEEDED' | 'FAILED') => {
    setSending(outcome);
    setError(null);
    try {
      await api.dev.mockComplete(providerRef, outcome);
      setDone(true);
      onAnswered();
    } catch (e) {
      setError(e);
    } finally {
      setSending(null);
    }
  };

  return (
    <section aria-labelledby="sim-title" className="flex flex-col items-center">
      <p id="sim-title" className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-center text-xs font-extrabold uppercase tracking-wider text-night-900 shadow-glow">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        {t.payment.simTitle}
      </p>
      {/* Coque */}
      <div className="relative w-[17.5rem] rounded-[2.75rem] bg-night-950 p-3 shadow-[0_30px_60px_-20px_rgb(11_22_34/0.6)] ring-1 ring-night-700">
        <div className="absolute left-1/2 top-3 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-night-950" aria-hidden="true" />
        <div className="relative overflow-hidden rounded-[2.2rem] bg-gradient-to-b from-night-800 to-night-900">
          {/* barre d’état */}
          <div className="flex items-center justify-between px-6 pb-2 pt-3 text-[0.65rem] font-semibold text-night-200" aria-hidden="true">
            <span>09:41</span>
            <span className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryMedium className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="pattern-dots flex min-h-[25rem] flex-col justify-center px-4 pb-8 pt-4">
            {/* invite USSD */}
            <div className="animate-fade-up rounded-2xl bg-[#ECEFF1] p-4 text-[#1b1b1b] shadow-xl" role="dialog" aria-label={t.payment.simOperator}>
              <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                <span
                  className={cn('grid h-7 w-7 place-items-center rounded-lg text-[0.6rem] font-black', yellow ? 'bg-[#FFCB05] text-[#1b1b1b]' : 'bg-[#FF7900] text-white')}
                  aria-hidden="true"
                >
                  {yellow ? t.payment.mtnShort : t.payment.orangeShort}
                </span>
                <p className="text-xs font-bold uppercase tracking-wide">{t.payment.simOperator}</p>
              </div>
              <p className="mt-3 font-mono text-[0.8rem] leading-relaxed">
                {fmt(t.payment.simPrompt, { amount: money(amount, locale), ref: providerRef.slice(-8).toUpperCase() })}
              </p>
              {done ? (
                <p className="mt-4 flex items-start gap-2 text-xs font-semibold text-[#0b5e57]" role="status">
                  <Spinner className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t.payment.simDone}
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => answer('FAILED')}
                    disabled={!!sending}
                    className="min-h-11 rounded-xl bg-white text-sm font-bold text-[#B42318] ring-1 ring-black/10 transition hover:bg-[#fff5f4] disabled:opacity-50"
                    data-testid="sim-refuse"
                  >
                    {sending === 'FAILED' ? t.payment.simSending : t.payment.simRefuse}
                  </button>
                  <button
                    type="button"
                    onClick={() => answer('SUCCEEDED')}
                    disabled={!!sending}
                    className="min-h-11 rounded-xl bg-[#0b7a70] text-sm font-bold text-white transition hover:bg-[#09655d] disabled:opacity-50"
                    data-testid="sim-approve"
                  >
                    {sending === 'SUCCEEDED' ? t.payment.simSending : t.payment.simApprove}
                  </button>
                </div>
              )}
            </div>
            <p className="mt-4 text-center text-[0.65rem] leading-relaxed text-night-300">{t.payment.simSubtitle}</p>
          </div>
        </div>
      </div>
      {error ? <ErrorState compact className="mt-4 w-full max-w-sm" error={error} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
