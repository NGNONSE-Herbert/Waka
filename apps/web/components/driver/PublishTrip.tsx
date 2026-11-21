'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Briefcase, Calculator, Check, Plus, Snowflake, Send, X } from 'lucide-react';
import { CITY_CODES, CreateTripInput, type City, type Me } from '@waka/contracts';
import { quote } from '@waka/domain';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { amountOnly, doualaIso, money, todayInDouala } from '@/lib/format';
import { RequireAuth } from '@/components/session/SessionProvider';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Toggle, describedBy } from '@/components/ui/Field';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

export function PublishTrip({ cities }: { cities: City[] }) {
  return <RequireAuth>{(me) => <Gate me={me} cities={cities} />}</RequireAuth>;
}

function Gate({ me, cities }: { me: Me; cities: City[] }) {
  const { t } = useI18n();
  const approved = me.vehicles.filter((v) => v.reviewStatus === 'APPROVED');
  if (!me.canPublishTrips || me.driverStatus !== 'VERIFIED') {
    return (
      <div className="container-w max-w-2xl py-12">
        <EmptyState title={t.driver.notVerified} body={t.driver.reviewBody} action={<ButtonLink href="/conducteur">{t.driver.title}</ButtonLink>} />
      </div>
    );
  }
  if (approved.length === 0) {
    return (
      <div className="container-w max-w-2xl py-12">
        <EmptyState title={t.driver.noApprovedVehicle} action={<ButtonLink href="/conducteur">{t.driver.addVehicle}</ButtonLink>} />
      </div>
    );
  }
  return <Form vehicles={approved} cities={cities} />;
}

