import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { cityName, useCities } from '../../src/cities';
import { addDays, dateKey, dayShort, doualaIso, nextDays, seats as seatsLabel, TIMES } from '../../src/format';
import { useI18n } from '../../src/i18n';
import { c, f } from '../../src/theme';
import { CheckRow, Chip, ErrorBox, Field, Notice, PageHeader, PrimaryButton, RequireAuth, Screen, SectionTitle, SelectField, Sheet, T } from '../../src/ui';

type Picker = 'from' | 'to' | 'day' | 'start' | 'end' | 'seats' | 'pickup' | null;
const WINDOWS = [['06:00', '10:00'], ['10:00', '14:00'], ['14:00', '18:00'], ['18:00', '22:00']] as const;

function Form() {
  const router = useRouter();
  const { t, m } = useI18n();
  const p = useLocalSearchParams<{ from?: string; to?: string; date?: string; seats?: string }>();
  const cities = useCities();
  const [from, setFrom] = useState(p.from ?? 'DLA');
  const [to, setTo] = useState(p.to ?? 'YDE');
  const [day, setDay] = useState(p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : addDays(dateKey(), 1));
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('10:00');
  const [seats, setSeats] = useState(Math.min(4, Math.max(1, Number(p.seats) || 1)));
  const [budget, setBudget] = useState('');
  const [pickup, setPickup] = useState('');
  const [luggage, setLuggage] = useState(false);
  const [ac, setAc] = useState(false);
  const [notify, setNotify] = useState(true);
  const [picker, setPicker] = useState<Picker>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budgetN = budget ? Number(budget) : null;
  const windowEnd = doualaIso(day, end);
  const errors = {
    route: from === to ? t.search.sameCity : null,
    window: end <= start ? t.request.windowInvalid : new Date(windowEnd).getTime() <= Date.now() ? m.departurePast : null,
    budget: budgetN !== null && (budgetN < 500 || budgetN > 60_000) ? m.budgetInvalid : null,
  };

  const submit = async () => {
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createRequest({
        originCity: from,
        destinationCity: to,
        windowStart: doualaIso(day, start),
        windowEnd,
        seats,
        maxBudgetPerSeat: budgetN,
        preferredPickup: pickup || null,
        needsLuggage: luggage,
        wantsAirConditioning: ac,
        notifyOnNewMatch: notify,
      });
      router.replace({ pathname: '/demande/[id]', params: { id: r.id } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cityOptions = cities.map((x) => ({ value: x.code as string, label: x.name }));
  const pickups = cities.find((x) => x.code === from)?.meetingPoints ?? [];

  return (
    <Screen footer={<PrimaryButton label={busy ? t.request.submitting : t.request.submit} busy={busy} onPress={submit} />}>
      <PageHeader title={t.request.title} fallback="/trajets" />
      <T style={{ color: c.muted }}>{t.request.subtitle}</T>

      <SectionTitle>{t.request.corridor}</SectionTitle>
      <SelectField plain label={t.common.from} value={cityName(cities, from)} onPress={() => setPicker('from')} />
      <SelectField plain label={t.common.to} value={cityName(cities, to)} onPress={() => setPicker('to')} />
      {attempted && errors.route ? <ErrorBox message={errors.route} /> : null}

      <SectionTitle>{t.request.window}</SectionTitle>
      <SelectField plain label={t.request.day} value={dayShort(day)} onPress={() => setPicker('day')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {WINDOWS.map(([s, e]) => (
          <Chip
            key={s}
            label={`${s} – ${e}`}
            on={start === s && end === e}
            onPress={() => {
              setStart(s);
              setEnd(e);
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SelectField plain style={{ flex: 1 }} label={t.request.windowStart} value={start} onPress={() => setPicker('start')} />
        <SelectField plain style={{ flex: 1 }} label={t.request.windowEnd} value={end} onPress={() => setPicker('end')} />
      </View>
      {attempted && errors.window ? <ErrorBox message={errors.window} /> : null}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <SelectField plain style={{ flex: 1 }} label={t.request.seats} value={seatsLabel(seats)} onPress={() => setPicker('seats')} />
        <View style={{ flex: 1.3 }}>
          <Field label={`${t.common.optional} · FCFA`} value={budget} onChangeText={(v) => setBudget(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" error={attempted ? errors.budget : null} />
        </View>
      </View>
      <T style={{ fontSize: 13, color: c.muted }}>{`${t.request.budget}. ${t.request.budgetHint}`}</T>

      <SelectField plain label={t.request.pickup} value={pickup || t.request.pickupAny} onPress={() => setPicker('pickup')} />

      <View style={{ paddingHorizontal: 4 }}>
        <CheckRow role="switch" checked={luggage} onToggle={() => setLuggage((v) => !v)} label={t.request.needsLuggage} />
        <CheckRow role="switch" checked={ac} onToggle={() => setAc((v) => !v)} label={t.request.wantsAc} />
        <CheckRow role="switch" checked={notify} onToggle={() => setNotify((v) => !v)} label={t.request.notify} />
      </View>

      <Notice>
        <T style={{ fontSize: 14, fontFamily: f.semi }}>{t.request.noAuto}</T>
      </Notice>
      {error ? <ErrorBox message={error} /> : null}

      {picker === 'from' ? <Sheet title={t.common.from} options={cityOptions} value={from} onPick={(v) => { setFrom(v); setPickup(''); }} onClose={() => setPicker(null)} /> : null}
      {picker === 'to' ? <Sheet title={t.common.to} options={cityOptions} value={to} onPick={setTo} onClose={() => setPicker(null)} /> : null}
      {picker === 'day' ? <Sheet title={t.request.day} options={nextDays(45).map((d) => ({ value: d, label: dayShort(d) }))} value={day} onPick={setDay} onClose={() => setPicker(null)} /> : null}
      {picker === 'start' ? <Sheet title={t.request.windowStart} options={TIMES.map((x) => ({ value: x, label: x }))} value={start} onPick={setStart} onClose={() => setPicker(null)} /> : null}
      {picker === 'end' ? <Sheet title={t.request.windowEnd} options={TIMES.map((x) => ({ value: x, label: x }))} value={end} onPick={setEnd} onClose={() => setPicker(null)} /> : null}
      {picker === 'seats' ? <Sheet title={t.request.seats} options={[1, 2, 3, 4].map((n) => ({ value: n, label: seatsLabel(n) }))} value={seats} onPick={setSeats} onClose={() => setPicker(null)} /> : null}
      {picker === 'pickup' ? <Sheet title={t.request.pickup} options={[{ value: '', label: t.request.pickupAny }, ...pickups.map((x) => ({ value: x, label: x }))]} value={pickup} onPick={setPickup} onClose={() => setPicker(null)} /> : null}
    </Screen>
  );
}

export default function NewRequest() {
  const { t, m } = useI18n();
  return <RequireAuth title={t.request.title} body={m.signInRequest}>{() => <Form />}</RequireAuth>;
}
