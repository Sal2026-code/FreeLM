import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResizeMode, Video } from 'expo-av';

import type {
  AudioOverviewContent,
  DataTable as DataTableContent,
  Flashcard,
  QuizQuestion,
  StudioOutput,
  VideoOverviewContent,
} from '@freelm/shared';

import { api, getApiUrl } from '../../src/api';
import { Markdown } from '../../src/components/Markdown';
import { Body, Button, Card, Empty, Loader } from '../../src/components/ui';
import { colors, fontSize, radius, spacing } from '../../src/theme';

export default function OutputScreen() {
  const { id, notebookId } = useLocalSearchParams<{
    id: string;
    notebookId: string;
  }>();
  const [output, setOutput] = useState<StudioOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !notebookId) return;
    let cancelled = false;

    (async () => {
      try {
        const outputs = await api.listOutputs(notebookId);
        const found = outputs.find((item) => item.id === id) ?? null;
        if (cancelled) return;
        if (!found) {
          setError('This Studio output is no longer available.');
        } else {
          setOutput(found);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : 'Could not load the output.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, notebookId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Loader label="Loading output…" />
      </SafeAreaView>
    );
  }

  if (error || !output) {
    return (
      <SafeAreaView style={styles.safe}>
        <Empty
          icon="🫙"
          title="Output not found"
          message={error ?? 'This Studio output is no longer available.'}
        />
      </SafeAreaView>
    );
  }

  return <OutputBody output={output} />;
}

function OutputBody({ output }: { output: StudioOutput }) {
  switch (output.type) {
    case 'audio_overview':
      return <AudioView output={output} />;
    case 'video_overview':
      return <VideoView output={output} />;
    case 'quiz':
      return <QuizView output={output} />;
    case 'flashcards':
      return <FlashcardView output={output} />;
    case 'data_table':
      return <TableView output={output} />;
    default:
      return (
        <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
          <Text style={styles.title}>{output.title}</Text>
          <Markdown
            content={
              typeof output.content === 'string'
                ? output.content
                : JSON.stringify(output.content, null, 2)
            }
          />
        </ScrollView>
      );
  }
}

function AudioView({ output }: { output: StudioOutput }) {
  const content = output.content as AudioOverviewContent;
  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.title}>{output.title}</Text>
      {output.fileUrl ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.muted}>
            Audio Overviews are generated as a real .mp3 file. Download it from
            the web app, or stream it here once the file is ready.
          </Text>
        </Card>
      ) : (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.accent} />
      )}
      {content?.transcript?.length ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          {content.transcript.map((turn, index) => (
            <Text key={index} style={styles.transcript}>
              <Text style={{ fontWeight: '700' }}>{turn.speaker}: </Text>
              {turn.text}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function VideoView({ output }: { output: StudioOutput }) {
  const content = output.content as VideoOverviewContent;
  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.title}>{output.title}</Text>
      {output.fileUrl ? (
        <Video
          source={{ uri: `${getApiUrl()}${output.fileUrl}` }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={false}
        />
      ) : (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.accent} />
      )}
      {content?.scenes?.length ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.sectionTitle}>Scenes</Text>
          {content.scenes.map((scene, index) => (
            <Card key={index} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.sceneHeading}>{scene.heading}</Text>
              {scene.bullets?.map((bullet, bulletIndex) => (
                <Text key={bulletIndex} style={styles.bullet}>
                  • {bullet}
                </Text>
              ))}
              {scene.narration ? (
                <Text style={styles.narration}>“{scene.narration}”</Text>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function QuizView({ output }: { output: StudioOutput }) {
  const questions = (
    (output.content as { questions?: QuizQuestion[] })?.questions ?? []
  ) as QuizQuestion[];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);

  const current = questions[index];

  function isCorrect(question: QuizQuestion, answer: string | string[]): boolean {
    if (question.type === 'multiple_select') {
      const selected = (Array.isArray(answer) ? answer : [answer]).map(Number).sort();
      const expected = [...(question.correctOptions ?? [])].sort();
      return (
        selected.length === expected.length &&
        selected.every((value, position) => value === expected[position])
      );
    }
    if (question.type === 'short_answer' || question.type === 'fill_in_blank') {
      return (
        String(answer).trim().toLowerCase() === String(question.answer).trim().toLowerCase()
      );
    }
    return answer === question.answer;
  }

  if (questions.length === 0) {
    return <Empty icon="❓" title="No questions" message="This quiz is empty." />;
  }

  if (finished) {
    const right = questions.filter(
      (question) => answers[question.id] && isCorrect(question, answers[question.id]!),
    ).length;
    const wrong = questions.filter(
      (question) =>
        answers[question.id] && !isCorrect(question, answers[question.id]!),
    ).length;
    const skipped = questions.length - right - wrong;

    return (
      <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.title}>Quiz complete</Text>
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.resultBig}>
            {Math.round((right / questions.length) * 100)}%
          </Text>
          <Body muted>Right: {right}</Body>
          <Body muted>Wrong: {wrong}</Body>
          <Body muted>Skipped: {skipped}</Body>
        </Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label="Review"
            onPress={() => {
              setFinished(false);
              setIndex(0);
              setRevealed(false);
            }}
          />
          <Button
            label="Retake"
            variant="primary"
            onPress={() => {
              setAnswers({});
              setIndex(0);
              setRevealed(false);
              setFinished(false);
            }}
          />
        </View>
      </ScrollView>
    );
  }

  if (!current) return null;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.muted}>
        {index + 1} / {questions.length} · {current.topic}
      </Text>
      <Text style={styles.question}>{current.prompt}</Text>

      {current.type === 'multiple_choice' || current.type === 'multiple_select' ? (
        (current.options ?? []).map((option, optionIndex) => {
          const selected =
            current.type === 'multiple_select'
              ? Array.isArray(answers[current.id]) &&
                (answers[current.id] as string[]).includes(String(optionIndex))
              : answers[current.id] === option;
          const isRight =
            current.type === 'multiple_select'
              ? (current.correctOptions ?? []).includes(optionIndex)
              : current.answer === option;

          return (
            <Pressable
              key={optionIndex}
              onPress={() => {
                if (current.type === 'multiple_select') {
                  setAnswers((prev) => {
                    const list = Array.isArray(prev[current.id])
                      ? (prev[current.id] as string[])
                      : [];
                    return {
                      ...prev,
                      [current.id]: list.includes(String(optionIndex))
                        ? list.filter((value) => value !== String(optionIndex))
                        : [...list, String(optionIndex)],
                    };
                  });
                } else {
                  setAnswers((prev) => ({ ...prev, [current.id]: option }));
                }
                setRevealed(false);
              }}
              style={[
                styles.option,
                revealed && isRight && { borderColor: colors.success },
                revealed && selected && !isRight && { borderColor: colors.danger },
                selected && !revealed && { borderColor: colors.accent },
              ]}
            >
              <Text style={styles.optionText}>
                {String.fromCharCode(65 + optionIndex)}. {option}
              </Text>
            </Pressable>
          );
        })
      ) : (
        <TextInputField
          value={
            typeof answers[current.id] === 'string'
              ? (answers[current.id] as string)
              : ''
          }
          onChangeText={(text) =>
            setAnswers((prev) => ({ ...prev, [current.id]: text }))
          }
        />
      )}

      {revealed ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.muted}>Answer</Text>
          <Text style={styles.answer}>{current.answer}</Text>
          {current.explanation ? (
            <Text style={styles.explanation}>{current.explanation}</Text>
          ) : null}
        </Card>
      ) : null}

      <Button
        label={revealed ? (index + 1 >= questions.length ? 'Finish' : 'Next') : 'Check answer'}
        variant="primary"
        style={{ marginTop: spacing.md }}
        onPress={() => {
          if (revealed) {
            if (index + 1 >= questions.length) setFinished(true);
            else {
              setIndex(index + 1);
              setRevealed(false);
            }
          } else {
            setRevealed(true);
          }
        }}
      />
    </ScrollView>
  );
}

function FlashcardView({ output }: { output: StudioOutput }) {
  const cards = ((output.content as { cards?: Flashcard[] })?.cards ?? []) as Flashcard[];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (cards.length === 0) {
    return <Empty icon="🃏" title="No cards" message="This deck is empty." />;
  }

  const current = cards[index]!;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.muted}>
        {index + 1} / {cards.length}
      </Text>
      <Pressable
        onPress={() => setRevealed((value) => !value)}
        style={styles.card}
      >
        <Text style={styles.question}>{current.question}</Text>
        {revealed ? (
          <Text style={styles.answer}>{current.answer}</Text>
        ) : (
          <Text style={styles.muted}>Tap to reveal</Text>
        )}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          label="Missed"
          onPress={() => {
            setIndex(Math.min(index + 1, cards.length - 1));
            setRevealed(false);
          }}
        />
        <Button
          label="Got it"
          variant="primary"
          onPress={() => {
            setIndex(Math.min(index + 1, cards.length - 1));
            setRevealed(false);
          }}
        />
      </View>
    </ScrollView>
  );
}

