'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Hourglass,
  Landmark,
  Lock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { InitiatePaymentInput, PaymentChannel, type BookingOutput, type Me, type PaymentOutput } from '@waka/contracts';
import { api, isApiError, newIdempotencyKey } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { cmE164, dateTime, formatCmLocal, isCmMobile, money } from '@/lib/format';
import { TERMS_VERSION } from '@/lib/env';
import { RequireAuth } from '@/components/session/SessionProvider';
import { PriceLines } from '@/components/trip/TripBits';
import { Badge } from '@/components/ui/Card';
import { Button, ButtonLink, Spinner } from '@/components/ui/Button';
import { Checkbox, Field, Input, describedBy } from '@/components/ui/Field';
import { ErrorState, Notice } from '@/components/ui/States';
import { PhoneSimulator } from './PhoneSimulator';
import { PurchaseSteps, useCountdown } from './BookingCommon';
import { cn } from '@/lib/cn';

const POLL_MS = 2500;
const CONFIRMED_STATES: BookingOutput['state'][] = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED', 'DISPUTED'];
type Phase = 'form' | 'pending' | 'confirmed' | 'failed' | 'manual' | 'expired' | 'cancelled';

export function PaymentFlow({ bookingId }: { bookingId: string }) {
  return <RequireAuth>{(me) => <PaymentInner bookingId={bookingId} me={me} />}</RequireAuth>;
}

function isPayment(v: unknown): v is PaymentOutput {
  return !!v && typeof v === 'object' && 'providerMode' in v && 'state' in v && !('trip' in v);
}

