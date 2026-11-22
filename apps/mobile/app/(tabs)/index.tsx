import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../src/api';
import { cityName, useCities } from '../../src/cities';
import { addDays, dateKey, dayShort, nextDays, seats as seatsLabel } from '../../src/format';
import { useI18n } from '../../src/i18n';
import { Bell, ForestBadge, Logo, Plus, Swap } from '../../src/icons';
import { useSession } from '../../src/session';
import { c, f, leaf, shadow } from '../../src/theme';
import { H, PrimaryButton, Screen, SelectField, Sheet, T } from '../../src/ui';

type Picker = 'from' | 'to' | 'date' | 'seats' | null;
const POPULAR = [['DLA', 'YDE'], ['DLA', 'KRI'], ['DLA', 'BFS']] as const;

export default function Home() {
  const router = useRouter();
  const { t, m, locale, setLocale } = useI18n();
  const { user } = useSession();
  const cities = useCities();
  const [from, setFrom] = useState('DLA');
  const [to, setTo] = useState('YDE');
  const [date, setDate] = useState(() => addDays(dateKey(), 1));
  const [seats, setSeats] = useState(1);
  const [picker, setPicker] = useState<Picker>(null);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setUnread(0);
        return;
      }
      api
        .notifications()
        .then((r) => setUnread(r.unread))
        .catch(() => {});
    }, [user]),
  );

  const name = useCallback((code: string) => cityName(cities, code), [cities]);
  const cityOptions = useMemo(() => cities.map((x) => ({ value: x.code as string, label: x.name })), [cities]);
  const days = useMemo(() => nextDays(30), []);

  const go = (a: string, b: string) => router.push({ pathname: '/resultats', params: { from: a, to: b, date, seats: String(seats), fromName: name(a), toName: name(b) } });

  const pickCity = (side: 'from' | 'to', v: string) => {
    const other = side === 'from' ? to : from;
    if (v === other) {
      setFrom(side === 'from' ? v : to);
      setTo(side === 'from' ? from : v);
      return;
    }
    if (side === 'from') setFrom(v);
    else setTo(v);
  };

  return (
    <Screen tabbed>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Logo />
          <Text style={{ fontFamily: f.display, fontSize: 24, letterSpacing: -0.7, color: c.ink }}>waka</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t.nav.language} : ${locale === 'fr' ? 'français' : 'English'}`}
            onPress={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            style={{ height: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.lineStrong }}
          >
            <T style={{ fontFamily: f.bold, fontSize: 13, color: c.forest }}>{locale.toUpperCase()}</T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `Notifications (${unread})` : 'Notifications'}
            onPress={() => router.push('/notifications')}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.white }}
          >
            <Bell size={20} />
            {unread > 0 ? (
              <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.forest }}>
                <Text style={{ fontFamily: f.bold, fontSize: 11, color: c.lime }}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 8, paddingBottom: 6 }}>
          <H style={{ fontSize: 46, lineHeight: 46, letterSpacing: -1.8 }}>{t.landing.searchTitle}</H>
          <T style={{ fontSize: 14, fontFamily: f.semi, color: c.forestSoft }}>{m.homeSubtitle}</T>
        </View>
        <ForestBadge />
      </View>

      <View style={[{ gap: 10, padding: 14, borderRadius: 32, backgroundColor: c.white }, shadow]}>
        <View style={{ gap: 8 }}>
          <SelectField label={t.common.from} value={name(from)} right={60} onPress={() => setPicker('from')} />
          <SelectField label={t.common.to} value={name(to)} right={60} onPress={() => setPicker('to')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.common.swap}
            onPress={() => {
              setFrom(to);
              setTo(from);
            }}
            style={{ position: 'absolute', right: 10, top: 40, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.lime }}
          >
            <Swap size={18} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SelectField label={t.common.date} value={dayShort(date)} style={{ flex: 1.4 }} onPress={() => setPicker('date')} />
          <SelectField label={t.search.seatsLabel} value={seatsLabel(seats)} style={{ flex: 1 }} onPress={() => setPicker('seats')} />
        </View>
        <PrimaryButton label={t.nav.findTrip} onPress={() => go(from, to)} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/demande/nouvelle', params: { from, to, date, seats: String(seats) } })}
        style={[leaf, { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.lime }]}
      >
        <View style={{ flex: 1 }}>
          <H style={{ fontSize: 18, letterSpacing: -0.4 }}>{t.landing.seekTitle}</H>
          <T style={{ fontSize: 13, fontFamily: f.medium, color: c.forest }}>{m.seekHomeBody}</T>
        </View>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink }}>
          <Plus size={18} color={c.white} />
        </View>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {POPULAR.map(([a, b]) => (
          <Pressable
            key={b}
            accessibilityRole="button"
            onPress={() => go(a, b)}
            style={{ height: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.white }}
          >
            <T style={{ fontSize: 14, fontFamily: f.semi }}>{`${name(a)} → ${name(b)}`}</T>
          </Pressable>
        ))}
      </ScrollView>

      {picker === 'from' ? <Sheet title={t.common.from} options={cityOptions} value={from} onPick={(v) => pickCity('from', v)} onClose={() => setPicker(null)} /> : null}
      {picker === 'to' ? <Sheet title={t.common.to} options={cityOptions} value={to} onPick={(v) => pickCity('to', v)} onClose={() => setPicker(null)} /> : null}
      {picker === 'date' ? <Sheet title={m.chooseDate} options={days.map((d) => ({ value: d, label: dayShort(d) }))} value={date} onPick={setDate} onClose={() => setPicker(null)} /> : null}
      {picker === 'seats' ? <Sheet title={m.chooseSeats} options={[1, 2, 3, 4].map((n) => ({ value: n, label: seatsLabel(n) }))} value={seats} onPick={setSeats} onClose={() => setPicker(null)} /> : null}
    </Screen>
  );
}
