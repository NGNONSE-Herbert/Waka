import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, errorMessage, newKey, type TripDetail } from '../../src/api';
import { addMinutes, dateKey, dayLong, duration, initials, money, seats as seatsLabel, time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { CanopyHero, RouteDots, Shield } from '../../src/icons';
import { useSession } from '../../src/session';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { Avatar, BackButton, DottedLine, ErrorBox, Loading, Pill, PrimaryButton, Row, T } from '../../src/ui';

export default function TripScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t, m } = useI18n();
  const { user } = useSession();
  const p = useLocalSearchParams<{ id: string; seats?: string }>();
  const seats = Number(p.seats) || 1;
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  const load = useCallback(async () => {
    setError(null);
    try {
      setTrip(await api.trip(p.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [p.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const reserve = async () => {
    if (!user) {
      router.push('/connexion');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const booking = await api.book(p.id, seats, key.current);
      router.replace({ pathname: '/paiement/[id]', params: { id: booking.id } });
    } catch (e) {
      // Une erreur réseau garde la clé : le nouvel essai ne peut pas créer une seconde réservation.
      if (e instanceof ApiError && e.code !== 'NETWORK_ERROR') key.current = newKey();
      if (e instanceof ApiError && e.isAuth) router.push('/connexion');
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!trip) {
    return error ? (
      <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 16, gap: 12, backgroundColor: c.bg }}>
        <BackButton fallback="/" />
        <ErrorBox message={error} onRetry={load} />
      </View>
    ) : (
      <Loading />
    );
  }

  const q = trip.quoteForOneSeat;
  const chips = [trip.vehicle.airConditioning ? t.common.airConditioning : null, t.luggage[trip.vehicle.luggage], ...trip.rules].filter((x): x is string => !!x);
  const arrival = trip.estimatedDurationMin ? time(addMinutes(trip.departureAt, trip.estimatedDurationMin)) : '--:--';
  const bookable = trip.status === 'PUBLISHED' && trip.seatsAvailable >= seats;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 214, overflow: 'hidden', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, backgroundColor: c.mist }}>
          <CanopyHero width={width} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
            <BackButton size={48} bordered={false} />
            <View style={{ height: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.white }}>
              <T style={{ fontFamily: f.bold, fontSize: 14 }}>{dayLong(dateKey(trip.departureAt))}</T>
            </View>
          </View>
        </View>

        <View style={{ gap: 12, paddingTop: 18, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontFamily: f.display, fontSize: 34, lineHeight: 36, letterSpacing: -1, color: c.ink }}>{time(trip.departureAt)}</Text>
              <T style={{ marginTop: 6, fontFamily: f.bold, fontSize: 16 }}>{trip.origin.name}</T>
              <T style={{ fontSize: 13, color: c.muted }}>{trip.meetingPoint}</T>
            </View>
            <View style={{ alignItems: 'center', gap: 4, paddingTop: 8 }}>
              <RouteDots />
              <T style={{ fontSize: 12, fontFamily: f.bold, color: c.forestSoft }}>{`${duration(trip.estimatedDurationMin)}, ${t.common.estimate}`}</T>
            </View>
            <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: f.display, fontSize: 34, lineHeight: 36, letterSpacing: -1, color: c.ink }}>{arrival}</Text>
              <T style={{ marginTop: 6, fontFamily: f.bold, fontSize: 16 }}>{trip.destination.name}</T>
              <T style={{ fontSize: 13, color: c.muted, textAlign: 'right' }}>{trip.dropoffPoint}</T>
            </View>
          </View>

          <View style={[leaf, { gap: 12, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.white }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
              <Avatar text={initials(trip.driver.displayName)} size={48} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.bold, fontSize: 17 }}>{trip.driver.displayName}</T>
                  {trip.driver.isDemo ? <Pill label={t.common.demo} /> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {trip.driver.verified ? <Shield size={14} color={c.forestSoft} stroke={2.4} /> : null}
                  <T style={{ flexShrink: 1, fontSize: 13, fontFamily: f.semi, color: c.forestSoft }}>{trip.driver.verified ? t.trip.driverVerified : t.trip.driverNotVerified}</T>
                </View>
                {trip.driver.completedTrips > 0 ? (
                  <T style={{ fontSize: 13, color: c.muted }}>
                    {fmt(t.common.trips, { n: trip.driver.completedTrips })}
                    {trip.driver.rating ? ` · ${fmt(t.common.rating, { r: trip.driver.rating })}` : ''}
                  </T>
                ) : null}
              </View>
            </View>
            <DottedLine />
            <T style={{ fontSize: 14 }}>
              <T style={{ fontFamily: f.bold, fontSize: 14 }}>{trip.vehicle.label}</T>
              <T style={{ fontSize: 14, color: c.muted }}>{` · ${seatsLabel(trip.seatsAvailable)}`}</T>
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {chips.map((x) => (
                <View key={x} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.bg }}>
                  <T style={{ fontSize: 13, fontFamily: f.semi, color: c.forest }}>{x}</T>
                </View>
              ))}
            </View>
          </View>

          <View style={[leafAlt, { gap: 8, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.sage }]}>
            <Row label={t.trip.contribution} value={money(q.driverAmount)} />
            <Row label={t.trip.serviceFee} value={money(q.serviceFee)} />
            <T style={{ fontSize: 13, color: c.muted }}>{trip.cancellationPolicySummary}</T>
          </View>
          {!bookable ? <ErrorBox message={t.trip.notBookable} /> : null}
          {error ? <ErrorBox message={error} /> : null}
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 14 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: f.display, fontSize: 26, letterSpacing: -0.8, color: c.ink }}>{money(q.total)}</Text>
          <T style={{ fontSize: 13, color: c.muted }}>{seats > 1 ? fmt(m.totalNext, { n: seats }) : m.oneSeatAll}</T>
        </View>
        <PrimaryButton label={user ? t.trip.book : t.common.signIn} busy={busy} disabled={!bookable} onPress={reserve} />
      </View>
    </View>
  );
}
