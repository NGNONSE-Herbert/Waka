import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api, type Booking, errorMessage, type TravelRequest } from '../../src/api';
import { cityName, useCities } from '../../src/cities';
import { dateKey, dayShort, money, seats, time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Chevron, Plus } from '../../src/icons';
import { c, f, leaf } from '../../src/theme';
import { EmptyState, ErrorBox, GhostButton, H, Pill, PrimaryButton, RequireAuth, Screen, Segmented, T } from '../../src/ui';

type Tab = 'upcoming' | 'past' | 'requests';
const STILL_ACTIVE: Booking['state'][] = ['IN_PROGRESS', 'ARRIVAL_REPORTED', 'DISPUTED'];

function Inner() {
  const router = useRouter();
  const { t } = useI18n();
  const cities = useCities();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [requests, setRequests] = useState<TravelRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, r] = await Promise.all([api.myBookings(), api.myRequests()]);
      setBookings(b);
      setRequests(r);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { upcoming, past } = useMemo(() => {
    const all = bookings ?? [];
    const limit = Date.now() - 12 * 3_600_000;
    const up = all
      .filter((b) => !['COMPLETED', 'CANCELLED'].includes(b.state) && (new Date(b.trip.departureAt).getTime() > limit || STILL_ACTIVE.includes(b.state)))
      .sort((a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt));
    return { upcoming: up, past: all.filter((b) => !up.includes(b)).sort((a, b) => b.trip.departureAt.localeCompare(a.trip.departureAt)) };
  }, [bookings]);

  const open = (b: Booking) => {
    if (b.state === 'SEAT_HELD' || b.state === 'PAYMENT_PENDING') router.push({ pathname: '/paiement/[id]', params: { id: b.id } });
    else if (b.state === 'ARRIVAL_REPORTED' || b.state === 'COMPLETED') router.push({ pathname: '/arrivee/[id]', params: { id: b.id } });
    else router.push({ pathname: '/billet/[id]', params: { id: b.id } });
  };
  const newRequest = () => router.push('/demande/nouvelle');
  const shown = tab === 'upcoming' ? upcoming : past;
  const loading = !bookings && !error;

  return (
    <Screen tabbed onRefresh={load}>
      <H style={{ fontSize: 30 }}>{t.myTrips.title}</H>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: t.myTrips.upcoming, count: upcoming.length },
          { value: 'past', label: t.myTrips.past },
          { value: 'requests', label: t.myTrips.requests },
        ]}
      />
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading ? <ActivityIndicator color={c.leaf} size="large" style={{ marginTop: 32 }} accessibilityLabel={t.common.loading} /> : null}

      {bookings && tab !== 'requests' && shown.length === 0 ? (
        tab === 'upcoming' ? (
          <EmptyState title={t.myTrips.emptyUpcoming} body={t.myTrips.emptyUpcomingBody} action={<PrimaryButton label={t.myTrips.findTrip} onPress={() => router.navigate('/')} />} />
        ) : (
          <EmptyState title={t.myTrips.emptyPast} />
        )
      ) : null}

      {bookings && tab !== 'requests'
        ? shown.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" onPress={() => open(b)} style={[leaf, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.white }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <H style={{ fontSize: 18, letterSpacing: -0.3 }}>{`${b.trip.origin.name} → ${b.trip.destination.name}`}</H>
                <T style={{ fontSize: 13, color: c.muted }}>{`${dayShort(dateKey(b.trip.departureAt))} · ${time(b.trip.departureAt)} · ${money(b.price.total)}`}</T>
                <Pill label={t.ticket.states[b.state]} tone={b.state === 'ARRIVAL_REPORTED' ? 'lime' : b.state === 'DISPUTED' || b.state === 'CANCELLED' ? 'danger' : 'sage'} />
              </View>
              <Chevron size={18} color={c.forest} />
            </Pressable>
          ))
        : null}

      {tab === 'requests' && requests ? (
        <>
          <GhostButton label={t.myTrips.newRequest} icon={<Plus size={18} />} onPress={newRequest} />
          {requests.length === 0 ? <EmptyState title={t.myTrips.emptyRequests} body={t.myTrips.emptyRequestsBody} /> : null}
          {requests.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/demande/[id]', params: { id: r.id } })} style={[leaf, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.white }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <H style={{ fontSize: 18, letterSpacing: -0.3 }}>{`${cityName(cities, r.originCity)} → ${cityName(cities, r.destinationCity)}`}</H>
                <T style={{ fontSize: 13, color: c.muted }}>{`${dayShort(dateKey(r.windowStart))} · ${time(r.windowStart)}–${time(r.windowEnd)} · ${seats(r.seats)}`}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Pill label={t.myTrips.requestStatus[r.status]} tone={r.status === 'ACTIVE' ? 'dark' : 'sage'} />
                  {r.status === 'ACTIVE' ? <Pill label={fmt(t.myTrips.matches, { n: r.matchCount })} tone="lime" /> : null}
                </View>
              </View>
              <Chevron size={18} color={c.forest} />
            </Pressable>
          ))}
        </>
      ) : null}
      {bookings ? <T style={{ fontSize: 12, fontFamily: f.medium, color: c.muted }}>{t.demo.banner}</T> : null}
    </Screen>
  );
}

export default function MyTrips() {
  const { t, m } = useI18n();
  return <RequireAuth tabbed title={t.myTrips.title} body={m.signInTrips}>{() => <Inner />}</RequireAuth>;
}
