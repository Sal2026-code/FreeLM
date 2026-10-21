import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { STUDIO_GRID_TOOLS, STUDIO_TOOL_MAP } from '@freelm/shared';

import { api } from '../../../src/api';
import { Button, Empty, Loader } from '../../../src/components/ui';
import { useNotebook } from '../../../src/notebook-context';
import { colors, fontSize, radius, spacing } from '../../../src/theme';

export default function StudioScreen() {
  const router = useRouter();
  const { notebookId, outputs, notes, refresh, loading, selectedSourceIds } =
    useNotebook();
  const [busy, setBusy] = useState<string | null>(null);

  async function generate(type: string) {
    setBusy(type);
    try {
      const output = await api.generate(notebookId, {
        type,
        sourceIds: selectedSourceIds,
        language: 'en',
        options: {},
      });
      await refresh();
      router.push(`/output/${output.id}?notebookId=${notebookId}`);
    } catch (error) {
      Alert.alert(
        'Could not generate that',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Loader label="Loading studio…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={STUDIO_GRID_TOOLS}
        keyExtractor={(item) => item}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.sectionTitle}>Create</Text>
            <Text style={styles.hint}>
              Every tool is free and unlocked, and grounded in your sources.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tool = STUDIO_TOOL_MAP[item];
          if (!tool) return null;
          const isBusy = busy === item;

          return (
            <Pressable
              onPress={() => void generate(item)}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.tool,
                pressed && { opacity: 0.7 },
              ]}
            >
              {isBusy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={{ fontSize: 22 }}>{toolIcon(tool.icon)}</Text>
              )}
              <Text style={styles.toolLabel}>{tool.label}</Text>
              <Text style={styles.toolDescription} numberOfLines={2}>
                {tool.description}
              </Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionTitle}>Saved outputs</Text>
            {outputs.length === 0 ? (
              <Empty
                icon="✨"
                title="Studio output will be saved here."
                message="Generate something above and it will appear in this list."
              />
            ) : (
              outputs.map((output) => {
                const tool = STUDIO_TOOL_MAP[output.type];
                return (
                  <Pressable
                    key={output.id}
                    onPress={() =>
                      router.push(
                        `/output/${output.id}?notebookId=${notebookId}`,
                      )
                    }
                    style={({ pressed }) => [
                      styles.output,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={{ fontSize: 18 }}>{toolIcon(tool?.icon)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.outputTitle} numberOfLines={1}>
                        {output.title}
                      </Text>
                      <Text style={styles.outputMeta}>
                        {tool?.label ?? output.type}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textFaint }}>›</Text>
                  </Pressable>
                );
              })
            )}

            {notes.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
                  Notes
                </Text>
                {notes.map((note) => (
                  <View key={note.id} style={styles.output}>
                    <Text style={{ fontSize: 18 }}>🗒️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.outputTitle} numberOfLines={1}>
                        {note.title}
                      </Text>
                    </View>
                    <Pressable
                      onPress={async () => {
                        try {
                          await api.promoteNote(notebookId, note.id);
                          await refresh();
                        } catch (error) {
                          Alert.alert(
                            'Could not add that note as a source',
                            error instanceof Error ? error.message : undefined,
                          );
                        }
                      }}
                    >
                      <Text style={{ color: colors.accent, fontSize: fontSize.sm }}>
                        Add as source
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        }
      />

      <View style={styles.footer}>
        <Button
          label="+ Add note"
          onPress={() =>
            Alert.prompt?.(
              'New note',
              'What would you like to remember?',
              async (text) => {
                if (!text) return;
                try {
                  await api.createNote(notebookId, 'Note', text);
                  await refresh();
                } catch {
                  /* ignore */
                }
              },
            ) ?? undefined
          }
        />
      </View>
    </SafeAreaView>
  );
}

function toolIcon(icon?: string): string {
  const map: Record<string, string> = {
    graphic_eq: '🎧',
    movie: '🎬',
    account_tree: '🌳',
    description: '📄',
    view_carousel: '🖼️',
    polyline: '📊',
    style: '🃏',
    quiz: '❓',
    table_chart: '📋',
    school: '🎓',
    calculate: '🧮',
  };
  return (icon && map[icon]) || '✨';
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: 2,
  },
  hint: { color: colors.textFaint, fontSize: fontSize.sm },
  tool: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  toolLabel: {
    color: colors.text,
    fontSize: fontSize.base,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  toolDescription: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    lineHeight: 15,
    marginTop: 2,
  },
  output: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  outputTitle: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
  outputMeta: { color: colors.textFaint, fontSize: fontSize.xs, marginTop: 2 },
  footer: {
    borderTopColor: colors.hairline,
    borderTopWidth: 1,
    padding: spacing.md,
  },
});
