/**
 * FreeLM — mobile emoji icon picker.
 *
 * Uses the device's **own emoji keyboard**: the text field raises the
 * operating system's emoji panel, so every emoji the device supports is
 * available.
 */

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  emojiPickerHint,
  extractEmoji,
  FREQUENT_NOTEBOOK_EMOJIS,
  isEmoji,
} from '@freelm/shared';

import { Body, Button, Field } from './ui';
import { colors, fontSize, radius, spacing } from '../theme';

export function EmojiIconPicker({
  value,
  onChange,
  onDone,
}: {
  value: string;
  onChange: (emoji: string) => void;
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const valid = isEmoji(draft);

  const hint =
    Platform.OS === 'ios'
      ? 'Tap the globe key 🌐 on the keyboard to open the emoji picker.'
      : 'Tap the emoji key 😊 on the keyboard to open the emoji picker.';

  function commit() {
    const emoji = extractEmoji(draft);
    if (!emoji) return;
    onChange(emoji);
    onDone?.();
  }

  return (
    <View style={styles.container}>
      <Body muted>Icon</Body>

      <View style={styles.previewRow}>
        <Field
          value={draft}
          onChangeText={(text) => {
            const emoji = extractEmoji(text);
            setDraft(emoji ?? text.slice(-2));
          }}
          placeholder="😀"
          style={styles.input}
          maxLength={4}
        />
        <View style={styles.preview}>
          <Text style={{ fontSize: 26 }}>{draft || '😀'}</Text>
        </View>
      </View>

      <Text style={styles.hint}>{emojiPickerHint(Platform.OS)}</Text>
      {!valid && draft.length > 0 ? (
        <Text style={styles.warning}>That does not look like an emoji yet.</Text>
      ) : null}

      <Text style={[styles.hint, { marginTop: spacing.lg }]}>
        Frequently used
      </Text>
      <View style={styles.grid}>
        {FREQUENT_NOTEBOOK_EMOJIS.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => setDraft(emoji)}
            style={({ pressed }) => [
              styles.gridItem,
              draft === emoji && styles.gridItemActive,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <Button
        label="Use this icon"
        variant="primary"
        disabled={!valid}
        onPress={commit}
        style={{ marginTop: spacing.lg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  input: {
    fontSize: 28,
    height: 60,
    textAlign: 'center',
    width: 80,
  },
  preview: {
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  hint: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm },
  warning: { color: colors.warning, fontSize: fontSize.sm, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  gridItem: {
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    margin: 3,
    width: 44,
  },
  gridItemActive: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
});
