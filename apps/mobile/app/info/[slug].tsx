import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { getLegal, useI18n } from '../../src/i18n';
import { c, leafAlt } from '../../src/theme';
import { H, Notice, PageHeader, Screen, T } from '../../src/ui';

const SLUGS = ['cgu', 'confidentialite', 'paiement-protege', 'securite'] as const;
type Slug = (typeof SLUGS)[number];

export default function InfoScreen() {
  const { t, locale } = useI18n();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const key: Slug = (SLUGS as readonly string[]).includes(slug) ? (slug as Slug) : 'cgu';
  const doc = getLegal(key, locale);
  return (
    <Screen>
      <PageHeader title={doc.title} fallback="/compte" />
      <T style={{ color: c.muted }}>{doc.intro}</T>
      {key === 'cgu' || key === 'confidentialite' ? <Notice tone="lime">{`${t.legal.draft}. ${t.legal.draftBody}`}</Notice> : null}
      {doc.sections.map((section) => (
        <View key={section.h} style={[leafAlt, { gap: 8, padding: 18, backgroundColor: c.white }]}>
          <H style={{ fontSize: 18, lineHeight: 22 }}>{section.h}</H>
          {section.p.map((p) => (
            <T key={p} style={{ fontSize: 14, lineHeight: 21, color: c.muted }}>{p}</T>
          ))}
        </View>
      ))}
    </Screen>
  );
}