function Form({ vehicles, cities }: { vehicles: Me['vehicles']; cities: City[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [customRule, setCustomRule] = useState('');
  const inv = t.common.invalidField;

  const schema = z
    .object({
      vehicleId: z.string().min(1),
      originCity: z.enum(CITY_CODES),
      destinationCity: z.enum(CITY_CODES),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, inv),
      time: z.string().regex(/^\d{2}:\d{2}$/, inv),
      meetingPoint: z.string().trim().min(3, inv).max(120),
      dropoffPoint: z.string().trim().min(3, inv).max(120),
      seats: z.coerce.number().int().min(1).max(8),
      seatPrice: z.coerce.number().int().min(500, t.driver.seatPriceHint).max(50_000, t.driver.seatPriceHint).refine((n) => n % 50 === 0, t.driver.seatPriceHint),
      luggage: z.enum(['NONE', 'SMALL', 'MEDIUM', 'LARGE']),
      airConditioning: z.boolean(),
    })
    .refine((v) => v.originCity !== v.destinationCity, { message: t.search.sameCity, path: ['destinationCity'] });
  type F = z.input<typeof schema>;

  const { register, handleSubmit, formState, watch, setValue } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicleId: vehicles[0]?.id ?? '',
      originCity: 'DLA',
      destinationCity: 'YDE',
      date: todayInDouala(new Date(Date.now() + 86_400_000)),
      time: '07:00',
      meetingPoint: '',
      dropoffPoint: '',
      seats: 3,
      seatPrice: 5000,
      luggage: 'MEDIUM',
      airConditioning: true,
    },
  });
  const e = formState.errors;
  const [origin, dest, seatPriceRaw, vehicleId] = watch(['originCity', 'destinationCity', 'seatPrice', 'vehicleId']);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const maxSeats = Math.min(8, Math.max(1, (vehicle?.seatsTotal ?? 4)));
  const originPoints = cities.find((c) => c.code === origin)?.meetingPoints ?? [];
  const destPoints = cities.find((c) => c.code === dest)?.meetingPoints ?? [];

  // Aperçu calculé avec la fonction de domaine `quote()` — indicatif, le serveur recalcule.
  const preview = useMemo(() => {
    try {
      return quote(Number(seatPriceRaw), 1);
    } catch {
      return null;
    }
  }, [seatPriceRaw]);

  const toggleRule = (r: string) => setRules((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : cur.length >= 6 ? cur : [...cur, r]));

  const submit = handleSubmit(async (raw) => {
    setError(null);
    const v = schema.parse(raw);
    const body = CreateTripInput.parse({
      vehicleId: v.vehicleId,
      originCity: v.originCity,
      destinationCity: v.destinationCity,
      departureAt: doualaIso(v.date, v.time),
      meetingPoint: v.meetingPoint,
      dropoffPoint: v.dropoffPoint,
      seats: v.seats,
      seatPrice: v.seatPrice,
      luggage: v.luggage,
      airConditioning: v.airConditioning,
      rules,
    });
    try {
      const trip = await api.trips.create(body);
      router.push(trip?.id ? `/conducteur/trajets/${trip.id}?published=1` : '/conducteur');
    } catch (err) {
      setError(err);
    }
  });

  const chip = (active: boolean) =>
    cn('min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition', active ? 'bg-green-600 text-white ring-green-600' : 'bg-white text-night-800 ring-line hover:ring-night-200');

  return (
    <>
      <section className="relative isolate overflow-hidden bg-night-900 pb-24 pt-10 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-w max-w-5xl">
          <h1 className="text-4xl font-extrabold">{t.driver.publishTitle}</h1>
          <p className="mt-2 max-w-2xl text-night-200">{t.driver.publishSubtitle}</p>
        </div>
      </section>
      <form onSubmit={submit} noValidate className="container-w relative z-10 -mt-16 grid max-w-5xl gap-6 pb-12 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-8">
          <Field id="p-veh" label={t.driver.vehicleSelect}>
            <Select id="p-veh" {...register('vehicleId')}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="p-from" label={t.common.from}>
              <Select id="p-from" {...register('originCity')}>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="p-to" label={t.common.to} error={e.destinationCity?.message}>
              <Select id="p-to" aria-invalid={e.destinationCity ? true : undefined} aria-describedby={describedBy('p-to', e.destinationCity)} {...register('destinationCity')}>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="p-date" label={t.driver.departureDate} error={e.date?.message}>
              <Input id="p-date" type="date" min={todayInDouala()} {...register('date')} />
            </Field>
            <Field id="p-time" label={t.driver.departureTime} error={e.time?.message}>
              <Input id="p-time" type="time" step={900} {...register('time')} />
            </Field>
          </div>

          {(
            [
              ['meetingPoint', t.driver.meetingPoint, originPoints, 'p-meet'],
              ['dropoffPoint', t.driver.dropoffPoint, destPoints, 'p-drop'],
            ] as const
          ).map(([name, label, points, id]) => (
            <Field key={name} id={id} label={label} error={e[name]?.message}>
              <Input id={id} list={`${id}-list`} aria-invalid={e[name] ? true : undefined} aria-describedby={describedBy(id, e[name])} {...register(name)} />
              <datalist id={`${id}-list`}>
                {points.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {points.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-ink">{t.driver.suggestions} :</span>
                  {points.map((p) => (
                    <button key={p} type="button" className={chip(watch(name) === p)} onClick={() => setValue(name, p, { shouldValidate: formState.isSubmitted })}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="p-seats" label={t.driver.seatsOffered}>
              <Select id="p-seats" {...register('seats')}>
                {Array.from({ length: maxSeats }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="p-price" label={t.driver.seatPrice} hint={t.driver.seatPriceHint} error={e.seatPrice?.message}>
              <div className="relative">
                <Input
                  id="p-price"
                  type="number"
                  inputMode="numeric"
                  min={500}
                  max={50000}
                  step={50}
                  className="tabular pr-16 font-display text-lg font-bold"
                  aria-invalid={e.seatPrice ? true : undefined}
                  aria-describedby={describedBy('p-price', e.seatPrice, true)}
                  {...register('seatPrice')}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink">FCFA</span>
              </div>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="p-lug" label={t.driver.luggage}>
              <Select id="p-lug" {...register('luggage')}>
                {(['NONE', 'SMALL', 'MEDIUM', 'LARGE'] as const).map((l) => (
                  <option key={l} value={l}>
                    {t.luggage[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Toggle id="p-ac" className="w-full" label={t.driver.ac} icon={<Snowflake className="h-4 w-4 text-green-600" aria-hidden="true" />} {...register('airConditioning')} />
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">{t.driver.rules}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...t.driver.rulePresets, ...rules.filter((r) => !t.driver.rulePresets.includes(r))].map((r) => (
                <button key={r} type="button" aria-pressed={rules.includes(r)} className={chip(rules.includes(r))} onClick={() => toggleRule(r)}>
                  {rules.includes(r) ? <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <label htmlFor="p-rule" className="sr-only">
                {t.driver.customRule}
              </label>
              <Input id="p-rule" placeholder={t.driver.customRule} maxLength={80} value={customRule} onChange={(ev) => setCustomRule(ev.target.value)} />
              <Button
                variant="secondary"
                aria-label={t.driver.customRule}
                disabled={!customRule.trim() || rules.length >= 6}
                onClick={() => {
                  toggleRule(customRule.trim());
                  setCustomRule('');
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {rules.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
                {rules.map((r) => (
                  <li key={r} className="inline-flex items-center gap-1 rounded-full bg-green-50 py-1 pl-3 pr-1 text-xs font-semibold text-green-700">
                    {r}
                    <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-green-100" aria-label={`${t.common.cancel} : ${r}`} onClick={() => toggleRule(r)}>
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-[2rem] bg-night-900 p-6 text-ivory shadow-lift" aria-live="polite">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300">
              <Calculator className="h-4 w-4" aria-hidden="true" />
              {t.driver.previewTitle}
            </p>
            {preview ? (
              <>
                <p className="mt-4 text-sm text-night-200">{t.driver.previewPassenger}</p>
                <p className="font-display leading-none">
                  <span className="tabular text-5xl font-extrabold text-amber-400">{amountOnly(preview.total, locale)}</span>
                  <span className="ml-1 font-bold">FCFA</span>
                </p>
                <p className="text-xs text-night-300">
                  {t.common.perSeat}, {t.common.feesIncluded}
                </p>
                <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-night-200">{t.driver.previewYou}</dt>
                    <dd className="tabular font-bold">{money(preview.driverAmount, locale)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-night-200">{t.driver.previewFee}</dt>
                    <dd className="tabular font-bold">{money(preview.serviceFee, locale)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-night-300">
                  {t.driver.previewNote} ({preview.policyVersion})
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-night-200">{t.driver.previewInvalid}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-ink">
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
              {t.luggage[watch('luggage')]}
            </span>
          </div>
          {error ? <ErrorState compact error={error} /> : null}
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            <Send className="h-5 w-5" aria-hidden="true" />
            {formState.isSubmitting ? t.driver.publishing : t.driver.publish}
          </Button>
        </aside>
      </form>
    </>
  );
}
