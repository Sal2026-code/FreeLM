import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

import { api } from '../src/api';
import { Button, Card, Field, Label } from '../src/components/ui';
import { colors, fontSize, radius, spacing } from '../src/theme';

type Mode = 'file' | 'website' | 'text' | 'youtube' | 'photo' | 'voice';

export default function CaptureScreen() {
  const router = useRouter();
  const { notebookId } = useLocalSearchParams<{ notebookId: string }>();
  const [mode, setMode] = useState<Mode>('file');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [textTitle, setTextTitle] = useState('');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      router.back();
    } catch (error) {
      Alert.alert(
        'Could not add that source',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    const assets = result.assets ?? [];
    if (assets.length === 0) return;

    await run(async () => {
      for (const asset of assets) {
        await api.uploadFile(notebookId, {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        });
      }
    });
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission needed',
        'Allow camera access so FreeLM can scan notes and worksheets.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    await run(async () => {
      await api.uploadFile(notebookId, {
        uri: asset.uri,
        name: asset.fileName ?? `scan-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    });
  }

  /** Record a voice memo and store the transcript as a source. */
  async function recordVoiceMemo() {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Microphone permission needed',
        'Allow microphone access to record a lecture or a thought.',
      );
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    await recording.startAsync();

    Alert.alert(
      'Recording',
      'Recording is running. Press OK to stop and save it as a source.',
      [
        {
          text: 'Stop and save',
          onPress: async () => {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            if (!uri) return;
            try {
              await api.uploadFile(notebookId, {
                uri,
                name: `voice-memo-${Date.now()}.m4a`,
                mimeType: 'audio/mp4',
              });
              router.back();
            } catch (error) {
              Alert.alert(
                'Could not save that recording',
                error instanceof Error ? error.message : undefined,
              );
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  const modes: { id: Mode; label: string; icon: string }[] = [
    { id: 'file', label: 'Files', icon: '📄' },
    { id: 'photo', label: 'Photo', icon: '📷' },
    { id: 'voice', label: 'Voice memo', icon: '🎙️' },
    { id: 'website', label: 'Website', icon: '🌐' },
    { id: 'youtube', label: 'YouTube', icon: '▶️' },
    { id: 'text', label: 'Text', icon: '📝' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={styles.modeRow}>
          {modes.map((option) => (
            <Text
              key={option.id}
              onPress={() => setMode(option.id)}
              style={[
                styles.mode,
                mode === option.id && styles.modeActive,
              ]}
            >
              {option.icon} {option.label}
            </Text>
          ))}
        </View>

        <Card style={{ marginTop: spacing.lg }}>
          {mode === 'file' ? (
            <>
              <Label>Upload a file</Label>
              <Text style={styles.hint}>
                PDFs, documents, spreadsheets, slides, images, audio and more.
              </Text>
              <Button
                label="Choose files"
                variant="primary"
                loading={busy}
                style={{ marginTop: spacing.md }}
                onPress={() => void pickFile()}
              />
            </>
          ) : null}

          {mode === 'photo' ? (
            <>
              <Label>Scan a note</Label>
              <Text style={styles.hint}>
                Photograph handwritten notes, worksheets or a textbook page. The
                text is extracted with OCR.
              </Text>
              <Button
                label="Open camera"
                variant="primary"
                loading={busy}
                style={{ marginTop: spacing.md }}
                onPress={() => void takePhoto()}
              />
            </>
          ) : null}

          {mode === 'voice' ? (
            <>
              <Label>Record a voice memo</Label>
              <Text style={styles.hint}>
                Capture a lecture or a thought. It is transcribed and saved
                alongside your other sources.
              </Text>
              <Button
                label="Start recording"
                variant="primary"
                loading={busy}
                style={{ marginTop: spacing.md }}
                onPress={() => void recordVoiceMemo()}
              />
            </>
          ) : null}

          {mode === 'website' ? (
            <>
              <Label>Web address</Label>
              <Field
                value={url}
                onChangeText={setUrl}
                placeholder="https://example.com/article"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Button
                label="Add website"
                variant="primary"
                loading={busy}
                disabled={!url.trim()}
                style={{ marginTop: spacing.md }}
                onPress={() =>
                  void run(async () => {
                    await api.addWebSource(notebookId, url.trim());
                  })
                }
              />
            </>
          ) : null}

          {mode === 'youtube' ? (
            <>
              <Label>YouTube URL</Label>
              <Field
                value={url}
                onChangeText={setUrl}
                placeholder="https://www.youtube.com/watch?v=…"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Text style={styles.hint}>
                The video transcript is imported. Public videos with captions
                work best.
              </Text>
              <Button
                label="Add video"
                variant="primary"
                loading={busy}
                disabled={!url.trim()}
                style={{ marginTop: spacing.md }}
                onPress={() =>
                  void run(async () => {
                    await api.addYouTubeSource(notebookId, url.trim());
                  })
                }
              />
            </>
          ) : null}

          {mode === 'text' ? (
            <>
              <Label>Title (optional)</Label>
              <Field
                value={textTitle}
                onChangeText={setTextTitle}
                placeholder="Copied text"
              />
              <View style={{ height: spacing.sm }} />
              <Label>Text</Label>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Paste any text here"
                placeholderTextColor={colors.textFaint}
                multiline
                style={styles.textarea}
              />
              <Button
                label="Add text"
                variant="primary"
                loading={busy}
                disabled={!text.trim()}
                style={{ marginTop: spacing.md }}
                onPress={() =>
                  void run(async () => {
                    await api.addTextSource(
                      notebookId,
                      textTitle.trim() || 'Copied text',
                      text,
                    );
                  })
                }
              />
            </>
          ) : null}
        </Card>

        <Text style={styles.footnote}>
          There is no limit on how many sources you can add.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mode: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  modeActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    color: colors.accent,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 19,
    marginTop: 4,
  },
  textarea: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: fontSize.base,
    minHeight: 140,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  footnote: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
