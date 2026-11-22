import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, type Booking, errorMessage } from '../../src/api';
import { money } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Chat, Check, Chevron, Flag, Scale, Star, SunBadge } from '../../src/icons';
import { c, f, leafAlt, shadow } from '../../src/theme';
import { BackButton, ConfirmSheet, ErrorBox, GhostButton, H, Loading, Notice, PrimaryButton, Screen, T, TextArea } from '../../src/ui';

// DISPUTED est absent : un litige peut s'ouvrir avant l'embarquement, on n'affirme donc aucune étape du voyage.
const RANK: Record<string, number> = { CONFIRMED: 1, CHECKED_IN: 2, IN_PROGRESS: 2, ARRIVAL_REPORTED: 3, COMPLETED: 4 };

function Step({ label, meta, done, current }: { label: string; meta: string; done: boolean; current: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 6 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.forest : current ? c.lime : c.line }}>
        {done ? <Check size={14} color={c.lime} stroke={3.2} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: f.bold, color: done || current ? c.ink : c.muted }}>{label}</T>
        <T style={{ fontSize: 13, color: c.muted }}>{meta}</T>
      </View>
    </View>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.review(bookingId, rating, comment.trim() || undefined);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[leafAlt, { gap: 12, padding: 18, backgroundColor: c.white }]}>
      <H style={{ fontSize: 20 }}>{t.ticket.reviewTitle}</H>
      <View accessibilityRole="radiogroup" accessibilityLabel={t.ticket.reviewRating} style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="radio" accessibilityLabel={fmt(t.ticket.reviewStar, { n })} accessibilityState={{ selected: rating === n }} onPress={() => setRating(n)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Star filled={n <= rating} />
          </Pressable>
        ))}
      </View>
      <TextArea label={t.ticket.reviewComment} value={comment} onChangeText={setComment} maxLength={500} />
      {error ? <ErrorBox message={error} /> : null}
      <PrimaryButton label={t.ticket.reviewSubmit} busy={busy} disabled={rating === 0} onPress={submit} />
    </View>
  );
}