function PaymentInner({ bookingId }: { bookingId: string; me: Me }) {
  const { t, locale } = useI18n();
  const [booking, setBooking] = useState<BookingOutput | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [lastPayment, setLastPayment] = useState<PaymentOutput | null>(null);
  const [pollOffline, setPollOffline] = useState(false);
  const [retrying, setRetrying] = useState(false); // l’utilisateur relance après un échec
  const bookingRef = useRef<BookingOutput | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await api.bookings.detail(bookingId);
      bookingRef.current = b;
      setBooking(b);
      setLoadError(null);
      setPollOffline(false);
      return b;
    } catch (e) {
      if (bookingRef.current && isApiError(e) && (e.isNetwork || e.code === 'API_UNAVAILABLE')) setPollOffline(true);
      else setLoadError(e);
      return null;
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const countdown = useCountdown(booking?.state === 'SEAT_HELD' ? booking.holdExpiresAt : null);
  const payment = booking?.payment ?? lastPayment;

  let phase: Phase = 'form';
  if (booking) {
    if (CONFIRMED_STATES.includes(booking.state)) phase = 'confirmed';
    else if (payment?.state === 'FAILED' && !(retrying && booking.state !== 'CANCELLED')) phase = 'failed';
    else if (booking.state === 'CANCELLED') phase = !payment ? 'expired' : 'cancelled';
    else if (payment?.state === 'MANUAL_REVIEW') phase = 'manual';
    else if (booking.state === 'PAYMENT_PENDING' && payment?.state !== 'FAILED') phase = 'pending';
    else if (payment && (payment.state === 'CREATED' || payment.state === 'PSP_PENDING')) phase = 'pending';
    else if (booking.state === 'SEAT_HELD' && countdown && countdown.total <= 0) phase = 'expired';
    else phase = 'form';
  }

  // Interrogation toutes les 2,5 s pendant la vérification du paiement.
  useEffect(() => {
    if (phase !== 'pending') return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [phase, load]);

  // Le compte à rebours est écoulé : on resynchronise avec le serveur (source de vérité).
  useEffect(() => {
    if (phase === 'expired' && booking?.state === 'SEAT_HELD') void load();
  }, [phase, booking?.state, load]);

  if (!booking) {
    return (
      <div className="container-w py-10">
        {loadError ? (
          <ErrorState error={loadError} onRetry={() => void load()} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]" role="status" aria-busy="true">
            <div className="skeleton h-96 rounded-[2rem]" />
            <div className="skeleton h-72 rounded-[2rem]" />
          </div>
        )}
      </div>
    );
  }

  const trip = booking.trip;
  return (
    <div className="pb-10">
      <section className="relative isolate overflow-hidden bg-night-900 pb-24 pt-8 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-w">
          <PurchaseSteps
            current={phase === 'confirmed' ? 2 : 1}
            labels={[t.payment.stepBook, t.payment.stepPay, t.payment.stepTicket]}
            ariaLabel={t.payment.title}
          />
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold sm:text-4xl">{t.payment.title}</h1>
              <p className="mt-1 text-night-200">
                {trip.origin.name} → {trip.destination.name} · {dateTime(trip.departureAt, locale)}
              </p>
            </div>
            {phase === 'form' && countdown && countdown.total > 0 && (
              <div
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 ring-1',
                  countdown.total < 120_000 ? 'bg-danger/20 ring-danger/40' : 'bg-white/10 ring-white/15',
                )}
                role="timer"
                aria-live="off"
              >
                <Hourglass className="h-5 w-5 text-amber-400" aria-hidden="true" />
                <div>
                  <p className="text-xs text-night-200">{t.payment.holdTitle}</p>
                  <p className="tabular font-display text-xl font-extrabold">
                    {fmt(t.payment.holdCountdown, { time: `${countdown.m}:${String(countdown.s).padStart(2, '0')}` })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="container-w relative z-10 -mt-16 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0 rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-8" aria-live="polite">
          {pollOffline && (
            <Notice tone="amber" className="mb-6" icon={<WifiOff className="h-5 w-5" aria-hidden="true" />}>
              {t.payment.networkLost}
            </Notice>
          )}
          {phase === 'form' && (
            <PayForm
              booking={booking}
              freshKey={retrying}
              onPaid={async (res) => {
                if (isPayment(res)) setLastPayment(res);
                else if (res && typeof res === 'object' && 'trip' in res) {
                  bookingRef.current = res as BookingOutput;
                  setBooking(res as BookingOutput);
                }
                setRetrying(false);
                await load();
              }}
            />
          )}
          {phase === 'pending' && payment && <PendingView payment={payment} amount={booking.price.total} onAnswered={() => void load()} />}
          {phase === 'pending' && !payment && (
            <div className="flex items-center gap-3 text-ink" role="status">
              <Spinner className="h-5 w-5 text-green-600" /> {t.payment.pendingPolling}
            </div>
          )}
          {phase === 'confirmed' && <ConfirmedView bookingId={booking.id} />}
          {phase === 'failed' && (
            <OutcomeView
              tone="danger"
              icon={<XCircle className="h-9 w-9" aria-hidden="true" />}
              title={t.payment.failedTitle}
              body={t.payment.failedBody}
              action={
                booking.state !== 'CANCELLED' && !(booking.holdExpiresAt && new Date(booking.holdExpiresAt).getTime() < Date.now() && booking.state === 'SEAT_HELD') ? (
                  <Button
                    onClick={() => {
                      setLastPayment(null);
                      setRetrying(true);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t.payment.tryAgain}
                  </Button>
                ) : (
                  <ButtonLink href={`/trajets/${trip.id}`}>{t.payment.holdExpiredCta}</ButtonLink>
                )
              }
            />
          )}
          {phase === 'manual' && (
            <OutcomeView tone="amber" icon={<ShieldAlert className="h-9 w-9" aria-hidden="true" />} title={t.payment.manualTitle} body={t.payment.manualBody} />
          )}
          {phase === 'expired' && (
            <OutcomeView
              tone="amber"
              icon={<Clock3 className="h-9 w-9" aria-hidden="true" />}
              title={t.errors.codes.HOLD_EXPIRED}
              body={t.payment.holdExpired}
              action={<ButtonLink href={`/trajets/${trip.id}`}>{t.payment.holdExpiredCta}</ButtonLink>}
            />
          )}
          {phase === 'cancelled' && (
            <OutcomeView
              tone="amber"
              icon={<XCircle className="h-9 w-9" aria-hidden="true" />}
              title={t.payment.cancelledTitle}
              body={t.payment.cancelledBody}
              action={<ButtonLink href={`/reservations/${booking.id}`}>{t.ticket.title}</ButtonLink>}
            />
          )}
        </div>

        {/* Récapitulatif */}
        <aside className="space-y-4 lg:sticky lg:top-24" aria-label={t.payment.summary}>
          <div className="rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line">
            <h2 className="eyebrow text-green-700">{t.payment.summary}</h2>
            <p className="mt-3 font-display text-xl font-extrabold">
              {trip.origin.name} → {trip.destination.name}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink">
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-green-600" aria-hidden="true" />
                {dateTime(trip.departureAt, locale)}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" aria-hidden="true" />
                {trip.meetingPoint}
              </li>
            </ul>
            <PriceLines price={booking.price} t={t} locale={locale} className="mt-4 border-t border-line pt-2" />
          </div>
          <div className="flex items-start gap-3 rounded-3xl bg-green-50 p-5 text-sm text-green-900 ring-1 ring-green-100">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
            <p>
              {t.payment.securityNote}{' '}
              <Link href="/paiement-protege" className="font-semibold underline underline-offset-2">
                {t.landing.payLearnMore}
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PayForm({ booking, onPaid, freshKey }: { booking: BookingOutput; onPaid: (res: unknown) => Promise<void>; freshKey: boolean }) {
  const { t, locale } = useI18n();
  const storageKey = `waka:pay-key:${booking.id}`;
  const keyRef = useRef<string | null>(null);
  const [netLost, setNetLost] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pendingValues, setPendingValues] = useState<{ channel: 'MTN_MOMO' | 'ORANGE_MONEY'; payerPhone: string } | null>(null);

  // Nouvelle tentative explicite après un échec = nouvelle action utilisateur = nouvelle clé.
  useEffect(() => {
    if (freshKey) {
      keyRef.current = null;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* stockage indisponible */
      }
    }
  }, [freshKey, storageKey]);

  const getKey = () => {
    if (keyRef.current) return keyRef.current;
    let k: string | null = null;
    try {
      k = sessionStorage.getItem(storageKey);
    } catch {
      /* navigation privée */
    }
    k ??= newIdempotencyKey();
    keyRef.current = k;
    try {
      sessionStorage.setItem(storageKey, k);
    } catch {
      /* ignore */
    }
    return k;
  };

  const schema = z.object({
    channel: PaymentChannel,
    payerPhone: z.string().refine(isCmMobile, t.auth.phoneInvalid),
    consent: z.boolean().refine((v) => v, t.payment.transparencyRequired),
  });
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, formState, watch } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { channel: 'MTN_MOMO', payerPhone: '', consent: false },
  });
  const channel = watch('channel');
  const phoneReg = register('payerPhone');

  const send = async (body: { channel: 'MTN_MOMO' | 'ORANGE_MONEY'; payerPhone: string }) => {
    setError(null);
    const key = getKey();
    const input = InitiatePaymentInput.parse(body);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await api.bookings.pay(booking.id, input, key);
        setNetLost(false);
        await onPaid(res);
        return;
      } catch (e) {
        if (isApiError(e) && (e.isNetwork || e.code === 'API_UNAVAILABLE')) {
          // Même Idempotency-Key : aucun risque de double débit.
          setNetLost(true);
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        setNetLost(false);
        setError(e);
        return;
      }
    }
  };

  const submit = handleSubmit(async (v) => {
    const body = { channel: v.channel, payerPhone: cmE164(v.payerPhone) };
    setPendingValues(body);
    await send(body);
  });

  const consentLabel = t.payment.transparencyLabel.split(/(\{fee\}|\{driver\}|\{cgu\}|\{v\})/).map((part, i) => {
    if (part === '{fee}') return <strong key={i}>{money(booking.price.serviceFee, locale)}</strong>;
    if (part === '{driver}') return <strong key={i}>{money(booking.price.driverAmount, locale)}</strong>;
    if (part === '{cgu}')
      return (
        <Link key={i} href="/cgu" target="_blank" className="font-semibold text-green-700 underline underline-offset-2">
          {t.auth.termsCgu}
        </Link>
      );
    if (part === '{v}')
      return (
        <code key={i} className="whitespace-nowrap rounded bg-sand px-1 text-xs">
          {TERMS_VERSION}
        </code>
      );
    return <span key={i}>{part}</span>;
  });

  const channels = [
    { v: 'MTN_MOMO' as const, label: t.payment.mtn, short: t.payment.mtnShort, swatch: 'bg-[#FFCB05] text-night-900', ring: 'has-[:checked]:ring-[#E0B000] has-[:checked]:bg-[#FFF8DB]' },
    { v: 'ORANGE_MONEY' as const, label: t.payment.orange, short: t.payment.orangeShort, swatch: 'bg-[#FF7900] text-white', ring: 'has-[:checked]:ring-[#FF7900] has-[:checked]:bg-[#FFF1E6]' },
  ];

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <fieldset>
        <legend className="font-display text-lg font-extrabold">{t.payment.channel}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {channels.map((c) => (
            <label
              key={c.v}
              className={cn(
                'relative flex min-h-20 cursor-pointer items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-inset ring-line transition has-[:checked]:ring-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber-400',
                c.ring,
              )}
            >
              <input type="radio" value={c.v} className="sr-only" {...register('channel')} />
              <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-sm font-black', c.swatch)} aria-hidden="true">
                {c.short}
              </span>
              <span className="flex-1 font-semibold text-night-900">{c.label}</span>
              <span
                aria-hidden="true"
                className={cn('grid h-6 w-6 place-items-center rounded-full ring-2', channel === c.v ? 'bg-night-900 ring-night-900' : 'ring-line')}
              >
                {channel === c.v && <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-ink">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
          {t.payment.channelNote}
        </p>
      </fieldset>

      <Field id="payerPhone" label={t.payment.payerPhone} hint={t.payment.payerPhoneHint} error={formState.errors.payerPhone?.message}>
        <div className="flex items-stretch gap-2">
          <span className="flex min-h-12 items-center rounded-2xl bg-sand px-4 font-display font-bold" aria-hidden="true">
            +237
          </span>
          <Input
            id="payerPhone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="6XX XXX XXX"
            className="font-display text-lg font-bold tracking-wider"
            aria-invalid={formState.errors.payerPhone ? true : undefined}
            aria-describedby={describedBy('payerPhone', formState.errors.payerPhone, true)}
            {...phoneReg}
            onChange={(e) => {
              e.target.value = formatCmLocal(e.target.value);
              void phoneReg.onChange(e);
            }}
          />
        </div>
      </Field>

      <div className="rounded-3xl bg-sand p-4">
        <Checkbox id="consent" label={consentLabel} error={formState.errors.consent?.message} {...register('consent')} />
      </div>

      {netLost && (
        <Notice tone="amber" icon={<WifiOff className="h-5 w-5" aria-hidden="true" />}>
          <p>{t.payment.networkLost}</p>
          {pendingValues && !formState.isSubmitting && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void send(pendingValues)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t.payment.networkRetry}
            </Button>
          )}
        </Notice>
      )}
      {error ? <ErrorState compact error={error} /> : null}

      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} data-testid="pay-submit">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        {formState.isSubmitting ? t.payment.paying : fmt(t.payment.pay, { amount: money(booking.price.total, locale) })}
      </Button>
    </form>
  );
}

