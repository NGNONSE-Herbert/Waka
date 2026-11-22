import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { api, type Earnings, errorMessage } from '../../src/api';
import { amount, dateTime, money } from '../../src/format';
import { useI18n } from '../../src/i18n';
import { Check, Lock, Send, Shield } from '../../src/icons';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { EmptyState, ErrorBox, PageHeader, Pill, RequireAuth, Screen, SectionTitle, T } from '../../src/ui';

function Inner() {
  const { t } = useI18n();
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.earnings());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const buckets = data
    ? [
        { label: t.driver.bucketHeld, hint: t.driver.bucketHeldHint, v: data.heldByPartner, Icon: Shield, bg: c.forest, fg: c.white, sub: c.onDark, accent: c.lime },
        { label: t.driver.bucketRequested, hint: t.driver.bucketRequestedHint, v: data.releaseRequested, Icon: Send, bg: c.white, fg: c.ink, sub: c.muted, accent: c.leaf },
        { label: t.driver.bucketPaid, hint: t.driver.bucketPaidHint, v: data.paid, Icon: Check, bg: c.lime, fg: c.ink, sub: c.forest, accent: c.forest },
        { label: t.driver.bucketFrozen, hint: t.driver.bucketFrozenHint, v: data.frozenByDispute, Icon: Lock, bg: c.sage, fg: c.ink, sub: c.muted, accent: c.forest },
      ]
    : [];

  return (
    <Screen onRefresh={load}>
      <PageHeader title={t.driver.earningsTitle} fallback="/publier" />
      <T style={{ color: c.muted }}>{t.driver.earningsSubtitle}</T>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!data && !error ? <ActivityIndicator color={c.leaf} size="large" style={{ marginTop: 32 }} accessibilityLabel={t.common.loading} /> : null}

      {data ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {buckets.map(({ label, hint, v, Icon, bg, fg, sub, accent }, i) => (
            <View key={label} style={[i % 2 === 0 ? leaf : leafAlt, { flexGrow: 1, flexBasis: '46%', gap: 6, padding: 16, backgroundColor: bg }]}>
              <Icon size={22} color={accent} />
              <T style={{ fontSize: 13, fontFamily: f.bold, color: fg }}>{label}</T>
              <Text style={{ fontFamily: f.display, fontSize: 24, letterSpacing: -0.6, color: fg }}>
                {amount(v)} <Text style={{ fontSize: 12 }}>FCFA</Text>
              </Text>
              <T style={{ fontSize: 12, color: sub }}>{hint}</T>
            </View>
          ))}
        </View>
      ) : null}

      {data ? <SectionTitle>{t.driver.history}</SectionTitle> : null}
      {data?.items.length === 0 ? <EmptyState title={t.driver.noEarnings} /> : null}
      {data?.items.map((it) => (
        <View key={it.bookingId + it.updatedAt} style={[leafAlt, { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: c.white }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <T numberOfLines={1} style={{ fontSize: 14, fontFamily: f.semi }}>{it.tripLabel}</T>
            <T style={{ fontSize: 12, color: c.muted }}>{dateTime(it.updatedAt)}</T>
            <Pill label={(t.paymentState as Record<string, string>)[it.paymentState] ?? it.label} tone={it.paymentState === 'PAID' ? 'dark' : it.paymentState === 'FROZEN_DISPUTE' ? 'danger' : 'sage'} />
          </View>
          <Text style={{ fontFamily: f.display, fontSize: 16, color: c.ink }}>{money(it.amount)}</Text>
        </View>
      ))}
    </Screen>
  );
}

export default function EarningsScreen() {
  const { t, m } = useI18n();
  return <RequireAuth title={t.driver.earningsTitle} body={m.signInDriver}>{() => <Inner />}</RequireAuth>;
}
