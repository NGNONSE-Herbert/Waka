import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from './i18n';
import { PlusCircle, Search, Ticket, User } from './icons';
import { c, f } from './theme';
import { T } from './ui';

export function PillBar({ active }: { active: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const items = [
    { key: 'index', href: '/', label: t.nav.search, Icon: Search },
    { key: 'trajets', href: '/trajets', label: t.nav.myTrips, Icon: Ticket },
    { key: 'publier', href: '/publier', label: t.nav.publish, Icon: PlusCircle },
    { key: 'compte', href: '/compte', label: t.nav.account, Icon: User },
  ] as const;
  return (
    <View
      accessibilityRole="tablist"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14, flexDirection: 'row', gap: 4, height: 64, padding: 6, borderRadius: 999, backgroundColor: c.ink }}
    >
      {items.map(({ key, href, label, Icon }) => {
        const on = active === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(href)}
            style={{ flex: on ? 2 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, backgroundColor: on ? c.lime : 'transparent' }}
          >
            <Icon size={on ? 20 : 22} color={on ? c.ink : c.navIcon} stroke={on ? 2.2 : 2} />
            {on ? (
              <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.bold, fontSize: 14 }}>
                {label}
              </T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
