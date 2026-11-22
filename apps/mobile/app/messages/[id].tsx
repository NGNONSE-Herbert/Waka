import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type ChatMessage, errorMessage, type Thread } from '../../src/api';
import { time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Send } from '../../src/icons';
import { c, f } from '../../src/theme';
import { BackButton, ErrorBox, H, Loading, T } from '../../src/ui';

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.mine;
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 3, paddingVertical: 10, paddingHorizontal: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: mine ? 20 : 6, borderBottomRightRadius: mine ? 6 : 20, backgroundColor: mine ? c.forest : c.white }}>
      <T style={{ color: mine ? c.white : c.ink }}>{message.text}</T>
      <T style={{ alignSelf: 'flex-end', fontSize: 11, color: mine ? c.onDarkMuted : c.muted }}>{time(message.createdAt)}</T>
    </View>
  );
}

export default function ChatScreen() {
  const { m } = useI18n();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    try {
      setThread(await api.thread(id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 4000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const sent = await api.sendMessage(id, body);
      setText('');
      setThread((cur) => (cur ? { ...cur, items: [...cur.items, sent] } : cur));
    } catch (e) {
      // Le texte reste dans le champ pour pouvoir le corriger.
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  if (!thread) {
    return error ? (
      <View style={{ flex: 1, gap: 12, padding: 16, paddingTop: insets.top + 12, backgroundColor: c.bg }}>
        <BackButton fallback="/trajets" />
        <ErrorBox message={error} onRetry={load} />
      </View>
    ) : (
      <Loading />
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} {...(Platform.OS === 'web' ? {} : { behavior: 'padding' as const })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10 }}>
        <BackButton fallback="/trajets" />
        <View style={{ flex: 1 }}>
          <H numberOfLines={1} style={{ fontSize: 20 }}>{fmt(m.chatTitle, { name: thread.otherParty.displayName })}</H>
          <T numberOfLines={2} style={{ fontSize: 12, color: c.muted }}>{m.chatRules}</T>
        </View>
      </View>

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={thread.items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => <Bubble message={item} />}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<T style={{ textAlign: 'center', color: c.muted, paddingHorizontal: 20, paddingBottom: 20 }}>{m.chatEmpty}</T>}
      />

      <View style={{ gap: 8, paddingTop: 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
        {error ? <ErrorBox message={error} /> : null}
        {thread.canSend ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              accessibilityLabel={m.chatPlaceholder}
              value={text}
              onChangeText={setText}
              placeholder={m.chatPlaceholder}
              placeholderTextColor={c.muted}
              multiline
              maxLength={500}
              style={{ flex: 1, minHeight: 52, maxHeight: 120, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 26, borderWidth: 1, borderColor: c.line, backgroundColor: c.white, fontFamily: f.body, fontSize: 16, color: c.ink }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.chatSend}
              accessibilityState={{ disabled: !text.trim() || sending }}
              disabled={!text.trim() || sending}
              onPress={() => void send()}
              style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? c.lime : c.line }}
            >
              {sending ? <ActivityIndicator color={c.ink} /> : <Send size={20} />}
            </Pressable>
          </View>
        ) : (
          <T style={{ textAlign: 'center', fontFamily: f.semi, color: c.muted }}>{m.chatClosed}</T>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
