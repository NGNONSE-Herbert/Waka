import { Linking, Pressable, View } from 'react-native';
import { fmt, useI18n } from './i18n';
import { Alert, Phone } from './icons';
import { c, f, leafAlt } from './theme';
import { H, T } from './ui';

/** Consignes d'urgence : la sécurité passe avant toute démarche dans l'application. */
export function SafetyCard() {
  const { t, m } = useI18n();
  return (
    <View accessibilityRole="alert" style={[leafAlt, { gap: 10, padding: 18, backgroundColor: c.danger }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Alert size={24} color={c.white} />
        <H style={{ flex: 1, fontSize: 18, lineHeight: 22, color: c.white }}>{t.dispute.safetyTitle}</H>
      </View>
      <T style={{ fontSize: 14, color: c.white }}>{t.dispute.safetyBody}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['117', '118', '119'].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={fmt(m.callEmergency, { n })}
            onPress={() => void Linking.openURL(`tel:${n}`)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: 999, backgroundColor: c.white }}
          >
            <Phone size={16} color={c.danger} />
            <T style={{ fontFamily: f.bold, color: c.danger }}>{n}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
