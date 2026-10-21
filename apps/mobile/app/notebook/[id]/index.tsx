import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';

import type { Message } from '@freelm/shared';
import { CHAT_MODES } from '@freelm/shared';

import { streamChat } from '../../../src/api';
import { Markdown } from '../../../src/components/Markdown';
import { Banner, Chip, Empty, Loader } from '../../../src/components/ui';
import { useNotebook } from '../../../src/notebook-context';
import { colors, fontSize, radius, spacing } from '../../../src/theme';

export default function ChatScreen() {
  const router = useRouter();
  const {
    notebookId,
    notebook,
    messages,
    setMessages,
    activeThreadId,
    overview,
    sources,
    selectedSourceIds,
    setSelectedSourceIds,
    refreshOverview,
    createThread,
    loading,
  } = useNotebook();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<string>('exploratory');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const abortRef = useRef<AbortController | null>(null);

  const readyCount = sources.filter((source) => source.status === 'ready').length;

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      if (!activeThreadId) {
        await createThread();
        return;
      }

      setInput('');
      setError(null);
      setSending(true);

      const optimistic: Message = {
        id: `local-${Date.now()}`,
        threadId: activeThreadId,
        role: 'user',
        content,
        mode: mode as never,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);

      const controller = new AbortController();
      abortRef.current = controller;
      let assistantText = '';
      let citations: Message['citations'] = [];

      try {
        await streamChat(
          notebookId,
          activeThreadId,
          {
            content,
            mode,
            scope,
            ...(scope === 'selected' ? { sourceIds: selectedSourceIds } : {}),
          },
          {
            onToken: (token) => {
              assistantText += token;
              setMessages((current) => {
                const last = current[current.length - 1];
                if (
                  !last ||
                  last.role !== 'assistant' ||
                  !last.id.startsWith('local-')
                ) {
                  return [
                    ...current,
                    {
                      id: `streaming-${Date.now()}`,
                      threadId: activeThreadId,
                      role: 'assistant',
                      content: assistantText,
                      mode: mode as never,
                      citations,
                      createdAt: new Date().toISOString(),
                    },
                  ];
                }
                return [...current.slice(0, -1), { ...last, content: assistantText }];
              });
            },
            onCitations: (next) => {
              citations = next;
            },
            onDone: (message) => {
              setMessages((current) => [
                ...current.filter((item) => !item.id.startsWith('local-')),
                message,
              ]);
            },
            onError: (caught) => {
              setError(caught.error);
              setMessages((current) => current.slice(0, -1));
            },
          },
          controller.signal,
        );
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Something went wrong.',
        );
        setMessages((current) => current.slice(0, -1));
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [
      activeThreadId,
      createThread,
      mode,
      notebookId,
      scope,
      selectedSourceIds,
      sending,
      setMessages,
    ],
  );

  /** Read the last answer aloud — the mobile voice-conversation feature. */
  function speakLast() {
    const last = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (!last) return;
    setSpeaking(true);
    Speech.stop();
    Speech.speak(last.content.replace(/\[\[C:[^\]]+\]\]/g, ''), {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Loader label="Opening notebook…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {error ? (
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
            <Banner
              tone="error"
              title="Could not answer that"
              message={error}
              onRetry={() => void send(input)}
            />
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 20 }}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            overview?.content ? (
              <View style={{ marginBottom: spacing.lg }}>
                <View style={styles.overviewHeader}>
                  <Text style={{ fontSize: 34 }}>{notebook?.icon ?? '📓'}</Text>
                  <Text style={styles.overviewSourceCount}>
                    {readyCount} {readyCount === 1 ? 'source' : 'sources'}
                  </Text>
                  <Text style={styles.overviewTitle}>{notebook?.title}</Text>
                </View>
                <Markdown
                  content={overview.content}
                  citations={overview.citations}
                />
                {overview.suggestedQuestions.length > 0 ? (
                  <View style={{ marginTop: spacing.md }}>
                    {overview.suggestedQuestions.map((question) => (
                      <Chip
                        key={question}
                        label={question}
                        onPress={() => void send(question)}
                        style={{ alignSelf: 'flex-start' }}
                      />
                    ))}
                  </View>
                ) : null}
                <Pressable onPress={() => void refreshOverview()} style={styles.refresh}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                    Refresh overview
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Empty
                icon={readyCount > 0 ? '💬' : '📥'}
                title={readyCount > 0 ? 'Ask about your sources' : 'Add a source to get started'}
                message={
                  readyCount > 0
                    ? 'Every answer is grounded in your sources and cites the exact passage it used.'
                    : 'Open the Sources tab to add a PDF, website, video or plain text.'
                }
              />
            )
          }
          renderItem={({ item }) => (
            <View
              style={item.role === 'user' ? styles.userBubble : styles.assistantBubble}
            >
              {item.role === 'assistant' ? (
                <Markdown
                  content={item.content}
                  citations={item.citations}
                  onCitationClick={() => router.push('/notebook/' + notebookId)}
                />
              ) : (
                <Text style={styles.userText}>{item.content}</Text>
              )}
            </View>
          )}
        />

        {/* Mode + scope controls */}
        <View style={styles.controls}>
          <FlatList
            horizontal
            data={CHAT_MODES}
            keyExtractor={(item) => item.value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 6 }}
            renderItem={({ item }) => (
              <Chip
                label={item.label}
                selected={mode === item.value}
                onPress={() => setMode(item.value)}
              />
            )}
          />
        </View>

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={
              readyCount > 0 ? 'Start typing…' : 'Add a source to start researching'
            }
            placeholderTextColor={colors.textFaint}
            multiline
            style={styles.input}
            editable={readyCount > 0}
          />
          <Pressable
            onPress={() => void send(input)}
            disabled={readyCount === 0 || !input.trim() || sending}
            style={[
              styles.sendButton,
              (readyCount === 0 || !input.trim() || sending) && {
                opacity: 0.4,
              },
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 18 }}>↑</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footerRow}>
          <Pressable onPress={speakLast} disabled={speaking}>
            <Text style={styles.footerAction}>
              {speaking ? '🔊 Speaking…' : '🔊 Read aloud'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setScope(scope === 'all' ? 'selected' : 'all')}
          >
            <Text style={styles.footerAction}>
              {scope === 'all'
                ? `All sources (${readyCount})`
                : `${selectedSourceIds.length} selected`}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/notebook/${notebookId}/studio`)}>
            <Text style={styles.footerAction}>Studio →</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  overviewHeader: { marginBottom: spacing.md },
  overviewSourceCount: { color: colors.textMuted, fontSize: fontSize.sm },
  overviewTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginTop: 2,
  },
  refresh: { marginTop: spacing.md },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    maxWidth: '88%',
    padding: spacing.md,
  },
  userText: { color: colors.text, fontSize: fontSize.md, lineHeight: 22 },
  assistantBubble: { marginBottom: spacing.lg },
  controls: { paddingVertical: spacing.xs },
  composer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: fontSize.base,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  footerAction: { color: colors.textMuted, fontSize: fontSize.sm },
});
