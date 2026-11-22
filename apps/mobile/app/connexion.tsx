import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, errorMessage, TERMS_VERSION } from '../src/api';
import { fmt, useI18n } from '../src/i18n';
import { useSession } from '../src/session';
import { c, f, leafAlt } from '../src/theme';
import { BackButton, CheckRow, ErrorBox, Field, GhostButton, H, Pill, PrimaryButton, Screen, T } from '../src/ui';

const normalizePhone = (v: string) => v.replace(/[^\d]/g, '').replace(/^(00)?237/, '');
const RESEND_SECONDS = 30;

export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const { setUser } = useSession();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; masked: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const digits = normalizePhone(phone);
  const phoneOk = /^6\d{8}$/.test(digits);
  const nameOk = !name.trim() || (name.trim().length >= 2 && name.trim().length <= 60);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.otpStart(digits);
      setChallenge({ id: r.challengeId, masked: r.maskedPhone, ...(r.devCode ? { devCode: r.devCode } : {}) });
      setCode('');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.otpVerify(challenge.id, code, name.trim() || undefined);
      setUser(r.user);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const demo = [
    { phone: '690000001', label: t.auth.demoAicha },
    { phone: '690000004', label: t.auth.demoJunior },
    { phone: '677000002', label: t.auth.demoSerge },
    { phone: '650000003', label: t.auth.demoNadege },
  ];

  const link = (label: string, slug: string) => (
    <T key={slug} accessibilityRole="link" onPress={() => router.push({ pathname: '/info/[slug]', params: { slug } })} style={{ fontSize: 14, fontFamily: f.bold, textDecorationLine: 'underline' }}>
      {label}
    </T>
  );
  const terms = t.auth.terms.split(/(\{cgu\}|\{privacy\}|\{v\})/).map((part, i) => {
    if (part === '{cgu}') return link(t.auth.termsCgu, 'cgu');
    if (part === '{privacy}') return link(t.auth.termsPrivacy, 'confidentialite');
    if (part === '{v}') return TERMS_VERSION;
    return <T key={i} style={{ fontSize: 14 }}>{part}</T>;
  });

  return (
    <Screen>
      <BackButton label={t.common.close} />
      <H style={{ fontSize: 34, lineHeight: 36 }}>{challenge ? t.auth.otpTitle : t.auth.title}</H>

      {!challenge ? (
        <>
          <T style={{ color: c.muted }}>{t.auth.subtitle}</T>
          <Field
            label={`${t.auth.phoneLabel} (+237)`}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="6XX XXX XXX"
            autoComplete="tel"
            hint={t.auth.phoneHint}
            error={phone.length >= 9 && !phoneOk ? t.auth.phoneInvalid : null}
          />
          {error ? <ErrorBox message={error} /> : null}
          <PrimaryButton label={busy ? t.auth.sending : t.auth.sendCode} busy={busy} disabled={!phoneOk} onPress={start} />
          {__DEV__ ? (
            <View style={[leafAlt, { gap: 8, padding: 16, backgroundColor: c.sage }]}>
              <Pill label={t.common.demo} />
              <T style={{ fontFamily: f.bold }}>{t.auth.demoAccountsTitle}</T>
              {demo.map((d) => (
                <Pressable key={d.phone} accessibilityRole="button" accessibilityLabel={d.label} onPress={() => setPhone(d.phone)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.white }}>
                  <T style={{ fontSize: 14, fontFamily: f.semi }}>{d.label}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <T style={{ color: c.muted }}>{fmt(t.auth.otpSentTo, { phone: challenge.masked })}</T>
          {challenge.devCode ? (
            <View style={[leafAlt, { gap: 6, padding: 16, backgroundColor: c.lime }]}>
              <T style={{ fontSize: 13, fontFamily: f.semi }}>{t.auth.devBannerTitle}</T>
              <H style={{ fontSize: 28, letterSpacing: 4 }}>{challenge.devCode}</H>
              <Pressable accessibilityRole="button" onPress={() => setCode(challenge.devCode ?? '')} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T style={{ fontFamily: f.bold, textDecorationLine: 'underline' }}>{t.auth.devFill}</T>
              </Pressable>
            </View>
          ) : null}
          <Field label={t.auth.otpLabel} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="sms-otp" maxLength={6} />
          <Field label={t.auth.displayName} value={name} onChangeText={setName} autoCapitalize="words" maxLength={60} hint={t.auth.displayNameHint} error={nameOk ? null : t.auth.displayNameInvalid} />
          <CheckRow checked={accepted} onToggle={() => setAccepted((v) => !v)} label={t.auth.termsCgu}>
            <T style={{ flex: 1, fontSize: 14 }}>{terms}</T>
          </CheckRow>
          {error ? <ErrorBox message={error} /> : null}
          <PrimaryButton label={busy ? t.auth.verifying : t.auth.verify} busy={busy} disabled={code.length !== 6 || !accepted || !nameOk} onPress={verify} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <GhostButton style={{ flex: 1 }} label={t.auth.changeNumber} onPress={() => setChallenge(null)} />
            <GhostButton style={{ flex: 1 }} label={wait > 0 ? fmt(t.auth.resendIn, { s: wait }) : t.auth.resend} disabled={wait > 0 || busy} onPress={() => void start()} />
          </View>
        </>
      )}
    </Screen>
  );
}
