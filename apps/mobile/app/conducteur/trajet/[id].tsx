import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, type Booking, errorMessage, type TripDetail } from '../../../src/api';
import { addMinutes, dateKey, dayLong, initials, money, seats, time } from '../../../src/format';
import { fmt, useI18n } from '../../../src/i18n';
import { Chat, Check, Close, Delete, Key, MapPin, Play } from '../../../src/icons';
import { c, f, leaf, leafAlt } from '../../../src/theme';
import { Avatar, BottomSheet, ConfirmSheet, EmptyState, ErrorBox, GhostButton, Loading, Notice, PageHeader, Pill, PrimaryButton, RequireAuth, Screen, SectionTitle, T } from '../../../src/ui';

function CheckInSheet({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: (name: string) => void }) {
  const { t } = useI18n();
  const name = booking.passenger?.displayName ?? '—';
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));
  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.checkIn(booking.id, pin);
      onDone(name);
    } catch (e) {
      setError(errorMessage(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const key = { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.white } as const;
  return (
    <BottomSheet title={fmt(t.driver.checkInTitle, { name })} onClose={onClose}>
      <T style={{ fontSize: 14, color: c.muted }}>{t.driver.checkInHelp}</T>
      <View accessibilityLabel={`${pin.length}/4`} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: pin[i] ? c.lime : c.white, borderWidth: i === pin.length ? 2 : 1, borderColor: i === pin.length ? c.leaf : c.line }}>
            <Text style={{ fontFamily: f.display, fontSize: 26, color: c.ink }}>{pin[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row) => (
          <View key={row[0]} style={{ flexDirection: 'row', gap: 6 }}>
            {row.map((d) => (
              <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} onPress={() => press(d)} style={({ pressed }) => [key, pressed && { backgroundColor: c.sage }]}>
                <Text style={{ fontFamily: f.display, fontSize: 24, color: c.ink }}>{d}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.driver.checkInClear} onPress={() => setPin('')} style={key}>
            <T style={{ fontSize: 13, fontFamily: f.bold }}>{t.driver.checkInClear}</T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="0" onPress={() => press('0')} style={({ pressed }) => [key, pressed && { backgroundColor: c.sage }]}>
            <Text style={{ fontFamily: f.display, fontSize: 24, color: c.ink }}>0</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t.driver.checkInDelete} onPress={() => setPin((p) => p.slice(0, -1))} style={key}>
            <Delete size={24} />
          </Pressable>
        </View>
      </View>
      {error ? <ErrorBox message={error} /> : null}
      <PrimaryButton label={t.driver.checkInValidate} busy={busy} disabled={pin.length !== 4} icon={<Check size={20} stroke={2.6} />} onPress={validate} />
    </BottomSheet>
  );
}

function Inner({ tripId, published }: { tripId: string; published: boolean }) {
  const router = useRouter();
  const { t, m } = useI18n();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(published ? t.driver.published : null);
  const [dialog, setDialog] = useState<null | 'start' | 'arrival' | 'cancel'>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    try {
      const [tr, bk] = await Promise.all([api.trip(tripId), api.tripBookings(tripId)]);
      setTrip(tr);
      setBookings(bk);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tripId]);
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 8000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      setDialog(null);
      setFlash(message);
      await load();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!trip || !bookings) return error ? <Screen><PageHeader title={t.driver.tripManageTitle} fallback="/publier" /><ErrorBox message={error} onRetry={load} /></Screen> : <Loading />;

  const active = bookings.filter((b) => !['CANCELLED', 'SEAT_HELD', 'PAYMENT_PENDING', 'DRAFT'].includes(b.state));
  const canStart = trip.status === 'PUBLISHED' || trip.status === 'FULL';
  const canArrive = trip.status === 'DEPARTED';
  const canCancel = canStart && new Date(trip.departureAt).getTime() > Date.now();
  const arrival = trip.estimatedDurationMin ? time(addMinutes(trip.departureAt, trip.estimatedDurationMin)) : '--:--';

  return (
    <Screen onRefresh={load}>
      <PageHeader title={t.driver.tripManageTitle} fallback="/publier" />
      <View style={{ flexDirection: 'row' }}>
        <Pill label={t.trip.status[trip.status]} tone={trip.status === 'CANCELLED' ? 'danger' : trip.status === 'PUBLISHED' ? 'dark' : 'lime'} />
      </View>
      {flash ? <Notice icon={<Check size={18} color={c.leaf} />}>{flash}</Notice> : null}

      <View style={[leaf, { gap: 12, padding: 20, backgroundColor: c.forest }]}>
        <T style={{ fontSize: 13, fontFamily: f.bold, color: c.lime }}>{dayLong(dateKey(trip.departureAt))}</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontFamily: f.display, fontSize: 30, color: c.white }}>{time(trip.departureAt)}</Text>
            <T style={{ fontFamily: f.bold, color: c.white }}>{trip.origin.name}</T>
            <T style={{ fontSize: 13, color: c.onDark }}>{trip.meetingPoint}</T>
          </View>
          <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: f.display, fontSize: 30, color: c.onDark }}>{arrival}</Text>
            <T style={{ fontFamily: f.bold, color: c.white }}>{trip.destination.name}</T>
            <T style={{ fontSize: 13, color: c.onDark, textAlign: 'right' }}>{trip.dropoffPoint}</T>
          </View>
        </View>
        <T style={{ fontSize: 13, color: c.onDark }}>{`${money(trip.seatPrice)} / ${t.common.seat} · ${t.trip.status[trip.status]} · ${seats(trip.seatsAvailable)}`}</T>
      </View>

      {canStart ? <PrimaryButton label={t.driver.startTrip} icon={<Play size={18} />} onPress={() => { setActionError(null); setDialog('start'); }} /> : null}
      {canArrive ? <PrimaryButton label={t.driver.reportArrival} icon={<MapPin size={20} />} onPress={() => { setActionError(null); setDialog('arrival'); }} /> : null}

      <SectionTitle>{`${t.driver.passengers} (${active.length})`}</SectionTitle>
      {active.length === 0 ? <EmptyState title={t.driver.noPassengers} /> : null}
      {active.map((b) => {
        const name = b.passenger?.displayName ?? '—';
        const canMessage = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'DISPUTED', 'COMPLETED'].includes(b.state);
        return (
          <View key={b.id} style={[leafAlt, { gap: 10, padding: 16, backgroundColor: c.white }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar text={initials(name)} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <T style={{ fontFamily: f.bold }}>{name}</T>
                <T style={{ fontSize: 13, color: c.muted }}>{`${seats(b.seats)} · ${money(b.price.driverAmount)}`}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Pill label={t.ticket.states[b.state]} tone={b.state === 'DISPUTED' ? 'danger' : b.state === 'CHECKED_IN' || b.state === 'COMPLETED' ? 'dark' : 'sage'} />
              {b.payment ? <Pill label={t.paymentState[b.payment.state]} /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {b.state === 'CONFIRMED' && canStart ? <GhostButton style={{ flex: 1, backgroundColor: c.lime, borderColor: c.lime }} label={t.driver.checkIn} icon={<Key size={18} />} onPress={() => setCheckIn(b)} /> : null}
              {canMessage ? <GhostButton style={{ flex: 1 }} label={m.chatWriteShort} icon={<Chat size={18} />} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: b.id } })} /> : null}
            </View>
            {b.dispute ? <GhostButton label={t.ticket.seeDispute} onPress={() => router.push({ pathname: '/litige/[id]', params: { id: b.dispute!.id } })} /> : null}
          </View>
        );
      })}

      <Notice>{t.driver.arrivalBody}</Notice>
      {canCancel ? <GhostButton danger label={t.driver.cancelTrip} icon={<Close size={18} color={c.danger} />} onPress={() => { setActionError(null); setDialog('cancel'); }} /> : null}

      {dialog === 'start' ? <ConfirmSheet title={t.driver.startTitle} body={t.driver.startBody} confirmLabel={t.driver.startTrip} busy={busy} error={actionError} onConfirm={() => void act(() => api.startTrip(trip.id), t.driver.started)} onClose={() => setDialog(null)} /> : null}
      {dialog === 'arrival' ? <ConfirmSheet title={t.driver.arrivalTitle} body={t.driver.arrivalBody} confirmLabel={t.driver.reportArrival} busy={busy} error={actionError} onConfirm={() => void act(() => api.reportArrival(trip.id), t.driver.arrivalDone)} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <ConfirmSheet danger title={t.driver.cancelTripTitle} body={t.driver.cancelTripBody} confirmLabel={t.driver.cancelTrip} busy={busy} error={actionError} onConfirm={() => void act(() => api.cancelTrip(trip.id), t.trip.status.CANCELLED)} onClose={() => setDialog(null)} /> : null}
      {checkIn ? (
        <CheckInSheet
          booking={checkIn}
          onClose={() => setCheckIn(null)}
          onDone={(name) => {
            setCheckIn(null);
            setFlash(fmt(t.driver.checkInDone, { name }));
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

export default function ManageTrip() {
  const { t, m } = useI18n();
  const p = useLocalSearchParams<{ id: string; published?: string }>();
  return <RequireAuth title={t.driver.tripManageTitle} body={m.signInDriver}>{() => <Inner tripId={p.id} published={p.published === '1'} />}</RequireAuth>;
}
