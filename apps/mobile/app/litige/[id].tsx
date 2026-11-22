import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { api, type Dispute, errorMessage } from '../../src/api';
import { dateTime, money } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Check, Clock, Lock } from '../../src/icons';
import { SafetyCard } from '../../src/Safety';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { BackButton, ConfirmSheet, ErrorBox, GhostButton, H, Loading, Notice, Pill, PrimaryButton, Screen, SectionTitle, T, TextArea } from '../../src/ui';

const STEP_OF: Record<Dispute['state'], number> = {
  OPENED: 0,
  TRIAGED: 1,
  EVIDENCE_REQUESTED: 1,
  UNDER_REVIEW: 1,
  APPEALED: 1,
  DECISION_PROPOSED: 2,
  APPROVED: 2,
  EXECUTION_PENDING: 3,
  RESOLVED: 3,
  CLOSED: 4,
};

export default function DisputeScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<Dispute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api.dispute(id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!d) return error ? <Screen><BackButton fallback="/trajets" /><ErrorBox message={error} onRetry={load} /></Screen> : <Loading />;

  const step = STEP_OF[d.state];
  const steps = [t.dispute.stepOpen, t.dispute.stepReview, t.dispute.stepDecision, t.dispute.stepExecution, t.dispute.stepClosed];
  const canAddEvidence = !['RESOLVED', 'CLOSED', 'EXECUTION_PENDING', 'APPROVED'].includes(d.state);
  const canAppeal = d.state === 'RESOLVED';

  const addEvidence = async () => {
    setBusy(true);
    setSendError(null);
    try {
      await api.addEvidence(d.id, text.trim());
      setText('');
      setFlash(t.dispute.evidenceAdded);
      await load();
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const appeal = async () => {
    setBusy(true);
    setSendError(null);
    try {
      await api.appeal(d.id);
      setAppealOpen(false);
      setFlash(t.dispute.appealDone);
      await load();
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={load}>
      <BackButton fallback="/trajets" />
      {d.priority === 'SAFETY' ? <SafetyCard /> : null}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Pill label={t.dispute.states[d.state]} tone="lime" />
          <Pill label={t.dispute.priority[d.priority]} tone={d.priority === 'SAFETY' ? 'danger' : 'sage'} />
        </View>
        <H style={{ fontSize: 30, lineHeight: 33 }}>{fmt(t.dispute.title, { ref: d.id.slice(-6).toUpperCase() })}</H>
        <T style={{ color: c.muted }}>{t.dispute.categories[d.category]}</T>
        <T style={{ fontSize: 13, color: c.muted }}>{fmt(t.dispute.openedAt, { date: dateTime(d.openedAt) })}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Clock size={15} color={c.forestSoft} />
          <T style={{ flex: 1, fontSize: 13, fontFamily: f.semi }}>{d.dueAt ? fmt(t.dispute.dueAt, { date: dateTime(d.dueAt) }) : t.dispute.noDue}</T>
        </View>
      </View>

      <View style={[leaf, { flexDirection: 'row', gap: 12, padding: 18, backgroundColor: c.forest }]}>
        <Lock size={22} color={c.lime} />
        <View style={{ flex: 1, gap: 4 }}>
          <T style={{ fontFamily: f.display, fontSize: 16, color: c.lime }}>{t.dispute.frozen}</T>
          <T style={{ fontSize: 13, color: c.onDark }}>{t.dispute.intro}</T>
        </View>
      </View>

      <View accessibilityLabel={`${t.dispute.stepperLabel} : ${steps[step]}`} style={{ flexDirection: 'row' }}>
        {steps.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <View key={label} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, height: 3, backgroundColor: i === 0 ? 'transparent' : done || current ? c.leaf : c.line }} />
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.forest : current ? c.lime : c.sage }}>
                  {done ? <Check size={15} color={c.lime} /> : <T style={{ fontSize: 13, fontFamily: f.bold }}>{i + 1}</T>}
                </View>
                <View style={{ flex: 1, height: 3, backgroundColor: i === steps.length - 1 ? 'transparent' : done ? c.leaf : c.line }} />
              </View>
              <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 11, fontFamily: current ? f.bold : f.body, color: current ? c.ink : c.muted }}>{label}</T>
            </View>
          );
        })}
      </View>

      {flash ? <Notice icon={<Check size={18} color={c.leaf} />}>{flash}</Notice> : null}

      <View style={[leafAlt, { gap: 10, padding: 18, backgroundColor: c.white }]}>
        <H style={{ fontSize: 20 }}>{t.dispute.decision}</H>
        {d.decision ? (
          <>
            <Pill label={t.dispute.decisionStates[d.decision.state]} tone={d.decision.state === 'APPROVED' ? 'dark' : 'lime'} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[[t.dispute.decisionRefund, d.decision.refundToPassenger], [t.dispute.decisionRelease, d.decision.releaseToDriver]].map(([label, value]) => (
                <View key={String(label)} style={{ flex: 1, gap: 4, padding: 14, borderRadius: 18, backgroundColor: c.sage }}>
                  <T style={{ fontSize: 12, color: c.muted }}>{label}</T>
                  <H style={{ fontSize: 18 }}>{money(Number(value))}</H>
                </View>
              ))}
            </View>
            <T style={{ fontFamily: f.bold, fontSize: 14 }}>{t.dispute.decisionReason}</T>
            <T style={{ fontSize: 14, color: c.muted }}>{d.decision.reason}</T>
            <T style={{ fontSize: 12, color: c.muted }}>{t.dispute.decisionExplain}</T>
            {canAppeal ? <GhostButton label={t.dispute.appeal} onPress={() => setAppealOpen(true)} /> : null}
          </>
        ) : (
          <T style={{ color: c.muted }}>{t.dispute.decisionPending}</T>
        )}
      </View>

      <SectionTitle>{t.dispute.timeline}</SectionTitle>
      <View style={[leafAlt, { padding: 18, backgroundColor: c.white }]}>
        {d.timeline.map((ev, i) => (
          <View key={`${ev.at}-${i}`} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 16, height: 16, marginTop: 3, borderRadius: 8, borderWidth: 3, borderColor: c.sage, backgroundColor: c.leaf }} />
              {i < d.timeline.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: c.line }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: i < d.timeline.length - 1 ? 16 : 0 }}>
              <T style={{ fontSize: 14, fontFamily: f.semi }}>{ev.label}</T>
              <T style={{ fontSize: 12, color: c.muted }}>{`${t.dispute.actors[ev.actor]} · ${dateTime(ev.at)}`}</T>
            </View>
          </View>
        ))}
      </View>

      <SectionTitle>{t.dispute.evidence}</SectionTitle>
      {d.evidence.length ? (
        d.evidence.map((ev) => {
          const team = ev.from === 'WAKA_TEAM';
          return (
            <View key={ev.id} style={{ gap: 6, padding: 14, borderRadius: 18, backgroundColor: team ? c.forest : c.white }}>
              <T style={{ fontSize: 14, color: team ? c.white : c.ink }}>{ev.text}</T>
              <T style={{ fontSize: 12, color: team ? c.onDarkMuted : c.muted }}>{`${t.dispute.actors[ev.from]} · ${dateTime(ev.at)}`}</T>
            </View>
          );
        })
      ) : (
        <T style={{ color: c.muted }}>{t.dispute.noEvidence}</T>
      )}

      {canAddEvidence ? (
        <View style={{ gap: 10 }}>
          <TextArea label={t.dispute.addEvidence} value={text} onChangeText={setText} placeholder={t.dispute.evidencePlaceholder} hint={t.dispute.evidenceNote} />
          {sendError && !appealOpen ? <ErrorBox message={sendError} /> : null}
          <PrimaryButton label={t.dispute.evidenceSubmit} busy={busy} disabled={text.trim().length < 5} onPress={addEvidence} />
        </View>
      ) : null}

      <T style={{ fontSize: 12, textAlign: 'center', color: c.muted }}>{t.dispute.notArbitrary}</T>

      {appealOpen ? (
        <ConfirmSheet title={t.dispute.appealTitle} body={t.dispute.appealBody} confirmLabel={t.dispute.appeal} busy={busy} error={sendError} onConfirm={() => void appeal()} onClose={() => setAppealOpen(false)} />
      ) : null}
    </Screen>
  );
}