function PendingView({ payment, amount, onAnswered }: { payment: PaymentOutput; amount: number; onAnswered: () => void }) {
  const { t } = useI18n();
  const ref = payment.mockProviderRef;
  return (
    <div className="grid items-center gap-8 xl:grid-cols-[1fr_auto]">
      <div>
        <div className="relative mb-6 grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" aria-hidden="true" />
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-amber-100 text-amber-800">
            <Smartphone className="h-9 w-9" aria-hidden="true" />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">{t.paymentState[payment.state]}</Badge>
          {payment.providerMode === 'MOCK' && <Badge tone="demo">{t.payment.mockBadge}</Badge>}
          {payment.providerMode === 'SANDBOX' && <Badge tone="demo">{t.payment.sandboxBadge}</Badge>}
        </div>
        <h2 className="mt-3 text-2xl font-extrabold" data-testid="payment-pending">
          {t.payment.pendingTitle}
        </h2>
        <p className="mt-2 leading-relaxed text-ink">{t.payment.pendingBody}</p>
        {payment.customerInstruction && (
          <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink">{t.payment.pendingInstruction}</p>
            <p className="mt-1 text-night-900">{payment.customerInstruction}</p>
          </div>
        )}
        <p className="mt-5 flex items-center gap-2 text-sm text-ink" role="status">
          <Spinner className="h-4 w-4 text-green-600" />
          {t.payment.pendingPolling}
        </p>
      </div>
      {payment.providerMode === 'MOCK' &&
        (ref ? (
          <PhoneSimulator providerRef={ref} amount={amount} channel={payment.channel} onAnswered={onAnswered} />
        ) : (
          <Notice tone="amber">{t.payment.simUnavailable}</Notice>
        ))}
    </div>
  );
}

