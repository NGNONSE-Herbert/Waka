import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { api, errorMessage, type Match, type TravelRequest } from '../../src/api';
import { cityName, useCities } from '../../src/cities';
import { dateKey, dayShort, money, seats, time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { ScoreRing, Trash } from '../../src/icons';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { TripCard } from '../../src/TripCard';
import { ConfirmSheet, EmptyState, ErrorBox, GhostButton, H, Loading, PageHeader, Pill, PrimaryButton, RequireAuth, Screen, SectionTitle, T } from '../../src/ui';

function MatchCard({ match, requestSeats }: { match: Match; requestSeats: number }) {
  const router = useRouter();
  const { t } = useI18n();
  const score = Math.round(match.score);
  const factor = (x: string) => (t.request.factors as Record<string, string>)[x] ?? x;
  return (
    <View style={{ gap: 10 }}>
      <TripCard showDate trip={match.trip} onPress={() => router.push({ pathname: '/trajet/[id]', params: { id: match.trip.id, seats: String(requestSeats) } })} />
      <View style={[leafAlt, { gap: 12, padding: 16, backgroundColor: c.white }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 68, height: 68, alignItems: 'center', justifyContent: 'center' }}>
            <ScoreRing score={score} label={`${t.request.score} : ${fmt(t.request.scoreOf, { n: score })}`} />
            <Text style={{ position: 'absolute', fontFamily: f.display, fontSize: 19, color: c.ink }}>{score}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <H style={{ fontSize: 17 }}>{t.request.whyTitle}</H>
            <T style={{ fontSize: 12, color: c.muted }}>{fmt(t.request.algoVersion, { v: match.version })}</T>
          </View>
        </View>
        {match.explanations.map((ex) => (
          <View key={ex.factor} style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T style={{ fontSize: 14, fontFamily: f.semi }}>{factor(ex.factor)}</T>
              <T style={{ fontSize: 12, color: c.muted }}>{fmt(t.request.weight, { w: Math.round(ex.weight * 100) })}</T>
            </View>
            <View style={{ height: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: c.sage }}>
              <View style={{ width: `${Math.round(ex.score * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: ex.score >= 0.5 ? c.leaf : c.dots }} />
            </View>
            <T style={{ fontSize: 12, color: c.muted }}>{ex.reason}</T>
          </View>
        ))}
        <PrimaryButton label={t.request.seeTrip} onPress={() => router.push({ pathname: '/trajet/[id]', params: { id: match.trip.id, seats: String(requestSeats) } })} />
      </View>
    </View>
  );
}

function Inner({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const cities = useCities();
  const [req, setReq] = useState<TravelRequest | null | undefined>(undefined);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mine, list] = await Promise.all([api.myRequests(), api.matches(requestId)]);
      setReq(mine.find((r) => r.id === requestId) ?? null);
      setMatches([...list].sort((a, b) => b.score - a.score));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [requestId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cancel = async () => {
    setBusy(true);
    setCancelError(null);
    try {
      await api.cancelRequest(requestId);
      setCancelOpen(false);
      router.replace('/trajets');
    } catch (e) {
      setCancelError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !matches) return <Screen><PageHeader title={t.request.matchesTitle} fallback="/trajets" /><ErrorBox message={error} onRetry={load} /></Screen>;
  if (!matches || req === undefined) return <Loading />;

  return (
    <Screen onRefresh={load}>
      <PageHeader title={t.myTrips.requests} fallback="/trajets" />
      {req ? (
        <View style={[leaf, { gap: 8, padding: 20, backgroundColor: c.forest }]}>
          <Pill label={t.myTrips.requestStatus[req.status]} tone="lime" />
          <Text style={{ fontFamily: f.display, fontSize: 26, lineHeight: 29, letterSpacing: -0.6, color: c.white }}>{`${cityName(cities, req.originCity)} → ${cityName(cities, req.destinationCity)}`}</Text>
          <T style={{ fontSize: 14, color: c.onDark }}>
            {`${dayShort(dateKey(req.windowStart))} · ${time(req.windowStart)}–${time(req.windowEnd)} · ${seats(req.seats)}${req.maxBudgetPerSeat ? ` · ≤ ${money(req.maxBudgetPerSeat)}` : ''}`}
          </T>
          <T style={{ fontSize: 13, color: c.lime }}>{t.request.noAuto}</T>
        </View>
      ) : (
        <ErrorBox message={t.request.notFound} />
      )}

      <SectionTitle>{t.request.matchesTitle}</SectionTitle>
      <T style={{ fontSize: 14, color: c.muted }}>{t.request.matchesSubtitle}</T>
      {matches.length === 0 ? <EmptyState title={t.request.noMatchesTitle} body={t.request.noMatchesBody} /> : null}
      {matches.map((x) => <MatchCard key={x.trip.id} match={x} requestSeats={req?.seats ?? 1} />)}

      {req?.status === 'ACTIVE' ? <GhostButton danger label={t.request.cancelRequest} icon={<Trash size={18} color={c.danger} />} onPress={() => setCancelOpen(true)} /> : null}
      {cancelOpen ? <ConfirmSheet danger title={t.request.cancelRequest} body={t.request.noMatchesBody} confirmLabel={t.request.cancelRequest} busy={busy} error={cancelError} onConfirm={() => void cancel()} onClose={() => setCancelOpen(false)} /> : null}
    </Screen>
  );
}

export default function RequestDetail() {
  const { t, m } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RequireAuth title={t.request.title} body={m.signInRequest}>{() => <Inner requestId={id} />}</RequireAuth>;
}
