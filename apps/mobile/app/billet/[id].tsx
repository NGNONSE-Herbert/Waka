import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, type Booking, errorMessage } from '../../src/api';
import { addMinutes, dateKey, dayShort, money, time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Chat, Check, Chevron, Flag, RouteSquiggle, Scale, Shield, TicketCanopy, Undo } from '../../src/icons';
import { PillBar } from '../../src/PillBar';
import { c, f, leafAlt, shadow } from '../../src/theme';
import { ConfirmSheet, ErrorBox, GhostButton, H, Loading, Notice, PrimaryButton, Screen, T } from '../../src/ui';

const CHAT_STATES = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'DISPUTED', 'COMPLETED'];
const DISPUTE_STATES = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED'];

export default function TicketScreen() {
  const router = useRouter();
  const { t, m } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [policy, setPolicy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setB(await api.booking(id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  // Le billet suit l'avancement du trajet tant qu'il est affiché.
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 5000);
      return () => clearInterval(timer);
    }, [load]),
  );

  if (!b) return error ? <Screen tabbed><ErrorBox message={error} onRetry={load} /></Screen> : <Loading />;

  const trip = b.trip;
  const driver = trip.driver.displayName;
  const arrival = trip.estimatedDurationMin ? time(addMinutes(trip.departureAt, trip.estimatedDurationMin)) : '--:--';
  const digits = (b.boardingPin ?? '').split('');
  const toArrival = () => router.push({ pathname: '/arrivee/[id]', params: { id: b.id } });
  const toConfirm = b.state === 'ARRIVAL_REPORTED' && !b.passengerConfirmedAt;
  const canPay = b.state === 'SEAT_HELD' || b.state === 'PAYMENT_PENDING';
  const canCancel = b.state === 'SEAT_HELD' || b.state === 'CONFIRMED';
  const canDispute = !b.dispute && DISPUTE_STATES.includes(b.state);
  const canChat = CHAT_STATES.includes(b.state);
  const cancelled = b.state === 'CANCELLED';

  const openCancel = () => {
    setActionError(null);
    setCancelOpen(true);
    if (!policy) {
      api
        .trip(trip.id)
        .then((d) => setPolicy(d.cancellationPolicySummary))
        .catch(() => {});
    }
  };

  const cancel = async () => {
    setBusy(true);
    setActionError(null);
    try {
      setB(await api.cancelBooking(b.id));
      setCancelOpen(false);
      setFlash(t.ticket.cancelled);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen tabbed onRefresh={load}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}>
          <H style={{ fontSize: 30 }}>{t.ticket.title}</H>
          <View accessibilityLiveRegion="polite" style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: cancelled ? c.dangerBg : c.forest }}>
            {cancelled ? null : <Check size={14} color={c.lime} />}
            <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontFamily: f.bold, color: cancelled ? c.danger : c.lime }}>{t.ticket.states[b.state]}</T>
          </View>
        </View>

        {error ? <ErrorBox message={error} onRetry={load} /> : null}
        {flash ? <Notice icon={<Check size={18} color={c.leaf} />}>{flash}</Notice> : null}

        <View style={[shadow, { borderTopLeftRadius: 56, borderTopRightRadius: 14, borderBottomRightRadius: 56, borderBottomLeftRadius: 14, backgroundColor: c.white }]}>
          <View style={{ overflow: 'hidden', gap: 14, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 20, borderTopLeftRadius: 56, borderTopRightRadius: 14, backgroundColor: c.forest }}>
            <TicketCanopy />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontFamily: f.display, fontSize: 36, lineHeight: 38, letterSpacing: -1, color: c.white }}>{trip.origin.code}</Text>
                <T numberOfLines={1} style={{ fontSize: 13, color: c.onDark }}>{`${trip.origin.name} · ${time(trip.departureAt)}`}</T>
              </View>
              <RouteSquiggle />
              <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: f.display, fontSize: 36, lineHeight: 38, letterSpacing: -1, color: c.white }}>{trip.destination.code}</Text>
                <T numberOfLines={1} style={{ fontSize: 13, color: c.onDark }}>{`${trip.destination.name} · ≈ ${arrival}`}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              {[[t.common.date, dayShort(dateKey(trip.departureAt))], [t.ticket.seats, String(b.seats)], [t.trip.meetingPoint, trip.meetingPoint]].map(([k, v]) => (
                <View key={k} style={{ flexShrink: 1, gap: 2 }}>
                  <T numberOfLines={1} style={{ fontSize: 13, color: c.onDarkMuted }}>{k}</T>
                  <T numberOfLines={1} style={{ fontSize: 13, fontFamily: f.bold, color: c.white }}>{v}</T>
                </View>
              ))}
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 12, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24 }}>
            <T style={{ fontFamily: f.bold, fontSize: 14, color: c.forestSoft }}>{t.ticket.pin}</T>
            {digits.length ? (
              <View accessibilityLabel={`${t.ticket.pin} ${digits.join(' ')}`} style={{ flexDirection: 'row', gap: 10 }}>
                {digits.map((d, i) => (
                  <View key={i} style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: c.lime }}>
                    <Text style={{ fontFamily: f.display, fontSize: 30, color: c.ink }}>{d}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <T style={{ color: c.muted, textAlign: 'center' }}>{canPay ? t.ticket.pinHidden : m.pinUsed}</T>
            )}
            {digits.length ? <T style={{ fontSize: 13, textAlign: 'center', color: c.muted }}>{fmt(m.pinGive, { name: driver })}</T> : null}
          </View>
        </View>

        {canPay ? <PrimaryButton label={t.ticket.payNow} onPress={() => router.push({ pathname: '/paiement/[id]', params: { id: b.id } })} /> : null}

        {b.dispute ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/litige/[id]', params: { id: b.dispute!.id } })} style={[leafAlt, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: c.dangerBg }]}>
            <Scale size={22} color={c.danger} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: f.bold }}>{t.ticket.disputeOngoing}</T>
              <T style={{ fontSize: 13, color: c.muted }}>{`${t.dispute.states[b.dispute.state]} · ${t.ticket.seeDispute}`}</T>
            </View>
            <Chevron size={18} color={c.danger} />
          </Pressable>
        ) : null}

        {!canPay && !cancelled ? (
          <Pressable accessibilityRole="button" onPress={toArrival} style={[leafAlt, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: toConfirm ? c.lime : c.sage }]}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.white }}>
              <Shield size={22} color={c.leaf} stroke={2} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: f.bold }}>{toConfirm ? t.ticket.confirmArrivalCta : (b.payment ? t.paymentState[b.payment.state] : m.trackTrip)}</T>
              <T style={{ fontSize: 13, color: c.muted }}>{fmt(m.paidAfter, { amount: money(b.price.driverAmount) })}</T>
            </View>
            <Chevron size={18} color={c.forest} />
          </Pressable>
        ) : null}

        {canChat || canDispute ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canChat ? <GhostButton style={{ flex: 1 }} label={m.chatWriteShort} icon={<Chat size={18} />} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: b.id } })} /> : null}
            {canDispute ? <GhostButton style={{ flex: 1 }} label={t.ticket.report} icon={<Flag size={18} />} onPress={() => router.push({ pathname: '/probleme/[id]', params: { id: b.id } })} /> : null}
          </View>
        ) : null}

        {canCancel ? <GhostButton danger label={t.ticket.cancel} icon={<Undo size={18} color={c.danger} />} onPress={openCancel} /> : null}
      </Screen>
      <PillBar active="trajets" />
      {cancelOpen ? (
        <ConfirmSheet
          title={t.ticket.cancelTitle}
          body={`${policy ? `${policy}\n\n` : ''}${t.ticket.cancelBody}`}
          confirmLabel={t.ticket.cancelConfirm}
          danger
          busy={busy}
          error={actionError}
          onConfirm={() => void cancel()}
          onClose={() => setCancelOpen(false)}
        />
      ) : null}
    </View>
  );
}
