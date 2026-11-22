import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import type { Me } from './api';
import { maskDate } from './format';
import { useI18n } from './i18n';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from './icons';
import { useSession } from './session';
import { c, f, leafAlt } from './theme';

export function T({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ fontFamily: f.body, fontSize: 15, color: c.ink }, style]} />;
}
export function H({ style, ...p }: TextProps) {
  return <Text accessibilityRole="header" {...p} style={[{ fontFamily: f.display, color: c.ink, letterSpacing: -0.6 }, style]} />;
}

export function Screen({
  children,
  footer,
  tabbed,
  scroll = true,
  onRefresh,
}: {
  children: ReactNode;
  footer?: ReactNode;
  tabbed?: boolean;
  scroll?: boolean;
  onRefresh?: () => Promise<unknown>;
}) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const padding = { paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: tabbed ? insets.bottom + 104 : 20, gap: 14 };
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} {...(Platform.OS === 'web' ? {} : { behavior: 'padding' as const })}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={padding}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...(refresh ? { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.leaf} colors={[c.leaf]} /> } : {})}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 14, backgroundColor: c.bg }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function BackButton({ label, size = 52, bordered = true, fallback = '/' }: { label?: string; size?: number; bordered?: boolean; fallback?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t.common.back}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
      style={[s.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.white }, bordered && { borderWidth: 1, borderColor: c.line }]}
    >
      <ArrowLeft />
    </Pressable>
  );
}

/** En-tête d'écran secondaire : retour + titre. */
export function PageHeader({ title, fallback, right }: { title: string; fallback?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton {...(fallback ? { fallback } : {})} />
      <H numberOfLines={2} style={{ flex: 1, fontSize: 26, lineHeight: 29 }}>
        {title}
      </H>
      {right}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [s.primary, off && { opacity: 0.55 }, pressed && { opacity: 0.88 }, style]}
    >
      <Text style={s.primaryLabel}>{label}</Text>
      <View style={s.primaryDot}>{busy ? <ActivityIndicator color={c.ink} /> : (icon ?? <ArrowRight size={20} />)}</View>
    </Pressable>
  );
}

/** Variante citron, pour l'action principale sur fond forêt. */
export function LimeButton({ label, onPress, icon, style }: { label: string; onPress: () => void; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, paddingHorizontal: 22, borderRadius: 999, backgroundColor: c.lime }, pressed && { opacity: 0.88 }, style]}
    >
      {icon}
      <Text style={{ fontFamily: f.displayBold, fontSize: 16, color: c.ink }}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon, style, danger, disabled }: { label: string; onPress: () => void; icon?: ReactNode; style?: StyleProp<ViewStyle>; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.ghost, danger && { borderColor: c.danger }, pressed && { backgroundColor: danger ? c.dangerBg : c.sage }, disabled && { opacity: 0.5 }, style]}
    >
      {icon}
      <T style={{ fontFamily: f.bold, color: danger ? c.danger : c.ink }}>{label}</T>
    </Pressable>
  );
}

export function Pill({ label, tone = 'sage' }: { label: string; tone?: 'sage' | 'lime' | 'dark' | 'danger' }) {
  const bg = tone === 'lime' ? c.lime : tone === 'dark' ? c.forest : tone === 'danger' ? c.dangerBg : c.sage;
  const fg = tone === 'dark' ? c.lime : tone === 'lime' ? c.ink : tone === 'danger' ? c.danger : c.forestSoft;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: bg, alignSelf: 'flex-start', maxWidth: '100%' }}>
      <T numberOfLines={1} style={{ fontSize: 11, fontFamily: f.bold, color: fg }}>
        {label}
      </T>
    </View>
  );
}

export function Avatar({ text, size = 38 }: { text: string; size?: number }) {
  return (
    <View style={[s.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.lime }]}>
      <Text style={{ fontFamily: f.display, fontSize: size * 0.34, color: c.ink }}>{text}</Text>
    </View>
  );
}

export function FieldNote({ error, hint }: { error?: string | null | undefined; hint?: string | undefined }) {
  if (error) return <T accessibilityRole="alert" style={{ fontSize: 13, fontFamily: f.semi, color: c.danger, paddingHorizontal: 6 }}>{error}</T>;
  if (hint) return <T style={{ fontSize: 13, color: c.muted, paddingHorizontal: 6 }}>{hint}</T>;
  return null;
}

