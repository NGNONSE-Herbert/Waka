import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { dateKey, parseDate } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Check, Doc } from '../../src/icons';
import { useSession } from '../../src/session';
import { c, f, leafAlt } from '../../src/theme';
import { CheckRow, DateField, ErrorBox, Field, GhostButton, PageHeader, PrimaryButton, RequireAuth, Screen, SelectField, Sheet, T } from '../../src/ui';

const ID_TYPES = ['CNI', 'PASSPORT', 'RESIDENCE_PERMIT'] as const;

function Form() {
  const router = useRouter();
  const { t, m } = useI18n();
  const { setUser } = useSession();
  const [fullName, setFullName] = useState('');
  const [license, setLicense] = useState('');
  const [expiry, setExpiry] = useState('');
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]>('CNI');
  const [ref, setRef] = useState('');
  const [declared, setDeclared] = useState(false);
  const [picking, setPicking] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiryKey = parseDate(expiry);
  const nameError = fullName.trim().length < 3 ? t.common.invalidField : null;
  const licenseError = license.trim().length < 4 ? t.common.invalidField : null;
  const expiryError = !expiryKey ? m.dateInvalid : expiryKey <= dateKey() ? m.datePast : null;
  const refError = !ref ? t.driver.idUploadMissing : null;
  const declaredError = !declared ? t.driver.declarationRequired : null;

  const submit = async () => {
    setAttempted(true);
    if (nameError || licenseError || expiryError || refError || declaredError || !expiryKey) return;
    setBusy(true);
    setError(null);
    try {
      const me = await api.onboarding({ fullName: fullName.trim(), licenseNumber: license.trim(), licenseExpiry: expiryKey, idDocumentType: idType, idDocumentUploadRef: ref, declaresPrivateCarpoolOnly: true });
      setUser(me);
      router.replace('/conducteur/vehicule');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<PrimaryButton label={t.driver.submitIdentity} busy={busy} onPress={submit} />}>
      <PageHeader title={`${t.driver.stepIdentity} & ${t.driver.stepDocuments}`} fallback="/publier" />
      <Field label={t.driver.fullName} value={fullName} onChangeText={setFullName} autoCapitalize="words" autoComplete="name" maxLength={80} error={attempted ? nameError : null} />
      <Field label={t.driver.licenseNumber} value={license} onChangeText={setLicense} autoCapitalize="characters" maxLength={30} error={attempted ? licenseError : null} />
      <DateField label={t.driver.licenseExpiry} value={expiry} onChange={setExpiry} error={attempted ? expiryError : null} />
      <SelectField plain label={t.driver.idType} value={t.driver.idTypes[idType]} onPress={() => setPicking(true)} />

      <View style={[leafAlt, { gap: 10, padding: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: c.dots, backgroundColor: c.white }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Doc size={20} color={c.leaf} />
          <T style={{ fontFamily: f.bold }}>{t.driver.idUpload}</T>
        </View>
        <T style={{ fontSize: 13, color: c.muted }}>{t.driver.idUploadNotice}</T>
        {ref ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Check size={16} color={c.leaf} />
            <T style={{ flex: 1, fontSize: 13, fontFamily: f.semi, color: c.forestSoft }}>{fmt(t.driver.idUploadDone, { ref })}</T>
          </View>
        ) : (
          <GhostButton label={t.driver.idUploadDemo} onPress={() => setRef(`demo-upload-${Math.random().toString(36).slice(2, 10)}`)} />
        )}
        {attempted && refError ? <T accessibilityRole="alert" style={{ fontSize: 13, fontFamily: f.semi, color: c.danger }}>{refError}</T> : null}
      </View>

      <View style={[leafAlt, { gap: 2, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: c.sage }]}>
        <CheckRow checked={declared} onToggle={() => setDeclared((v) => !v)} label={t.driver.declaration} />
        {attempted && declaredError ? <T accessibilityRole="alert" style={{ fontSize: 13, fontFamily: f.semi, color: c.danger }}>{declaredError}</T> : null}
      </View>
      {error ? <ErrorBox message={error} /> : null}

      {picking ? <Sheet title={t.driver.idType} options={ID_TYPES.map((x) => ({ value: x, label: t.driver.idTypes[x] }))} value={idType} onPick={setIdType} onClose={() => setPicking(false)} /> : null}
    </Screen>
  );
}

export default function DossierScreen() {
  const { t, m } = useI18n();
  return <RequireAuth title={t.driver.onboardingTitle} body={m.signInDriver}>{() => <Form />}</RequireAuth>;
}