function ConfirmedView({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center py-6 text-center" data-testid="payment-confirmed">
      <div className="relative grid h-24 w-24 place-items-center">
        <span className="absolute inset-0 animate-[pulse-soft_2s_ease-in-out_infinite] rounded-full bg-green-100" aria-hidden="true" />
        <svg viewBox="0 0 52 52" className="relative h-20 w-20" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="#0B7A70" />
          <path d="M15 27l7 7 15-16" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="route-draw" style={{ ['--len' as string]: 40 }} />
        </svg>
      </div>
      <h2 className="mt-6 text-3xl font-extrabold">{t.payment.confirmedTitle}</h2>
      <p className="mt-2 max-w-md text-ink">{t.payment.confirmedBody}</p>
      <ButtonLink href={`/reservations/${bookingId}`} size="lg" className="mt-8">
        {t.payment.seeTicket} <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </ButtonLink>
    </div>
  );
}

function OutcomeView({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: 'danger' | 'amber';
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <span className={cn('grid h-20 w-20 place-items-center rounded-full', tone === 'danger' ? 'bg-danger-50 text-danger' : 'bg-amber-100 text-amber-800')}>{icon}</span>
      <h2 className="mt-5 text-2xl font-extrabold">{title}</h2>
      <p className="mt-2 max-w-md leading-relaxed text-ink">{body}</p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

