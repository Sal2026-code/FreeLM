import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Source } from '@freelm/shared';
import { SOURCE_STATUS_LABEL } from '@freelm/shared';

import { api } from '../../../src/api';
import { Button, Empty, Loader } from '../../../src/components/ui';
import { useNotebook } from '../../../src/notebook-context';
import { colors, fontSize, radius, sourceTypeIcons, spacing } from '../../../src/theme';

export default function SourcesScreen() {
  const router = useRouter();
  const {
    notebookId,
    sources,
    selectedSourceIds,
    setSelectedSourceIds,
    refresh,
    loading,
  } = useNotebook();

  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = useCallback(
    (id: string) => {
      setSelectedSourceIds(
        selectedSourceIds.includes(id)
          ? selectedSourceIds.filter((value) => value !== id)
          : [...selectedSourceIds, id],
      );
    },
    [selectedSourceIds, setSelectedSourceIds],
  );

  async function remove(source: Source) {
    Alert.alert('Remove source?', `“${source.title}” will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(source.id);
          try {
            await api.deleteSource(notebookId, source.id);
            await refresh();
          } catch (error) {
            Alert.alert(
              'Could not remove that source',
              error instanceof Error ? error.message : undefined,
            );
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  async function retry(source: Source) {
    setBusyId(source.id);
    try {
      await api.retrySource(notebookId, source.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Loader label="Loading sources…" />
      </SafeAreaView>
    );
  }

  const readyCount = sources.filter((source) => source.status === 'ready').length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.count}>
              {readyCount} of {sources.length} ready
            </Text>
            <Text style={styles.hint}>
              Tap the circle to include or exclude a source from your questions.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Empty
            icon="📥"
            title="No sources yet"
            message="Add PDFs, websites, videos, images or plain text to get started."
          />
        }
        renderItem={({ item }) => {
          const selected = selectedSourceIds.includes(item.id);
          const busy = item.status !== 'ready' && item.status !== 'error';

          return (
            <View style={styles.row}>
              <Text style={styles.icon}>
                {sourceTypeIcons[item.type] ?? '📄'}
              </Text>

              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {busy ? (
                  <Text style={styles.status}>
                    {SOURCE_STATUS_LABEL[item.status]}…{' '}
                    {item.progress > 0 ? `${item.progress}%` : ''}
                  </Text>
                ) : item.status === 'error' ? (
                  <Pressable onPress={() => void retry(item)}>
                    <Text style={styles.error} numberOfLines={2}>
                      {item.error ?? 'Import failed'} · Tap to retry
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.meta}>
                    {item.chunkCount} chunks
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => toggle(item.id)}
                style={[styles.check, selected && styles.checkActive]}
              >
                {selected ? <Text style={{ color: '#fff' }}>✓</Text> : null}
              </Pressable>

              <Pressable
                onPress={() => void remove(item)}
                disabled={busyId === item.id}
                style={{ padding: 6 }}
              >
                <Text style={{ color: colors.textFaint, fontSize: 18 }}>⋯</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          label="+ Add a source"
          variant="primary"
          onPress={() => router.push(`/capture?notebookId=${notebookId}`)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  header: { marginBottom: spacing.md },
  count: { color: colors.text, fontSize: fontSize.base, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: fontSize.sm, marginTop: 2 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  icon: { fontSize: 22 },
  title: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
  status: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: 2 },
  meta: { color: colors.textFaint, fontSize: fontSize.sm, marginTop: 2 },
  check: {
    alignItems: 'center',
    borderColor: colors.hairlineStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  footer: {
    borderTopColor: colors.hairline,
    borderTopWidth: 1,
    padding: spacing.md,
  },
});