export default function ArrivalScreen() {
  const router = useRouter();
  const { t, m } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const load = useCallback(async () => {
    try {
      setB(await api.booking(id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 4000);
      return () => clearInterval(timer);
    }, [load]),
  );

  if (!b) return error ? <Screen><BackButton fallback="/trajets" /><ErrorBox message={error} onRetry={load} /></Screen> : <Loading />;

  const driver = b.trip.driver.displayName;
  const rank = RANK[b.state] ?? 0;
  const payState = b.payment?.state;
  const paid = payState === 'PAID';
  const requested = payState === 'RELEASE_REQUESTED' || payState === 'PAYOUT_PROCESSING' || paid;
  const confirmed = !!b.passengerConfirmedAt || b.state === 'COMPLETED';
  const disputed = b.state === 'DISPUTED';
  const canConfirm = (b.state === 'ARRIVAL_REPORTED' || b.state === 'IN_PROGRESS') && !confirmed;
  const canReport = !b.dispute && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED'].includes(b.state);
  const amount = money(b.price.driverAmount);
  const city = b.trip.destination.name;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      setB(await api.confirmArrival(b.id));
      setConfirmOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={load}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 8, paddingBottom: 4 }}>
          <BackButton fallback="/trajets" />
          <T style={{ fontFamily: f.bold, fontSize: 14, color: c.forestSoft }}>{`${b.trip.origin.name} → ${city}`}</T>
          <H style={{ fontSize: 32, lineHeight: 33 }}>{disputed ? m.disputeRecorded : b.state === 'COMPLETED' ? t.ticket.states.COMPLETED : rank >= 3 ? fmt(m.arrivedQuestion, { city }) : m.followTitle}</H>
          <T style={{ fontSize: 14, color: c.muted }}>{disputed ? fmt(m.tripWith, { name: driver }) : rank >= 3 ? fmt(m.reportedBy, { name: driver }) : fmt(m.willReport, { name: driver })}</T>
        </View>
        <SunBadge />
      </View>

      <View style={[shadow, { paddingVertical: 10, paddingHorizontal: 20, borderTopLeftRadius: 40, borderTopRightRadius: 12, borderBottomRightRadius: 40, borderBottomLeftRadius: 12, backgroundColor: c.white }]}>
        <Step label={t.ticket.steps.paid} meta={m.stepFunds} done={rank >= 1 || disputed} current={rank === 0 && !disputed} />
        {disputed ? null : (
          <>
            <Step label={t.ticket.steps.boarded} meta={rank >= 2 ? m.stepBoardDone : m.stepBoardWait} done={rank >= 2} current={rank === 1} />
            <Step label={fmt(m.stepArrivedBy, { name: driver })} meta={rank >= 3 ? m.stepArrivedDone : m.stepArrivedWait} done={rank >= 3} current={rank === 2} />
            <Step label={m.stepYours} meta={confirmed ? m.stepYoursDone : rank >= 3 ? m.stepYoursWait : m.stepYoursLater} done={confirmed} current={canConfirm && rank >= 3} />
          </>
        )}
        <Step
          label={fmt(m.stepPayout, { name: driver })}
          meta={disputed ? t.dispute.frozen : paid ? t.paymentState.PAID : requested ? m.stepPayoutRunning : m.stepPayoutLater}
          done={paid}
          current={requested && !paid}
        />
      </View>

      {error ? <ErrorBox message={error} /> : null}

      {b.state === 'ARRIVAL_REPORTED' && !confirmed ? <Notice>{t.ticket.arrivalReportedHint}</Notice> : null}

      {canConfirm ? (
        <View style={{ gap: 10 }}>
          <View style={[leafAlt, { paddingVertical: 14, paddingHorizontal: 18, backgroundColor: c.sage }]}>
            <T style={{ fontSize: 14 }}>{fmt(m.payoutAuthorize, { amount, name: driver })}</T>
          </View>
          <PrimaryButton label={t.ticket.confirmArrival} icon={<Check size={20} stroke={2.6} />} onPress={() => setConfirmOpen(true)} />
        </View>
      ) : null}

      {canReport ? (
        <View style={{ gap: 6 }}>
          <GhostButton label={t.ticket.report} icon={<Flag size={18} />} onPress={() => router.push({ pathname: '/probleme/[id]', params: { id: b.id } })} />
          <T style={{ fontSize: 12, textAlign: 'center', color: c.muted }}>{m.reportSuspends}</T>
        </View>
      ) : null}

      {confirmed ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 6, paddingVertical: 20, paddingHorizontal: 22, borderTopLeftRadius: 40, borderTopRightRadius: 12, borderBottomRightRadius: 40, borderBottomLeftRadius: 12, backgroundColor: c.forest }}>
          <Text style={{ fontFamily: f.display, fontSize: 22, letterSpacing: -0.4, color: c.lime }}>{paid ? t.paymentState.PAID : t.paymentState.RELEASE_REQUESTED}</Text>
          <T style={{ fontSize: 14, color: c.onDark }}>{paid ? fmt(m.payoutDoneBody, { amount }) : fmt(m.payoutRunningBody, { amount })}</T>
        </View>
      ) : null}

      {b.dispute ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/litige/[id]', params: { id: b.dispute!.id } })} style={[leafAlt, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: c.dangerBg }]}>
          <Scale size={22} color={c.danger} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: f.display, fontSize: 17, color: c.danger }}>{t.dispute.frozen}</T>
            <T style={{ fontSize: 13 }}>{`${t.dispute.states[b.dispute.state]} · ${t.ticket.seeDispute}`}</T>
          </View>
          <Chevron size={18} color={c.danger} />
        </Pressable>
      ) : null}

      {b.state === 'COMPLETED' && b.canReview && !reviewed ? (
        <ReviewForm
          bookingId={b.id}
          onDone={() => {
            setReviewed(true);
            void load();
          }}
        />
      ) : null}
      {reviewed ? <Notice icon={<Check size={18} color={c.leaf} />}>{t.ticket.reviewThanks}</Notice> : null}

      {!['COMPLETED', 'CANCELLED'].includes(b.state) ? <GhostButton label={fmt(m.chatWrite, { name: driver })} icon={<Chat size={18} />} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: b.id } })} /> : null}
      {confirmed || disputed ? <GhostButton label={t.errors.home} onPress={() => router.replace('/')} /> : null}

      {confirmOpen ? (
        <ConfirmSheet
          title={t.ticket.confirmArrivalTitle}
          body={t.ticket.confirmArrivalBody}
          confirmLabel={t.ticket.confirmArrivalCta}
          busy={busy}
          error={error}
          onConfirm={() => void confirm()}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
