'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BellRing, Briefcase, Clock, Snowflake, Sparkles } from 'lucide-react';
import { CITY_CODES, CreateTravelRequestInput, type City } from '@waka/contracts';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { doualaIso, todayInDouala } from '@/lib/format';
import { RequireAuth } from '@/components/session/SessionProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Toggle, describedBy } from '@/components/ui/Field';
import { ErrorState, Notice } from '@/components/ui/States';
import { cn } from '@/lib/cn';

const isCity = (v?: string) => !!v && (CITY_CODES as readonly string[]).includes(v);

export function RequestForm(props: { cities: City[]; initial: { from?: string; to?: string; date?: string; seats: number } }) {
  return <RequireAuth>{() => <Inner {...props} />}</RequireAuth>;
}

function Inner({ cities, initial }: { cities: City[]; initial: { from?: string; to?: string; date?: string; seats: number } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);

  const schema = z
    .object({
      originCity: z.enum(CITY_CODES),
      destinationCity: z.enum(CITY_CODES),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      seats: z.coerce.number().int().min(1).max(4),
      budget: z.union([z.literal(''), z.coerce.number().int().min(500).max(60_000)]),
      preferredPickup: z.string(),
      needsLuggage: z.boolean(),
      wantsAirConditioning: z.boolean(),
      notifyOnNewMatch: z.boolean(),
    })
    .refine((v) => v.originCity !== v.destinationCity, { message: t.search.sameCity, path: ['destinationCity'] })
    .refine((v) => v.end > v.start, { message: t.request.windowInvalid, path: ['end'] });
  type Form = z.input<typeof schema>;

  const { register, handleSubmit, formState, watch, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      originCity: (isCity(initial.from) ? initial.from : 'DLA') as Form['originCity'],
      destinationCity: (isCity(initial.to) ? initial.to : 'YDE') as Form['destinationCity'],
      day: initial.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) ? initial.date : todayInDouala(new Date(Date.now() + 86_400_000)),
      start: '06:00',
      end: '10:00',
      seats: Math.min(4, Math.max(1, initial.seats)),
      budget: '',
      preferredPickup: '',
      needsLuggage: false,
      wantsAirConditioning: false,
      notifyOnNewMatch: true,
    },
  });
  const e = formState.errors;
  const origin = watch('originCity');
  const start = watch('start');
  const end = watch('end');
  const pickups = cities.find((c) => c.code === origin)?.meetingPoints ?? [];

  const presets = [
    { label: '06:00 – 10:00', s: '06:00', e: '10:00' },
    { label: '10:00 – 14:00', s: '10:00', e: '14:00' },
    { label: '14:00 – 18:00', s: '14:00', e: '18:00' },
    { label: '18:00 – 22:00', s: '18:00', e: '22:00' },
  ];

  const submit = handleSubmit(async (raw) => {
    setError(null);
    const v = schema.parse(raw);
    const body = CreateTravelRequestInput.parse({
      originCity: v.originCity,
      destinationCity: v.destinationCity,
      windowStart: doualaIso(v.day, v.start),
      windowEnd: doualaIso(v.day, v.end),
      seats: v.seats,
      maxBudgetPerSeat: v.budget === '' ? null : v.budget,
      preferredPickup: v.preferredPickup || null,
      needsLuggage: v.needsLuggage,
      wantsAirConditioning: v.wantsAirConditioning,
      notifyOnNewMatch: v.notifyOnNewMatch,
    });
    try {
      const r = await api.requests.create(body);
      router.push(`/demandes/${r.id}`);
    } catch (err) {
      setError(err);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6 rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-8">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-display text-lg font-extrabold">{t.request.corridor}</legend>
        <Field id="rq-from" label={t.common.from} error={e.originCity?.message}>
          <Select id="rq-from" {...register('originCity')}>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="rq-to" label={t.common.to} error={e.destinationCity?.message}>
          <Select id="rq-to" aria-invalid={e.destinationCity ? true : undefined} aria-describedby={describedBy('rq-to', e.destinationCity)} {...register('destinationCity')}>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold">
          <Clock className="h-5 w-5 text-green-600" aria-hidden="true" />
          {t.request.window}
        </legend>
        <Field id="rq-day" label={t.request.day}>
          <Input id="rq-day" type="date" min={todayInDouala()} {...register('day')} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={start === p.s && end === p.e}
              onClick={() => {
                setValue('start', p.s, { shouldValidate: formState.isSubmitted });
                setValue('end', p.e, { shouldValidate: formState.isSubmitted });
              }}
              className={cn(
                'tabular min-h-11 rounded-2xl px-3.5 text-sm font-semibold ring-1 ring-inset transition',
                start === p.s && end === p.e ? 'bg-night-900 text-ivory ring-night-900' : 'bg-white ring-line hover:ring-night-200',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="rq-start" label={t.request.windowStart}>
            <Input id="rq-start" type="time" step={900} {...register('start')} />
          </Field>
          <Field id="rq-end" label={t.request.windowEnd} error={e.end?.message}>
            <Input id="rq-end" type="time" step={900} aria-invalid={e.end ? true : undefined} aria-describedby={describedBy('rq-end', e.end)} {...register('end')} />
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rq-seats" label={t.request.seats}>
          <Select id="rq-seats" {...register('seats')}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="rq-budget" label={t.request.budget} hint={t.request.budgetHint} error={e.budget ? t.driver.seatPriceHint : undefined} optionalLabel={t.common.optional}>
          <div className="relative">
            <Input
              id="rq-budget"
              type="number"
              inputMode="numeric"
              min={500}
              max={60000}
              step={50}
              className="pr-16"
              aria-invalid={e.budget ? true : undefined}
              aria-describedby={describedBy('rq-budget', e.budget, true)}
              {...register('budget')}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink">FCFA</span>
          </div>
        </Field>
      </div>

      <Field id="rq-pickup" label={t.request.pickup} optionalLabel={t.common.optional}>
        <Select id="rq-pickup" {...register('preferredPickup')}>
          <option value="">{t.request.pickupAny}</option>
          {pickups.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle id="rq-lug" label={t.request.needsLuggage} icon={<Briefcase className="h-4 w-4 text-green-600" aria-hidden="true" />} {...register('needsLuggage')} />
        <Toggle id="rq-ac" label={t.request.wantsAc} icon={<Snowflake className="h-4 w-4 text-green-600" aria-hidden="true" />} {...register('wantsAirConditioning')} />
        <Toggle id="rq-notify" className="sm:col-span-2" label={t.request.notify} icon={<BellRing className="h-4 w-4 text-amber-700" aria-hidden="true" />} {...register('notifyOnNewMatch')} />
      </div>

      <Notice tone="green">{t.request.noAuto}</Notice>
      {error ? <ErrorState compact error={error} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        {formState.isSubmitting ? t.request.submitting : t.request.submit}
      </Button>
    </form>
  );
}
