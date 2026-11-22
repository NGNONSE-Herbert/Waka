import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { api, errorMessage, type TripSummary } from '../src/api';
import { addDays, dateKey, dayParts, dayShort, seats as seatsLabel } from '../src/format';
import { fmt, useI18n } from '../src/i18n';
import { Chevron } from '../src/icons';
import { c, f } from '../src/theme';
import { TripCard } from '../src/TripCard';
import { BackButton, EmptyState, ErrorBox, GhostButton, H, Pill, PrimaryButton, Screen, T } from '../src/ui';

type Params = { from: string; to: string; date: string; seats: string; fromName: string; toName: string };

export default function Results() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const p = useLocalSearchParams<Params>();
  const seats = Number(p.seats) || 1;
  const [date, setDate] = useState(p.date);
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTrips(null);
    setCursor(null);
    setError(null);
    try {
      const r = await api.search({ from: p.from, to: p.to, date, seats });
      setTrips(r.items);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [p.from, p.to, date, seats]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const r = await api.search({ from: p.from, to: p.to, date, seats, cursor });
      setTrips((cur) => [...(cur ?? []), ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  };

  const days = useMemo(() => {
    const today = dateKey();
    const yesterday = addDays(p.date, -1);
    const first = yesterday < today ? today : yesterday;
    return [0, 1, 2, 3].map((n) => addDays(first, n));
    // La langue change les libellés affichés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.date, locale]);

  const request = () => router.push({ pathname: '/demande/nouvelle', params: { from: p.from, to: p.to, date, seats: String(seats) } });

  return (
    <Screen onRefresh={load}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <BackButton label={t.common.back} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.search.modify}
          onPress={() => router.back()}
          style={{ flex: 1, height: 52, justifyContent: 'center', paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.white }}
        >
          <H numberOfLines={1} style={{ fontSize: 17, letterSpacing: -0.3 }}>{`${p.fromName} → ${p.toName}`}</H>
          <T style={{ fontSize: 12, color: c.muted }}>{`${dayShort(date)} · ${seatsLabel(seats)}`}</T>
        </Pressable>
      </View>

      <View accessibilityLabel={t.common.date} style={{ flexDirection: 'row', gap: 8 }}>
        {days.map((d) => {
          const on = d === date;
          const { name, num } = dayParts(d);
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={dayShort(d)}
              accessibilityState={{ selected: on }}
              onPress={() => setDate(d)}
              style={{ flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: on ? 0 : 1, borderColor: c.line, backgroundColor: on ? c.forest : c.white }}
            >
              <T style={{ fontSize: 12, fontFamily: f.semi, color: on ? c.lime : c.muted }}>{name}</T>
              <Text style={{ fontFamily: f.display, fontSize: 18, color: on ? c.white : c.ink }}>{num}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!trips && !error ? <ActivityIndicator color={c.leaf} size="large" style={{ marginVertical: 40 }} accessibilityLabel={t.common.loading} /> : null}

      {trips?.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T style={{ fontSize: 13, fontFamily: f.semi, color: c.muted }}>{`${fmt(t.search.resultsCount, { n: trips.length })} · ${t.common.feesIncluded}`}</T>
          {trips.some((x) => x.driver.isDemo) ? <Pill label={t.common.demo} /> : null}
        </View>
      ) : null}

      {trips?.length === 0 ? <EmptyState title={t.search.emptyTitle} body={t.search.emptyBody} action={<PrimaryButton label={t.search.emptyCta} onPress={request} />} /> : null}

      {trips?.map((x) => <TripCard key={x.id} trip={x} onPress={() => router.push({ pathname: '/trajet/[id]', params: { id: x.id, seats: String(seats) } })} />)}

      {cursor ? <GhostButton label={more ? t.search.loadingMore : t.search.loadMore} disabled={more} onPress={() => void loadMore()} /> : null}

      {trips?.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={request}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 26, borderWidth: 2, borderStyle: 'dotted', borderColor: c.dots }}
        >
          <T style={{ flex: 1, fontSize: 14, fontFamily: f.bold, color: c.forest }}>{t.search.emptyCta}</T>
          <Chevron size={18} color={c.forest} />
        </Pressable>
      ) : null}
    </Screen>
  );
}
