import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Notebook } from '@freelm/shared';

import { api } from '../../src/api';
import { Body, Button, Chip, Empty, FadeIn, Loader, Title } from '../../src/components/ui';
import { colors, fontSize, radius, spacing } from '../../src/theme';

type Scope = 'all' | 'mine' | 'featured';

export default function NotebooksScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('mine');
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listNotebooks(scope);
      setNotebooks(list);
    } catch (error) {
      Alert.alert(
        'Could not load notebooks',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = notebooks.filter((notebook) =>
    notebook.title.toLowerCase().includes(search.toLowerCase()),
  );

  async function createNotebook() {
    try {
      const notebook = await api.createNotebook({
        title: 'Untitled notebook',
        icon: '📓',
      });
      router.push(`/notebook/${notebook.id}`);
    } catch (error) {
      Alert.alert(
        'Could not create the notebook',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Title>
          {scope === 'featured'
            ? 'Featured notebooks'
            : scope === 'all'
              ? 'All notebooks'
              : 'My notebooks'}
        </Title>
        <View style={styles.headerActions}>
          <Pressable onPress={() => void createNotebook()} style={styles.newButton}>
            <Text style={styles.newButtonLabel}>+ New</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.scopeRow}>
        {(
          [
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'My notebooks' },
            { value: 'featured', label: 'Featured' },
          ] as { value: Scope; label: string }[]
        ).map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={scope === option.value}
            onPress={() => setScope(option.value)}
          />
        ))}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search notebooks"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
        />
      </View>

      {loading ? (
        <Loader label="Loading notebooks…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={colors.textMuted}
            />
          }
          ListEmptyComponent={
            <Empty
              icon="📓"
              title="No notebooks yet"
              message="Create a notebook to start adding sources and asking questions."
            />
          }
          renderItem={({ item, index }) => (
            <FadeIn delay={Math.min(index, 8) * 45}>
              <Pressable
                onPress={() => router.push(`/notebook/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.icon}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.description ? (
                      <Body muted numberOfLines={2}>
                        {item.description}
                      </Body>
                    ) : null}
                    <Text style={styles.cardMeta}>
                      {item.sourceCount}{' '}
                      {item.sourceCount === 1 ? 'source' : 'sources'} ·{' '}
                      {item.threadCount}{' '}
                      {item.threadCount === 1 ? 'chat' : 'chats'}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            </FadeIn>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  newButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  newButtonLabel: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
  },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  search: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  cardRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  icon: { fontSize: 28 },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardMeta: { color: colors.textFaint, fontSize: fontSize.xs, marginTop: 4 },
  chevron: { color: colors.textFaint, fontSize: 24 },
});
