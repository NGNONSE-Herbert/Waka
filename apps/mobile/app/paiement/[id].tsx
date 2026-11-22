import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, type Booking, errorMessage, newKey, type PaymentChannel } from '../../src/api';
import { dateKey, dayShort, money, seats, time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Clock, Hourglass, Phone, Shield } from '../../src/icons';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { BackButton, CheckRow, EmptyState, ErrorBox, Field, GhostButton, H, Loading, Notice, Pill, PrimaryButton, Row, Screen, T } from '../../src/ui';

const METHODS: { id: PaymentChannel; name: string; radius: object }[] = [
  { id: 'MTN_MOMO', name: 'MTN MoMo', radius: { borderTopLeftRadius: 28, borderTopRightRadius: 8, borderBottomRightRadius: 28, borderBottomLeftRadius: 8 } },
  { id: 'ORANGE_MONEY', name: 'Orange Money', radius: { borderTopLeftRadius: 8, borderTopRightRadius: 28, borderBottomRightRadius: 8, borderBottomLeftRadius: 28 } },
];
const PAID = ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED', 'DISPUTED'];

function useCountdown(target: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const left = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` };
}

export default function PaymentScreen() {
  const router = useRouter();
  const { t, m } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [channel, setChannel] = useState<PaymentChannel>('MTN_MOMO');
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef({ scope: '', value: newKey() });
  const leaving = useRef(false);

  const load = useCallback(async () => {
    try {
      const b = await api.booking(id);
      setBooking(b);
      // Le suivi et la simulation peuvent répondre en même temps : on ne quitte l'écran qu'une fois.
      if (PAID.includes(b.state) && !leaving.current) {
        leaving.current = true;
        router.replace({ pathname: '/billet/[id]', params: { id: b.id } });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, router]);
  useEffect(() => {
    void load();
  }, [load]);

  const payment = booking?.payment ?? null;
  const pending = payment?.state === 'CREATED' || payment?.state === 'PSP_PENDING';
  // Réponse incertaine du partenaire : surtout ne pas proposer de payer une seconde fois.
  const manual = payment?.state === 'MANUAL_REVIEW';
  useEffect(() => {
    if (!pending && !manual) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [pending, manual, load]);

  const countdown = useCountdown(pending || manual ? null : (booking?.holdExpiresAt ?? null));
  const cancelled = booking?.state === 'CANCELLED';
  const expired = countdown?.left === 0 || cancelled;

  const pay = async () => {
    const payer = phone.replace(/[^\d+]/g, '');
    const scope = `${channel}:${payer}:${payment?.id ?? 'first'}`;
    if (key.current.scope !== scope) key.current = { scope, value: newKey() };
    setBusy(true);
    setError(null);
    try {
      await api.pay(id, channel, payer, key.current.value);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (outcome: 'SUCCEEDED' | 'FAILED') => {
    if (!payment?.mockProviderRef) return;
    setBusy(true);
    setError(null);
    try {
      await api.mockComplete(payment.mockProviderRef, outcome);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!booking) return error ? <Screen><BackButton fallback="/trajets" /><ErrorBox message={error} onRetry={load} /></Screen> : <Loading />;

  const trip = booking.trip;
  const total = money(booking.price.total);
  const canPay = !pending && !manual && !expired;

  return (
    <Screen
      footer={
        canPay ? (
          <View style={{ gap: 10 }}>
            <PrimaryButton label={busy ? t.payment.paying : fmt(t.payment.pay, { amount: total })} busy={busy} disabled={!accepted || phone.replace(/\D/g, '').length < 9} onPress={pay} />
            <T style={{ fontSize: 12, textAlign: 'center', color: c.muted }}>{t.payment.channelNote}</T>
          </View>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton fallback="/trajets" />
        <H style={{ flex: 1, fontSize: 28 }}>{t.payment.title}</H>
        {countdown && !expired ? (
          <View accessibilityLabel={fmt(t.payment.holdCountdown, { time: countdown.label })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.lime }}>
            <Clock size={16} />
            <T style={{ fontSize: 13, fontFamily: f.bold }}>{countdown.label}</T>
          </View>
        ) : null}
      </View>

      {!pending && !manual ? (
        <T style={{ fontSize: 13, fontFamily: f.semi, color: expired ? c.danger : c.forestSoft }}>{expired ? t.payment.holdExpired : m.payHold}</T>
      ) : null}

      <View style={[leaf, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 18, paddingHorizontal: 20, backgroundColor: c.forest }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: f.display, fontSize: 19, letterSpacing: -0.4, color: c.white }}>{`${trip.origin.name} → ${trip.destination.name}`}</Text>
          <T style={{ fontSize: 13, color: c.onDark }}>{`${dayShort(dateKey(trip.departureAt))} · ${time(trip.departureAt)} · ${seats(booking.seats)}`}</T>
        </View>
        <Text style={{ fontFamily: f.display, fontSize: 22, letterSpacing: -0.4, color: c.lime }}>{total}</Text>
      </View>

      {cancelled ? (
        <EmptyState title={t.payment.cancelledTitle} body={t.payment.cancelledBody} action={<GhostButton label={t.payment.holdExpiredCta} onPress={() => router.replace({ pathname: '/trajet/[id]', params: { id: trip.id } })} />} />
      ) : manual ? (
        <Notice tone="lime" icon={<Hourglass size={22} />}>
          <T style={{ fontFamily: f.bold, fontSize: 14 }}>{`${t.payment.manualTitle}. `}</T>
          {t.payment.manualBody}
        </Notice>
      ) : pending ? (
        <View style={[leafAlt, { gap: 12, padding: 18, backgroundColor: c.white }]}>
          <Pill label={m.simBadge} tone="lime" />
          <H style={{ fontSize: 20 }}>{t.payment.pendingTitle}</H>
          <T style={{ fontSize: 14, color: c.muted }}>{payment?.customerInstruction ?? t.payment.pendingBody}</T>
          {payment?.mockProviderRef ? (
            <View style={{ gap: 8 }}>
              <PrimaryButton label={m.simApprove} busy={busy} onPress={() => void simulate('SUCCEEDED')} />
              <GhostButton label={m.simRefuse} disabled={busy} onPress={() => void simulate('FAILED')} />
            </View>
          ) : (
            <T style={{ fontSize: 13, color: c.muted }}>{t.payment.pendingPolling}</T>
          )}
        </View>
      ) : (
        <>
          {payment?.state === 'FAILED' ? <ErrorBox message={`${t.payment.failedTitle}. ${t.payment.failedBody}`} /> : null}
          <View accessibilityRole="radiogroup" accessibilityLabel={t.payment.channel} style={{ gap: 10 }}>
            <T style={{ fontFamily: f.bold, color: c.forestSoft }}>{t.payment.channel}</T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {METHODS.map((x) => {
                const on = channel === x.id;
                return (
                  <Pressable
                    key={x.id}
                    accessibilityRole="radio"
                    accessibilityLabel={x.name}
                    accessibilityState={{ selected: on }}
                    onPress={() => setChannel(x.id)}
                    style={[x.radius, { flex: 1, gap: 14, minHeight: 100, padding: 16, backgroundColor: on ? c.lime : c.white, borderWidth: on ? 2 : 1, borderColor: on ? c.forest : c.line }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Phone size={24} />
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.forest, alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.forest }} /> : null}
                      </View>
                    </View>
                    <Text style={{ fontFamily: f.display, fontSize: 18, letterSpacing: -0.4, color: c.ink }}>{x.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Field label={t.payment.payerPhone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="6XX XXX XXX" hint={t.payment.payerPhoneHint} />
          <View style={[leafAlt, { gap: 8, padding: 16, backgroundColor: c.white }]}>
            <Row label={t.trip.contribution} value={money(booking.price.driverAmount)} />
            <Row label={t.trip.serviceFee} value={money(booking.price.serviceFee)} />
            <Row label={t.trip.total} value={total} strong />
          </View>
          <CheckRow checked={accepted} onToggle={() => setAccepted((v) => !v)} label={fmt(m.payDetail, { fee: money(booking.price.serviceFee), driver: money(booking.price.driverAmount) })} />
        </>
      )}

      {error ? <ErrorBox message={error} /> : null}

      <View style={[leafAlt, { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.sage }]}>
        <Shield size={22} color={c.leaf} stroke={2} />
        <T style={{ flex: 1, fontSize: 14 }}>
          <T style={{ fontFamily: f.bold, fontSize: 14 }}>{m.payDemoTitle}</T>
          {m.payDemoBody}
        </T>
      </View>
    </Screen>
  );
}