export function Field({ label, style, error, hint, ...p }: TextInputProps & { label: string; error?: string | null | undefined; hint?: string | undefined }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.field, { backgroundColor: c.white }, !!error && { borderColor: c.danger }, style as ViewStyle]}>
        <T style={s.fieldLabel}>{label}</T>
        <TextInput accessibilityLabel={label} placeholderTextColor={c.muted} {...p} style={s.fieldInput} />
      </View>
      <FieldNote error={error} hint={hint} />
    </View>
  );
}

export function DateField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | null | undefined }) {
  const { m } = useI18n();
  return <Field label={label} value={value} onChangeText={(v) => onChange(maskDate(v))} keyboardType="number-pad" placeholder={m.dateHint} maxLength={10} error={error} />;
}

export function TextArea({ label, value, onChangeText, maxLength = 2000, placeholder, hint, error }: { label: string; value: string; onChangeText: (v: string) => void; maxLength?: number; placeholder?: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ gap: 6, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: error ? c.danger : c.line, backgroundColor: c.white }}>
        <T style={s.fieldLabel}>{label}</T>
        <TextInput
          accessibilityLabel={label}
          multiline
          maxLength={maxLength}
          value={value}
          onChangeText={onChangeText}
          textAlignVertical="top"
          placeholderTextColor={c.muted}
          {...(placeholder ? { placeholder } : {})}
          style={{ minHeight: 96, padding: 0, fontFamily: f.body, fontSize: 16, color: c.ink }}
        />
      </View>
      <FieldNote error={error} hint={hint} />
    </View>
  );
}