function TableView({ output }: { output: StudioOutput }) {
  const content = output.content as DataTableContent;
  if (!content?.columns?.length) {
    return <Empty icon="📋" title="No table" message="This output is empty." />;
  }

  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.title}>{content.title}</Text>
      <ScrollView horizontal style={{ marginTop: spacing.md }}>
        <View>
          <View style={[styles.tableRow, styles.tableHeader]}>
            {content.columns.map((column) => (
              <Text key={column.key} style={styles.tableCellHeader}>
                {column.header}
              </Text>
            ))}
          </View>
          {content.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.tableRow}>
              {content.columns.map((column) => (
                <Text key={column.key} style={styles.tableCell}>
                  {row[column.key] ?? '—'}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

function TextInputField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Type your answer"
      placeholderTextColor={colors.textFaint}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.base,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  question: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    lineHeight: 23,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  option: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  optionText: { color: colors.text, fontSize: fontSize.base, lineHeight: 21 },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  answer: {
    color: colors.text,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginTop: 4,
  },
  explanation: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  resultBig: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  transcript: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  sceneHeading: {
    color: colors.text,
    fontSize: fontSize.base,
    fontWeight: '700',
    marginBottom: 4,
  },
  bullet: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  narration: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  video: {
    backgroundColor: '#000',
    borderRadius: radius.md,
    height: 210,
    marginTop: spacing.md,
    width: '100%',
  },
  tableRow: { flexDirection: 'row' },
  tableHeader: { backgroundColor: colors.surface2 },
  tableCellHeader: {
    borderColor: colors.hairline,
    borderWidth: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    padding: spacing.sm,
    width: 150,
  },
  tableCell: {
    borderColor: colors.hairline,
    borderWidth: 1,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    padding: spacing.sm,
    width: 150,
  },
});
