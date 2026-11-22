import { quote } from '@waka/domain';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { api, errorMessage, type Me } from '../../src/api';
import { routeLabel, useCities } from '../../src/cities';
import { addDays, amount, dateKey, dayShort, doualaIso, money, nextDays, seats as seatsLabel, TIMES } from '../../src/format';
import { useI18n } from '../../src/i18n';
import { Plus, Swap } from '../../src/icons';
import { c, f, leaf } from '../../src/theme';
import { Chip, CheckRow, EmptyState, ErrorBox, Field, GhostButton, PageHeader, PrimaryButton, RequireAuth, Row, Screen, SectionTitle, SelectField, Sheet, T } from '../../src/ui';

type Luggage = 'NONE' | 'SMALL' | 'MEDIUM' | 'LARGE';
type Picker = 'vehicle' | 'from' | 'to' | 'date' | 'time' | 'seats' | 'luggage' | null;
const LUGGAGE: Luggage[] = ['NONE', 'SMALL', 'MEDIUM', 'LARGE'];

function Form({ me }: { me: Me }) {
  const router = useRouter();
  const { t, m } = useI18n();
  const cities = useCities();
  const vehicles = useMemo(() => me.vehicles.filter((v) => v.reviewStatus === 'APPROVED'), [me.vehicles]);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [from, setFrom] = useState<string>('DLA');
  const [to, setTo] = useState<string>('YDE');
  const [date, setDate] = useState(() => addDays(dateKey(), 1));
  const [hour, setHour] = useState('07:00');
  const [meeting, setMeeting] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState('5000');
  const [luggage, setLuggage] = useState<Luggage>('MEDIUM');
  const [ac, setAc] = useState(true);
  const [rules, setRules] = useState<string[]>([]);
  const [customRule, setCustomRule] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const maxSeats = Math.min(8, Math.max(1, vehicle?.seatsTotal ?? 4));
  const seatCount = Math.min(seats, maxSeats);
  const priceN = Number(price);
  const departure = doualaIso(date, hour);

  const preview = useMemo(() => {
    try {
      return quote(priceN, 1);
    } catch {
      return null;
    }
  }, [priceN]);

  const errors = {
    route: from === to ? t.search.sameCity : null,
    when: new Date(departure).getTime() <= Date.now() ? m.departurePast : null,
    meeting: meeting.trim().length < 3 ? m.fieldShort : null,
    dropoff: dropoff.trim().length < 3 ? m.fieldShort : null,
    price: !Number.isInteger(priceN) || priceN < 500 || priceN > 50_000 || priceN % 50 !== 0 ? t.driver.seatPriceHint : null,
  };
  const show = (e: string | null) => (attempted ? e : null);

  const toggleRule = (r: string) => setRules((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : cur.length >= 6 ? cur : [...cur, r]));
  const addCustom = () => {
    const r = customRule.trim();
    if (!r || rules.length >= 6) return;
    if (!rules.includes(r)) setRules((cur) => [...cur, r]);
    setCustomRule('');
  };

  const submit = async () => {
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      const trip = await api.createTrip({
        vehicleId,
        originCity: from as never,
        destinationCity: to as never,
        departureAt: departure,
        meetingPoint: meeting.trim(),
        dropoffPoint: dropoff.trim(),
        seats: seatCount,
        seatPrice: priceN,
        luggage,
        airConditioning: ac,
        rules,
      });
      router.replace({ pathname: '/conducteur/trajet/[id]', params: { id: trip.id, published: '1' } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cityOptions = cities.map((x) => ({ value: x.code as string, label: x.name }));
  const originPoints = cities.find((x) => x.code === from)?.meetingPoints ?? [];
  const destPoints = cities.find((x) => x.code === to)?.meetingPoints ?? [];
  const presets = [...t.driver.rulePresets, ...rules.filter((r) => !t.driver.rulePresets.includes(r))];

  return (
    <Screen footer={<PrimaryButton label={busy ? t.driver.publishing : t.driver.publish} busy={busy} onPress={submit} />}>
      <PageHeader title={t.driver.publishTitle} fallback="/publier" />
      <T style={{ color: c.muted }}>{t.driver.publishSubtitle}</T>

      <SectionTitle>{m.publishRoute}</SectionTitle>
      <SelectField plain label={t.driver.vehicleSelect} value={vehicle?.label ?? '—'} onPress={() => setPicker('vehicle')} />
      <View style={{ gap: 8 }}>
        <SelectField plain label={t.common.from} value={cityOptions.find((x) => x.value === from)?.label ?? from} onPress={() => setPicker('from')} />
        <SelectField plain label={t.common.to} value={cityOptions.find((x) => x.value === to)?.label ?? to} onPress={() => setPicker('to')} />
        <GhostButton
          label={t.common.swap}
          icon={<Swap size={16} />}
          onPress={() => {
            setFrom(to);
            setTo(from);
            setMeeting(dropoff);
            setDropoff(meeting);
          }}
        />
        {show(errors.route) ? <ErrorBox message={errors.route!} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SelectField plain style={{ flex: 1.4 }} label={t.driver.departureDate} value={dayShort(date)} onPress={() => setPicker('date')} />
        <SelectField plain style={{ flex: 1 }} label={t.driver.departureTime} value={hour} onPress={() => setPicker('time')} />
      </View>
      {show(errors.when) ? <ErrorBox message={errors.when!} /> : null}

      <SectionTitle>{m.publishPlaces}</SectionTitle>
      <Field label={t.driver.meetingPoint} value={meeting} onChangeText={setMeeting} maxLength={120} error={show(errors.meeting)} />
      {originPoints.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {originPoints.map((p) => <Chip key={p} label={p} on={meeting === p} onPress={() => setMeeting(p)} />)}
        </View>
      ) : null}
      <Field label={t.driver.dropoffPoint} value={dropoff} onChangeText={setDropoff} maxLength={120} error={show(errors.dropoff)} />
      {destPoints.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {destPoints.map((p) => <Chip key={p} label={p} on={dropoff === p} onPress={() => setDropoff(p)} />)}
        </View>
      ) : null}

      <SectionTitle>{m.publishOffer}</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <SelectField plain style={{ flex: 1 }} label={t.driver.seatsOffered} value={seatsLabel(seatCount)} onPress={() => setPicker('seats')} />
        <View style={{ flex: 1.2 }}>
          <Field label={`${t.driver.seatPrice} (FCFA)`} value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" error={show(errors.price)} />
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[leaf, { gap: 8, padding: 20, backgroundColor: c.forest }]}>
        <T style={{ fontSize: 13, fontFamily: f.bold, color: c.lime }}>{t.driver.previewTitle}</T>
        {preview ? (
          <>
            <T style={{ fontSize: 13, color: c.onDark }}>{t.driver.previewPassenger}</T>
            <Text style={{ fontFamily: f.display, fontSize: 36, letterSpacing: -1, color: c.lime }}>
              {amount(preview.total)} <Text style={{ fontSize: 15, color: c.white }}>FCFA</Text>
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T style={{ fontSize: 14, color: c.onDark }}>{t.driver.previewYou}</T>
              <T style={{ fontSize: 14, fontFamily: f.bold, color: c.white }}>{money(preview.driverAmount)}</T>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T style={{ fontSize: 14, color: c.onDark }}>{t.driver.previewFee}</T>
              <T style={{ fontSize: 14, fontFamily: f.bold, color: c.white }}>{money(preview.serviceFee)}</T>
            </View>
            <T style={{ fontSize: 12, color: c.onDarkMuted }}>{t.driver.previewNote}</T>
          </>
        ) : (
          <T style={{ fontSize: 14, color: c.onDark }}>{t.driver.previewInvalid}</T>
        )}
      </View>

      <SectionTitle>{m.publishOptions}</SectionTitle>
      <SelectField plain label={t.driver.luggage} value={t.luggage[luggage]} onPress={() => setPicker('luggage')} />
      <CheckRow role="switch" checked={ac} onToggle={() => setAc((v) => !v)} label={t.driver.ac} />
      <T style={{ fontFamily: f.bold }}>{t.driver.rules}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {presets.map((r) => <Chip key={r} label={r} on={rules.includes(r)} onPress={() => toggleRule(r)} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label={t.driver.customRule} value={customRule} onChangeText={setCustomRule} maxLength={80} onSubmitEditing={addCustom} {...(rules.length >= 6 ? { hint: m.ruleLimit } : {})} />
        </View>
        <GhostButton style={{ height: 58, borderRadius: 20 }} label={m.ruleAdd} icon={<Plus size={16} />} disabled={!customRule.trim() || rules.length >= 6} onPress={addCustom} />
      </View>

      <View style={{ gap: 6, padding: 16, borderRadius: 20, backgroundColor: c.white }}>
        <T style={{ fontFamily: f.display, fontSize: 16 }}>{routeLabel(cities, from, to)}</T>
        <Row label={t.driver.departureDate} value={`${dayShort(date)} · ${hour}`} />
        <Row label={t.driver.seatsOffered} value={seatsLabel(seatCount)} />
      </View>
      {error ? <ErrorBox message={error} /> : null}

      {picker === 'vehicle' ? <Sheet title={t.driver.vehicleSelect} options={vehicles.map((v) => ({ value: v.id, label: v.label }))} value={vehicleId} onPick={setVehicleId} onClose={() => setPicker(null)} /> : null}
      {picker === 'from' ? <Sheet title={t.common.from} options={cityOptions} value={from} onPick={setFrom} onClose={() => setPicker(null)} /> : null}
      {picker === 'to' ? <Sheet title={t.common.to} options={cityOptions} value={to} onPick={setTo} onClose={() => setPicker(null)} /> : null}
      {picker === 'date' ? <Sheet title={m.chooseDate} options={nextDays(60).map((d) => ({ value: d, label: dayShort(d) }))} value={date} onPick={setDate} onClose={() => setPicker(null)} /> : null}
      {picker === 'time' ? <Sheet title={m.chooseTime} options={TIMES.map((x) => ({ value: x, label: x }))} value={hour} onPick={setHour} onClose={() => setPicker(null)} /> : null}
      {picker === 'seats' ? <Sheet title={t.driver.seatsOffered} options={Array.from({ length: maxSeats }, (_, i) => ({ value: i + 1, label: seatsLabel(i + 1) }))} value={seatCount} onPick={setSeats} onClose={() => setPicker(null)} /> : null}
      {picker === 'luggage' ? <Sheet title={t.driver.luggage} options={LUGGAGE.map((x) => ({ value: x, label: t.luggage[x] }))} value={luggage} onPick={setLuggage} onClose={() => setPicker(null)} /> : null}
    </Screen>
  );
}

function Gate({ me }: { me: Me }) {
  const router = useRouter();
  const { t } = useI18n();
  const approved = me.vehicles.some((v) => v.reviewStatus === 'APPROVED');
  if (me.driverStatus !== 'VERIFIED' || !me.canPublishTrips || !approved) {
    const notVerified = me.driverStatus !== 'VERIFIED';
    return (
      <Screen>
        <PageHeader title={t.driver.publishTitle} fallback="/publier" />
        <EmptyState
          title={notVerified ? t.driver.notVerified : t.driver.noApprovedVehicle}
          {...(notVerified ? { body: t.driver.reviewBody } : {})}
          action={<PrimaryButton label={notVerified ? t.driver.title : t.driver.addVehicle} onPress={() => router.replace(notVerified ? '/publier' : '/conducteur/vehicule')} />}
        />
      </Screen>
    );
  }
  return <Form me={me} />;
}

export default function PublishScreen() {
  const { t, m } = useI18n();
  return <RequireAuth title={t.driver.publishTitle} body={m.signInDriver}>{(me) => <Gate me={me} />}</RequireAuth>;
}
