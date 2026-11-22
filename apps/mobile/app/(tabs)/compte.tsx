import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { initials } from '../../src/format';
import { useI18n } from '../../src/i18n';
import { Bell, Car, Chevron, Doc, Lock, Shield, Wallet } from '../../src/icons';
import { useSession } from '../../src/session';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { Avatar, Chip, GhostButton, H, Pill, PrimaryButton, Screen, SectionTitle, T } from '../../src/ui';

function LinkRow({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pressed ? c.sage : c.white }]}>
      {icon}
      <T style={{ flex: 1, fontFamily: f.semi }}>{label}</T>
      <Chevron size={18} color={c.forest} />
    </Pressable>
  );
}

export default function Account() {
  const router = useRouter();
  const { t, m, locale, setLocale } = useI18n();
  const { user, logout, refresh } = useSession();
  const info = (slug: string) => router.push({ pathname: '/info/[slug]', params: { slug } });

  return (
    <Screen tabbed {...(user ? { onRefresh: refresh } : {})}>
      <H style={{ fontSize: 30 }}>{t.account.title}</H>
      {user ? (
        <View style={[leaf, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: c.white }]}>
          <Avatar text={initials(user.displayName)} size={52} />
          <View style={{ flex: 1, gap: 3 }}>
            <T style={{ fontFamily: f.bold, fontSize: 17 }}>{user.displayName}</T>
            <T style={{ fontSize: 13, color: c.muted }}>{user.maskedPhone}</T>
            <Pill label={t.account.driverStatus[user.driverStatus]} tone={user.driverStatus === 'VERIFIED' ? 'dark' : 'sage'} />
          </View>
        </View>
      ) : (
        <>
          <T style={{ color: c.muted }}>{m.signInPrompt}</T>
          <PrimaryButton label={t.common.signIn} onPress={() => router.push('/connexion')} />
        </>
      )}

      <View style={[leafAlt, { gap: 10, padding: 16, backgroundColor: c.sage }]}>
        <T style={{ fontFamily: f.bold }}>{t.account.language}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Français" on={locale === 'fr'} onPress={() => setLocale('fr')} />
          <Chip label="English" on={locale === 'en'} onPress={() => setLocale('en')} />
        </View>
      </View>

      {user ? (
        <>
          <SectionTitle>{m.accountDriver}</SectionTitle>
          <View style={{ gap: 6 }}>
            <LinkRow label={t.nav.driverSpace} icon={<Car size={20} color={c.leaf} />} onPress={() => router.navigate('/publier')} />
            {user.driverStatus !== 'NONE' ? <LinkRow label={t.nav.earnings} icon={<Wallet size={20} color={c.leaf} />} onPress={() => router.push('/conducteur/revenus')} /> : null}
            <LinkRow label="Notifications" icon={<Bell size={20} color={c.leaf} />} onPress={() => router.push('/notifications')} />
          </View>
        </>
      ) : null}

      <SectionTitle>{m.accountLegal}</SectionTitle>
      <View style={{ gap: 6 }}>
        <LinkRow label={t.footer.protectedPayment} icon={<Shield size={20} color={c.leaf} />} onPress={() => info('paiement-protege')} />
        <LinkRow label={t.footer.safety} icon={<Shield size={20} color={c.leaf} />} onPress={() => info('securite')} />
        <LinkRow label={t.footer.cgu} icon={<Doc size={20} color={c.leaf} />} onPress={() => info('cgu')} />
        <LinkRow label={t.footer.privacy} icon={<Lock size={20} color={c.leaf} />} onPress={() => info('confidentialite')} />
      </View>

      {user ? <GhostButton label={t.account.signOut} onPress={() => void logout()} /> : null}
      <T style={{ fontSize: 12, textAlign: 'center', color: c.muted }}>{m.accountDemoNotice}</T>
    </Screen>
  );
}
