import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api, errorMessage, type NotificationList } from '../src/api';
import { dateTime } from '../src/format';
import { fmt, useI18n } from '../src/i18n';
import { Bell, Chevron } from '../src/icons';
import { c, f, leaf } from '../src/theme';
import { EmptyState, ErrorBox, PageHeader, RequireAuth, Screen, T } from '../src/ui';

type Item = NotificationList['items'][number];

function Inner() {
  const router = useRouter();
  const { t, m, locale } = useI18n();
  const [data, setData] = useState<NotificationList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.notifications();
      setData(r);
      // L'écran garde l'état « non lu » de cette visite ; le serveur les marque lues.
      if (r.unread > 0) await api.markNotificationsRead();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const text = (n: Item) => {
    if (locale === 'fr') return n.text;
    const template = (m.notif as Record<string, string>)[n.template];
    return template ? fmt(template, { route: n.route ?? '', amount: n.amount ?? '' }) : n.text;
  };

  return (
    <Screen onRefresh={load}>
      <PageHeader title="Notifications" />
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!data && !error ? <ActivityIndicator color={c.leaf} size="large" style={{ marginTop: 32 }} accessibilityLabel={t.common.loading} /> : null}
      {data?.items.length === 0 ? <EmptyState title={m.notifEmpty} body={m.notifEmptyBody} /> : null}
      {data?.items.map((n) => {
        const target = n.template === 'message.new' && n.bookingId ? n.bookingId : null;
        const content = (
          <>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: n.readAt ? c.sage : c.lime }}>
              <Bell size={18} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T style={{ fontSize: 14, fontFamily: n.readAt ? f.body : f.semi }}>{text(n)}</T>
              <T style={{ fontSize: 12, color: c.muted }}>{dateTime(n.createdAt)}</T>
            </View>
            {target ? <Chevron size={18} color={c.forest} /> : null}
          </>
        );
        const row = [leaf, { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, backgroundColor: c.white }];
        return target ? (
          <Pressable key={n.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/messages/[id]', params: { id: target } })} style={row}>
            {content}
          </Pressable>
        ) : (
          <View key={n.id} style={row}>
            {content}
          </View>
        );
      })}
    </Screen>
  );
}

export default function NotificationsScreen() {
  const { m } = useI18n();
  return <RequireAuth title="Notifications" body={m.signInPrompt}>{() => <Inner />}</RequireAuth>;
}
