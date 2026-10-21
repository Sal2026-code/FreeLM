/**
 * FreeLM — mobile markdown renderer with inline citation chips.
 *
 * A deliberately small renderer: headings, bold, italic, inline code, bullet
 * and numbered lists, and citation chips. It covers what the model produces
 * without pulling in a full markdown engine for React Native.
 */

import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Citation } from '@freelm/shared';
import { parseCitations } from '@freelm/shared';

import { colors, fontSize } from '../theme';

interface Props {
  content: string;
  citations?: Citation[];
  onCitationClick?: (chunkId: string) => void;
}

function renderInline(
  text: string,
  keyPrefix: string,
): React.ReactNode[] {
  // Bold, italic and inline code, applied in one pass.
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  const parts = text.split(pattern);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={key} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      return (
        <Text key={key} style={styles.italic}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Text key={key} style={styles.code}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function Markdown({
  content,
  citations = [],
  onCitationClick,
}: Props) {
  const parsed = parseCitations(content);
  const citationMap = new Map(citations.map((c) => [c.chunkId, c]));
  const indexMap = new Map<string, number>();
  citations.forEach((citation) => {
    if (!indexMap.has(citation.chunkId)) {
      indexMap.set(citation.chunkId, indexMap.size);
    }
  });

  const lines = parsed.text.split('\n');
  const blocks: React.ReactNode[] = [];

  let listItems: string[] = [];
  let ordered = false;

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <View key={key} style={styles.list}>
        {listItems.map((item, index) => (
          <View key={`${key}-${index}`} style={styles.listRow}>
            <Text style={styles.bullet}>{ordered ? `${index + 1}.` : '•'}</Text>
            <Text style={styles.paragraph}>{renderInline(item, `${key}-${index}`)}</Text>
          </View>
        ))}
      </View>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();

    if (/^\s*[-*]\s+/.test(line)) {
      if (!ordered) flushList(`ul-${index}`);
      ordered = false;
      listItems.push(line.replace(/^\s*[-*]\s+/, ''));
      return;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (ordered === false) flushList(`ol-${index}`);
      ordered = true;
      listItems.push(line.replace(/^\s*\d+[.)]\s+/, ''));
      return;
    }

    flushList(`list-${index}`);
    ordered = false;

    if (!line.trim()) return;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(
        <Text
          key={`h-${index}`}
          style={[
            styles.heading,
            level <= 2 ? styles.headingLarge : styles.headingSmall,
          ]}
        >
          {renderInline(heading[2] ?? '', `h-${index}`)}
        </Text>,
      );
      return;
    }

    if (line.startsWith('> ')) {
      blocks.push(
        <Text key={`q-${index}`} style={styles.quote}>
          {renderInline(line.slice(2), `q-${index}`)}
        </Text>,
      );
      return;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<View key={`hr-${index}`} style={styles.hr} />);
      return;
    }

    // A paragraph: split out any citation markers and render them as chips.
    const segments = line.split(/\[\[C:([A-Za-z0-9_-]{6,64})\]\]/g);
    const inline: React.ReactNode[] = [];
    let cursor = 0;
    let chipIndex = 0;

    while (cursor < segments.length) {
      const chunk = segments[cursor];
      if (chunk) {
        inline.push(
          <Fragment key={`p-${index}-${cursor}`}>
            {renderInline(chunk, `p-${index}-${cursor}`)}
          </Fragment>,
        );
      }
      const chunkId = segments[cursor + 1];
      if (chunkId) {
        const number = indexMap.get(chunkId) ?? chipIndex;
        inline.push(
          <Text
            key={`c-${index}-${cursor}`}
            onPress={() => onCitationClick?.(chunkId)}
            style={styles.chip}
          >
            {number + 1}
          </Text>,
        );
        chipIndex += 1;
      }
      cursor += 2;
    }

    blocks.push(
      <Text key={`p-${index}`} style={styles.paragraph}>
        {inline}
      </Text>,
    );
  });

  flushList('ul-final');

  return <View>{blocks}</View>;
}

const styles = StyleSheet.create({
  paragraph: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: 23,
    marginBottom: 8,
  },
  heading: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  headingLarge: {
    fontSize: fontSize.xl,
  },
  headingSmall: {
    fontSize: fontSize.lg,
  },
  bold: {
    color: colors.text,
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    backgroundColor: colors.surface3,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
  },
  quote: {
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontStyle: 'italic',
    marginBottom: 8,
    paddingLeft: 10,
  },
  hr: {
    backgroundColor: colors.hairline,
    height: 1,
    marginVertical: 10,
  },
  list: {
    marginBottom: 8,
  },
  listRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bullet: {
    color: colors.textFaint,
    fontSize: fontSize.md,
    lineHeight: 23,
    width: 20,
  },
  chip: {
    backgroundColor: colors.surface3,
    borderRadius: 4,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 15,
    marginHorizontal: 2,
    overflow: 'hidden',
    paddingHorizontal: 4,
  },
});
