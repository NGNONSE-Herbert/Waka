import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, type DisputeCategory, type DisputeRequest, errorMessage } from '../../src/api';
import { useI18n } from '../../src/i18n';
import { SafetyCard } from '../../src/Safety';
import { c, leafAlt } from '../../src/theme';
import { CheckRow, ErrorBox, PageHeader, PrimaryButton, Screen, SelectField, Sheet, T, TextArea } from '../../src/ui';

const CATEGORIES: DisputeCategory[] = [
  'DRIVER_NO_SHOW',
  'PASSENGER_NO_SHOW',
  'WRONG_IDENTITY_OR_VEHICLE',
  'CANCELLATION',
  'PAYMENT_ISSUE',
  'EXCESSIVE_DELAY',
  'DROPOFF_NOT_RESPECTED',
  'TRIP_QUALITY',
  'LUGGAGE',
  'DANGEROUS_BEHAVIOUR',
  'THEFT_ASSAULT_HARASSMENT',
  'ACCIDENT',
  'PAYOUT_ISSUE',
];
const SAFETY: DisputeCategory[] = ['DANGEROUS_BEHAVIOUR', 'THEFT_ASSAULT_HARASSMENT', 'ACCIDENT'];
const OUTCOMES: DisputeRequest['requestedOutcome'][] = ['FULL_REFUND', 'PARTIAL_REFUND', 'RELEASE', 'OTHER'];

export default function ProblemScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [category, setCategory] = useState<DisputeCategory>('DRIVER_NO_SHOW');
  const [outcome, setOutcome] = useState<DisputeRequest['requestedOutcome']>('FULL_REFUND');
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [picker, setPicker] = useState<'category' | 'outcome' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = description.trim().length;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.openDispute(id, { category, description: description.trim(), requestedOutcome: outcome, urgentSafety: urgent });
      router.replace({ pathname: '/litige/[id]', params: { id: d.id } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<PrimaryButton label={busy ? t.dispute.submitting : t.dispute.submit} busy={busy} disabled={length < 20} onPress={submit} />}>
      <PageHeader title={t.dispute.newTitle} fallback="/trajets" />
      <T style={{ color: c.muted }}>{t.dispute.newSubtitle}</T>

      {urgent || SAFETY.includes(category) ? <SafetyCard /> : null}

      <SelectField plain label={t.dispute.category} value={t.dispute.categories[category]} onPress={() => setPicker('category')} />
      <TextArea label={t.dispute.description} value={description} onChangeText={setDescription} hint={t.dispute.descriptionHint} />
      <SelectField plain label={t.dispute.outcome} value={t.dispute.outcomes[outcome]} onPress={() => setPicker('outcome')} />

      <View style={[leafAlt, { paddingVertical: 6, paddingHorizontal: 16, backgroundColor: urgent ? c.dangerBg : c.sage }]}>
        <CheckRow role="switch" checked={urgent} onToggle={() => setUrgent((v) => !v)} label={t.dispute.urgent} />
        <T style={{ fontSize: 12, color: c.muted, paddingBottom: 8 }}>{t.dispute.urgentHint}</T>
      </View>

      <T style={{ fontSize: 12, color: c.muted }}>{t.dispute.notArbitrary}</T>
      {error ? <ErrorBox message={error} /> : null}

      {picker === 'category' ? <Sheet title={t.dispute.category} options={CATEGORIES.map((x) => ({ value: x, label: t.dispute.categories[x] }))} value={category} onPick={setCategory} onClose={() => setPicker(null)} /> : null}
      {picker === 'outcome' ? <Sheet title={t.dispute.outcome} options={OUTCOMES.map((x) => ({ value: x, label: t.dispute.outcomes[x] }))} value={outcome} onPick={setOutcome} onClose={() => setPicker(null)} /> : null}
    </Screen>
  );
}