export function SelectField({ label, value, onPress, style, right, plain }: { label: string; value: string; onPress: () => void; style?: StyleProp<ViewStyle>; right?: number; plain?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} : ${value}`} onPress={onPress} style={[s.field, plain && { backgroundColor: c.white }, right ? { paddingRight: right } : { paddingRight: 40 }, style]}>
      <T style={s.fieldLabel}>{label}</T>
      <T numberOfLines={1} style={{ fontFamily: f.bold, fontSize: 17 }}>
        {value}
      </T>
      {right ? null : (
        <View style={{ position: 'absolute', right: 14, top: 20 }}>
          <ChevronDown size={18} color={c.muted} />
        </View>
      )}
    </Pressable>
  );
}

export function Sheet<V extends string | number>({ title, options, value, onPick, onClose }: { title: string; options: { value: V; label: string }[]; value: V; onPick: (v: V) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t.common.close} style={{ flex: 1, backgroundColor: 'rgba(11,31,23,.45)' }} onPress={onClose} />
      <View style={{ maxHeight: '70%', backgroundColor: c.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 20, paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
        <H style={{ fontSize: 22, marginBottom: 12 }}>{title}</H>
        <ScrollView>
          <View style={{ gap: 8 }}>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={String(o.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    onPick(o.value);
                    onClose();
                  }}
                  style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: on ? c.forest : c.white, borderWidth: on ? 0 : 1, borderColor: c.line }}
                >
                  <T style={{ fontFamily: f.bold, fontSize: 16, color: on ? c.white : c.ink }}>{o.label}</T>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Feuille basse libre (code d'embarquement, etc.). */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t.common.close} style={{ flex: 1, backgroundColor: 'rgba(11,31,23,.45)' }} onPress={onClose} />
      <View style={{ maxHeight: '88%', backgroundColor: c.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 20, paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
          <H style={{ fontSize: 22, lineHeight: 26 }}>{title}</H>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Confirmation explicite avant toute action importante. */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
  error,
  danger,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
  danger?: boolean;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet title={title} onClose={onClose}>
      <T style={{ color: c.muted }}>{body}</T>
      {error ? <ErrorBox message={error} /> : null}
      {danger ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: !!busy, busy: !!busy }}
          disabled={busy}
          onPress={onConfirm}
          style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: c.danger, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? <ActivityIndicator color={c.white} /> : <T style={{ fontFamily: f.bold, fontSize: 16, color: c.white }}>{confirmLabel}</T>}
        </Pressable>
      ) : (
        <PrimaryButton label={confirmLabel} busy={!!busy} icon={<Check size={20} stroke={2.6} />} onPress={onConfirm} />
      )}
      <GhostButton label={t.common.cancel} onPress={onClose} />
    </BottomSheet>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <View style={[s.center, { flex: 1, backgroundColor: c.bg }]}>
      <ActivityIndicator size="large" color={c.leaf} accessibilityLabel={t.common.loading} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View accessibilityRole="alert" style={{ gap: 8, padding: 16, borderRadius: 20, backgroundColor: c.dangerBg }}>
      <T style={{ color: c.danger, fontFamily: f.semi }}>{message}</T>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T style={{ fontFamily: f.bold, textDecorationLine: 'underline' }}>{t.common.retry}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Notice({ children, icon, tone = 'sage' }: { children: ReactNode; icon?: ReactNode; tone?: 'sage' | 'lime' | 'dark' }) {
  const bg = tone === 'lime' ? c.lime : tone === 'dark' ? c.forest : c.sage;
  return (
    <View accessibilityLiveRegion="polite" style={[leafAlt, { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: bg }]}>
      {icon}
      <T style={{ flex: 1, fontSize: 14, color: tone === 'dark' ? c.onDark : c.ink }}>{children}</T>
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={[leafAlt, { gap: 8, padding: 20, backgroundColor: c.white }]}>
      <H style={{ fontSize: 19 }}>{title}</H>
      {body ? <T style={{ fontSize: 14, color: c.muted }}>{body}</T> : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

export function CheckRow({ label, checked, onToggle, children, role = 'checkbox' }: { label?: string; checked: boolean; onToggle: () => void; children?: ReactNode; role?: 'checkbox' | 'switch' }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked }}
      {...(label ? { accessibilityLabel: label } : {})}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}
    >
      <View style={[s.center, { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: c.forest, backgroundColor: checked ? c.forest : c.white }]}>
        {checked ? <Check size={15} color={c.lime} stroke={3} /> : null}
      </View>
      {children ?? <T style={{ flex: 1, fontSize: 14 }}>{label}</T>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: on ? 0 : 1, borderColor: c.line, backgroundColor: on ? c.forest : c.white }}
    >
      <T style={{ fontSize: 14, fontFamily: f.semi, color: on ? c.white : c.forest }}>{label}</T>
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.sage }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, flexDirection: 'row', minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, backgroundColor: on ? c.forest : 'transparent' }}
          >
            <T numberOfLines={1} style={{ fontSize: 14, fontFamily: f.bold, color: on ? c.white : c.forest }}>
              {o.label}
            </T>
            {o.count ? (
              <View style={{ minWidth: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.lime, alignItems: 'center' }}>
                <T style={{ fontSize: 12, fontFamily: f.bold }}>{o.count}</T>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Android ne dessine pas de pointillés sur un seul côté d'une bordure : la ligne est donc en SVG. */
export function DottedLine() {
  return (
    <View aria-hidden style={{ height: 2 }}>
      <Svg width="100%" height={2}>
        <Line x1="0" y1="1" x2="100%" y2="1" stroke={c.line} strokeWidth={2} strokeDasharray="2 4" />
      </Svg>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <H style={{ fontSize: 20, marginTop: 6 }}>{children}</H>;
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <T style={{ flex: 1, color: c.muted }}>{label}</T>
      <T style={{ fontFamily: strong ? f.display : f.bold, fontSize: strong ? 18 : 15 }}>{value}</T>
    </View>
  );
}

/** Affiche `children` pour un membre connecté, sinon une invitation à se connecter. */
export function RequireAuth({ title, body, tabbed, children }: { title: string; body?: string; tabbed?: boolean; children: (me: Me) => ReactNode }) {
  const { user, ready } = useSession();
  const { t, m } = useI18n();
  const router = useRouter();
  if (!ready) return <Loading />;
  if (user) return <>{children(user)}</>;
  return (
    <Screen {...(tabbed ? { tabbed } : {})}>
      {tabbed ? <H style={{ fontSize: 30 }}>{title}</H> : <PageHeader title={title} />}
      <T style={{ color: c.muted }}>{body ?? m.signInPrompt}</T>
      <PrimaryButton label={t.common.signIn} onPress={() => router.push('/connexion')} />
    </Screen>
  );
}

export const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 60, paddingLeft: 26, paddingRight: 8, paddingVertical: 8, borderRadius: 999, backgroundColor: c.forest },
  primaryLabel: { flexShrink: 1, fontFamily: f.displayBold, fontSize: 18, color: c.white },
  primaryDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.lime },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.white },
  field: { height: 58, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg },
  fieldLabel: { fontSize: 12, fontFamily: f.semi, color: c.muted },
  fieldInput: { padding: 0, fontFamily: f.bold, fontSize: 17, color: c.ink },
});
