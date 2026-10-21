/**
 * FreeLM — Studio tool generators.
 *
 * Every Studio tool is one entry in this registry. A generator:
 *   1. retrieves representative chunks across the scoped sources,
 *   2. renders the tool-specific prompt,
 *   3. calls the model (structured JSON or markdown),
 *   4. validates the result,
 *   5. returns a normalised `{ title, content, meta }` payload.
 *
 * Adding a new tool means adding a registry entry — not editing a component.
 */

import { z } from 'zod';
import type { StudioToolType } from '@freelm/shared';

import {
  getChatProvider,
  getEmbeddingProvider,
} from '@/lib/ai';
import {
  generateStructured,
  type ChatMessage,
} from '@/lib/ai/provider';
import {
  TOOL_INSTRUCTIONS,
  buildAudioScriptPrompt,
  buildCoCreationPlanPrompt,
  buildDataTablePrompt,
  buildFlashcardsPrompt,
  buildInfographicPrompt,
  buildInteractiveLearningPrompt,
  buildMindMapPrompt,
  buildQuizPrompt,
  buildSlideDeckPrompt,
  buildVideoScriptPrompt,
  renderToolPrompt,
} from '@/lib/ai/prompts';
import { renderContext, sourceNames } from '@/lib/rag/context';
import { retrieveCoverageChunks } from '@/lib/rag/retrieval';

export interface GeneratorInput {
  notebookId: string;
  sourceIds: string[];
  prompt: string;
  language: string;
  length: 'short' | 'medium' | 'long';
  tone: 'simple' | 'academic' | 'conversational';
  level: 'beginner' | 'intermediate' | 'expert';
  options: Record<string, unknown>;
  onProgress?: (progress: number) => void;
}

export interface GeneratorResult {
  title: string;
  content: unknown;
  meta: Record<string, unknown>;
  /** Chunk ids the output was grounded in. */
  citationChunkIds: string[];
  /** For media tools: the generated file, already written to storage. */
  file?: { buffer: Buffer; mimeType: string; extension: string };
}

export interface Generator {
  type: StudioToolType;
  generate(input: GeneratorInput): Promise<GeneratorResult>;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const quizSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string().optional(),
      type: z
        .enum([
          'multiple_choice',
          'multiple_select',
          'short_answer',
          'fill_in_blank',
        ])
        .default('multiple_choice'),
      prompt: z.string(),
      options: z.array(z.string()).optional(),
      correctOptions: z.array(z.number()).optional(),
      answer: z.string(),
      explanation: z.string().default(''),
      topic: z.string().default('General'),
      citationChunkIds: z.array(z.string()).default([]),
    }),
  ),
});

const flashcardsSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string().optional(),
      question: z.string(),
      answer: z.string(),
      topic: z.string().default('General'),
      citationChunkIds: z.array(z.string()).default([]),
    }),
  ),
});

const mindMapSchema = z.object({
  root: z.object({
    id: z.string().default('root'),
    label: z.string(),
    children: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          children: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                children: z.array(z.any()).default([]),
                citationChunkIds: z.array(z.string()).default([]),
              }),
            )
            .default([]),
          citationChunkIds: z.array(z.string()).default([]),
        }),
      )
      .default([]),
    citationChunkIds: z.array(z.string()).default([]),
  }),
});

const dataTableSchema = z.object({
  title: z.string().default('Data table'),
  columns: z.array(z.object({ key: z.string(), header: z.string() })),
  rows: z.array(z.record(z.string(), z.string())),
  citationChunkIds: z.array(z.string()).default([]),
});

const slideDeckSchema = z.object({
  title: z.string().default('Slide deck'),
  slides: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      bullets: z.array(z.string()).default([]),
      speakerNote: z.string().default(''),
      citationChunkIds: z.array(z.string()).default([]),
    }),
  ),
});

const infographicSchema = z.object({
  title: z.string(),
  subtitle: z.string().default(''),
  palette: z.string().default('#1a73e8'),
  sections: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(z.string()).default([]),
    }),
  ),
  citationChunkIds: z.array(z.string()).default([]),
});

const audioScriptSchema = z.object({
  title: z.string().default('Audio Overview'),
  transcript: z.array(
    z.object({
      speaker: z.string().default('Host A'),
      text: z.string(),
      citationChunkIds: z.array(z.string()).default([]),
    }),
  ),
});

const videoScriptSchema = z.object({
  title: z.string().default('Video Overview'),
  scenes: z.array(
    z.object({
      id: z.string().optional(),
      heading: z.string(),
      bullets: z.array(z.string()).default([]),
      narration: z.string().default(''),
      citationChunkIds: z.array(z.string()).default([]),
    }),
  ),
});

const interactiveLearningSchema = z.object({
  title: z.string().default('Interactive Learning Overview'),
  goal: z.string().default(''),
  steps: z.array(
    z.object({
      id: z.string().optional(),
      heading: z.string(),
      body: z.string(),
      kind: z
        .enum(['summary', 'slides', 'quiz', 'flashcards', 'checkpoint'])
        .default('summary'),
      artifactId: z.string().nullable().default(null),
      citationChunkIds: z.array(z.string()).default([]),
    }),
  ),
});

const coCreationSchema = z.object({
  title: z.string().default('Untitled'),
  suggestedTopics: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string().default(''),
        selected: z.boolean().default(true),
      }),
    )
    .default([]),
  outline: z
    .array(z.object({ title: z.string(), detail: z.string().default('') }))
    .default([]),
  style: z.string().default('professional'),
  format: z.string().default('presentation'),
  reviewNotes: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gatherContext(input: GeneratorInput) {
  const chunks = await retrieveCoverageChunks({
    notebookId: input.notebookId,
    ...(input.sourceIds.length > 0 ? { sourceIds: input.sourceIds } : {}),
    perSource: 6,
    maxTotal: 36,
  });
  return {
    chunks,
    context: renderContext(chunks),
    names: sourceNames(chunks),
  };
}

function markdownMessages(
  instructions: string,
  input: GeneratorInput,
  context: string,
  names: string[],
): ChatMessage[] {
  return [
    {
      role: 'user',
      content: renderToolPrompt(instructions, {
        context,
        sourceNames: names,
        prompt: input.prompt,
        language: input.language,
        length: input.length,
        tone: input.tone,
        level: input.level,
      }),
    },
  ];
}

/** Markdown-report tools (Report, Study Guide, FAQ, Timeline, …). */
function createMarkdownGenerator(type: StudioToolType): Generator {
  return {
    type,
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();
      const instructions =
        TOOL_INSTRUCTIONS[type] ??
        'Write a clear, well-structured Markdown document grounded in the context.';

      const raw = await provider.chat(markdownMessages(instructions, input, context, names), {
        ...(input.length === 'long' ? { maxTokens: 6000 } : {}),
        temperature: 0.4,
      });

      const title = deriveTitle(raw, type);
      return {
        title,
        content: raw.trim(),
        meta: { tool: type, format: 'markdown' },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  };
}

function deriveTitle(markdown: string, type: StudioToolType): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim().slice(0, 160);
  const firstLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine) return firstLine.replace(/^#+\s*/, '').slice(0, 160);
  const label = type.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const STUDIO_GENERATORS: Partial<Record<StudioToolType, Generator>> = {
  report: createMarkdownGenerator('report'),
  briefing_doc: createMarkdownGenerator('briefing_doc'),
  study_guide: createMarkdownGenerator('study_guide'),
  faq: createMarkdownGenerator('faq'),
  timeline: createMarkdownGenerator('timeline'),
  outline: createMarkdownGenerator('outline'),
  key_concepts: createMarkdownGenerator('key_concepts'),
  argument_map: createMarkdownGenerator('argument_map'),
  concept_map: createMarkdownGenerator('concept_map'),
  section_breakdown: createMarkdownGenerator('section_breakdown'),
  chapter_summary: createMarkdownGenerator('chapter_summary'),
  learning_objectives: createMarkdownGenerator('learning_objectives'),
  practice_questions: createMarkdownGenerator('practice_questions'),
  socratic_qa: createMarkdownGenerator('socratic_qa'),
  reading_comprehension: createMarkdownGenerator('reading_comprehension'),
  teach_back: createMarkdownGenerator('teach_back'),
  lesson_plan: createMarkdownGenerator('lesson_plan'),
  comparison: createMarkdownGenerator('comparison'),
  contradictions: createMarkdownGenerator('contradictions'),
  themes: createMarkdownGenerator('themes'),
  definitions: createMarkdownGenerator('definitions'),
  rubric: createMarkdownGenerator('rubric'),
  classroom_activities: createMarkdownGenerator('classroom_activities'),
  teaching_script: createMarkdownGenerator('teaching_script'),
  guided_reading_questions: createMarkdownGenerator('guided_reading_questions'),
  assessment_questions: createMarkdownGenerator('assessment_questions'),
  dialogue: createMarkdownGenerator('dialogue'),

  quiz: {
    type: 'quiz',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const quantity = (input.options.quantity as 'fewer' | 'standard' | 'more') ?? 'standard';
      const count =
        quantity === 'fewer' ? 5 : quantity === 'more' ? 15 : 10;
      const difficulty =
        (input.options.difficulty as 'easy' | 'medium' | 'hard') ?? 'medium';
      const types =
        (input.options.types as string[] | undefined) ??
        ['multiple_choice', 'multiple_select', 'short_answer', 'fill_in_blank'];

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildQuizPrompt({
              context,
              sourceNames: names,
              count,
              difficulty,
              types,
              topics: (input.options.topics as string | undefined) ?? '',
              prompt: input.prompt,
              language: input.language,
            }),
          },
        ],
        { validate: (value) => quizSchema.parse(value) },
      );

      const questions = parsed.questions.map((question, index) => ({
        ...question,
        id: question.id ?? `q${index + 1}`,
      }));

      return {
        title: `Quiz — ${questions.length} questions`,
        content: { questions },
        meta: { tool: 'quiz', quantity, difficulty, types },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  flashcards: {
    type: 'flashcards',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const quantity = (input.options.quantity as 'fewer' | 'standard' | 'more') ?? 'standard';
      const count = quantity === 'fewer' ? 8 : quantity === 'more' ? 30 : 20;
      const difficulty =
        (input.options.difficulty as 'easy' | 'medium' | 'hard') ?? 'medium';

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildFlashcardsPrompt({
              context,
              sourceNames: names,
              count,
              difficulty,
              topics: (input.options.topics as string | undefined) ?? '',
              prompt: input.prompt,
              language: input.language,
            }),
          },
        ],
        { validate: (value) => flashcardsSchema.parse(value) },
      );

      const cards = parsed.cards.map((card, index) => ({
        ...card,
        id: card.id ?? `c${index + 1}`,
      }));

      return {
        title: `Flashcards — ${cards.length} cards`,
        content: { cards },
        meta: { tool: 'flashcards', quantity, difficulty },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  mind_map: {
    type: 'mind_map',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildMindMapPrompt({
              context,
              sourceNames: names,
              prompt: input.prompt,
            }),
          },
        ],
        { validate: (value) => mindMapSchema.parse(value) },
      );

      return {
        title: `Mind map — ${parsed.root.label}`,
        content: parsed.root,
        meta: { tool: 'mind_map' },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  data_table: {
    type: 'data_table',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildDataTablePrompt({
              context,
              sourceNames: names,
              description:
                (input.options.description as string | undefined) ??
                'A table of the most important structured facts in the sources.',
              prompt: input.prompt,
            }),
          },
        ],
        { validate: (value) => dataTableSchema.parse(value) },
      );

      return {
        title: parsed.title,
        content: parsed,
        meta: { tool: 'data_table' },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  slide_deck: {
    type: 'slide_deck',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildSlideDeckPrompt({
              context,
              sourceNames: names,
              length:
                input.length === 'short'
                  ? 'short'
                  : input.length === 'long'
                    ? 'long'
                    : 'default',
              style: (input.options.style as string | undefined) ?? 'professional',
              prompt: input.prompt,
            }),
          },
        ],
        { validate: (value) => slideDeckSchema.parse(value) },
      );

      const slides = parsed.slides.map((slide, index) => ({
        ...slide,
        id: slide.id ?? `s${index + 1}`,
      }));

      return {
        title: parsed.title,
        content: { title: parsed.title, slides },
        meta: { tool: 'slide_deck', style: input.options.style ?? 'professional' },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  infographic: {
    type: 'infographic',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildInfographicPrompt({
              context,
              sourceNames: names,
              prompt: input.prompt,
            }),
          },
        ],
        { validate: (value) => infographicSchema.parse(value) },
      );

      return {
        title: parsed.title,
        content: parsed,
        meta: { tool: 'infographic' },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  audio_overview: {
    type: 'audio_overview',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const format =
        (input.options.format as 'deep_dive' | 'brief' | 'critique' | 'debate') ??
        'deep_dive';
      const length =
        (input.options.length as 'short' | 'default' | 'long') ?? 'default';

      let parsed: z.infer<typeof audioScriptSchema>;
      try {
        parsed = await generateStructured(
          provider,
          [
            {
              role: 'user',
              content: buildAudioScriptPrompt({
                context,
                sourceNames: names,
                format,
                length,
                focusPrompt: (input.options.focusPrompt as string | undefined) ?? '',
                language: input.language,
              }),
            },
          ],
          { validate: (value) => audioScriptSchema.parse(value) },
        );
      } catch {
        // Fall back to a two-host reading of the retrieved passages so the
        // user still gets a real podcast.
        parsed = fallbackAudioScript(chunks, names, format, length);
      }

      const transcript = parsed.transcript
        .filter((turn) => turn.text.trim().length > 0)
        .map((turn, index) => ({
          ...turn,
          speaker: turn.speaker || (index % 2 === 0 ? 'Host A' : 'Host B'),
          citationChunkIds: turn.citationChunkIds ?? [],
        }));

      const title = parsed.title || `Audio Overview of ${names[0] ?? 'your sources'}`;

      return {
        title,
        content: {
          title,
          format,
          length,
          language: input.language,
          focusPrompt: (input.options.focusPrompt as string | undefined) ?? '',
          transcript:
            transcript.length > 0
              ? transcript
              : fallbackAudioScript(chunks, names, format, length).transcript,
          citationChunkIds: chunks.map((chunk) => chunk.id),
        },
        meta: { tool: 'audio_overview', format, length, needsMedia: true },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  video_overview: {
    type: 'video_overview',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const style =
        (input.options.style as string | undefined) ?? 'professional';
      const duration =
        (input.options.duration as 'short' | 'standard' | undefined) ?? 'standard';

      let parsed: z.infer<typeof videoScriptSchema>;
      try {
        parsed = await generateStructured(
          provider,
          [
            {
              role: 'user',
              content: buildVideoScriptPrompt({
                context,
                sourceNames: names,
                style,
                duration,
                focusPrompt: (input.options.focusPrompt as string | undefined) ?? '',
                language: input.language,
              }),
            },
          ],
          { validate: (value) => videoScriptSchema.parse(value) },
        );
      } catch {
        // A model that will not produce valid JSON must not leave the user
        // with nothing — build the scene plan from the retrieved passages.
        parsed = fallbackVideoScript(chunks, names, style, duration);
      }

      const scenes = parsed.scenes
        .map((scene, index) => ({
          ...scene,
          id: scene.id ?? `sc${index + 1}`,
          // A model sometimes omits the narration; derive it from the bullets
          // so the scene still has something to say.
          narration:
            scene.narration?.trim() ||
            [scene.heading, ...(scene.bullets ?? [])]
              .filter(Boolean)
              .join('. ')
              .trim(),
        }))
        .filter((scene) => scene.heading.trim().length > 0);

      const finalScenes =
        scenes.length > 0
          ? scenes
          : fallbackVideoScript(chunks, names, style, duration).scenes;

      const title = parsed.title || `Overview of ${names[0] ?? 'your sources'}`;

      return {
        title,
        content: {
          title,
          style,
          duration,
          language: input.language,
          scenes: finalScenes,
          citationChunkIds: chunks.map((chunk) => chunk.id),
        },
        meta: { tool: 'video_overview', style, duration, needsMedia: true },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },

  interactive_learning: {
    type: 'interactive_learning',
    async generate(input) {
      const { context, names, chunks } = await gatherContext(input);
      const provider = getChatProvider();

      const parsed = await generateStructured(
        provider,
        [
          {
            role: 'user',
            content: buildInteractiveLearningPrompt({
              context,
              sourceNames: names,
              goal: (input.options.goal as string | undefined) ?? '',
              prompt: input.prompt,
            }),
          },
        ],
        { validate: (value) => interactiveLearningSchema.parse(value) },
      );

      const steps = parsed.steps.map((step, index) => ({
        ...step,
        id: step.id ?? `st${index + 1}`,
      }));

      return {
        title: parsed.title,
        content: { ...parsed, steps },
        meta: { tool: 'interactive_learning' },
        citationChunkIds: chunks.map((chunk) => chunk.id),
      };
    },
  },
};

/**
 * Build an audio script straight from the retrieved passages.
 *
 * Used when the model cannot be trusted to return valid JSON: the user
 * still gets a real podcast made from their own material.
 */
function fallbackAudioScript(
  chunks: { id: string; sourceTitle: string; text: string }[],
  names: string[],
  format: 'deep_dive' | 'brief' | 'critique' | 'debate',
  length: 'short' | 'default' | 'long',
): z.infer<typeof audioScriptSchema> {
  const maxTurns = length === 'short' ? 4 : length === 'long' ? 16 : 9;
  const selected = chunks.slice(0, maxTurns);

  const sentences = selected.flatMap((chunk) =>
    chunk.text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean),
  );

  const perTurn = Math.max(1, Math.ceil(sentences.length / maxTurns));
  const transcript: { speaker: string; text: string; citationChunkIds: string[] }[] =
    [];

  for (let index = 0; index < maxTurns; index += 1) {
    const chunk = selected[index];
    if (!chunk) break;
    const text = sentences
      .slice(index * perTurn, (index + 1) * perTurn)
      .join(' ')
      .trim();
    if (!text) continue;

    const singleSpeaker = format === 'brief';
    transcript.push({
      speaker: singleSpeaker
        ? 'Narrator'
        : index % 2 === 0
          ? 'Host A'
          : 'Host B',
      text,
      citationChunkIds: [chunk.id],
    });
  }

  return {
    title: names.length > 0 ? `Audio Overview of ${names[0]}` : 'Audio Overview',
    transcript,
  };
}

/**
 * Build a video scene plan straight from the retrieved passages.
 *
 * Used when the model cannot be trusted to return valid JSON: the user
 * still gets a real, playable video made from their own material.
 */
function fallbackVideoScript(
  chunks: { id: string; sourceTitle: string; text: string; chunkIndex: number }[],
  names: string[],
  style: string,
  duration: 'short' | 'standard',
): z.infer<typeof videoScriptSchema> {
  const maxScenes = duration === 'short' ? 3 : 5;
  const perScene = duration === 'short' ? 2 : 3;

  const scenes = chunks.slice(0, maxScenes).map((chunk, index) => {
    const sentences = chunk.text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    const bullets = sentences.slice(0, perScene);
    const narration = bullets.join(' ').slice(0, 600);

    return {
      id: `sc${index + 1}`,
      heading: chunk.sourceTitle,
      bullets,
      narration: narration || chunk.text.slice(0, 600),
      citationChunkIds: [chunk.id],
    };
  });

  return {
    title: names.length > 0 ? `Overview of ${names[0]}` : 'Overview of your sources',
    scenes,
  };
}

/** Build a co-creation plan (the Oct 2026 "Review outline notes" flow). */
export async function buildCoCreationPlan(input: {
  notebookId: string;
  sourceIds: string[];
  artifactType: 'slide_deck' | 'video_overview';
  prompt: string;
}): Promise<z.infer<typeof coCreationSchema>> {
  const chunks = await retrieveCoverageChunks({
    notebookId: input.notebookId,
    ...(input.sourceIds.length > 0 ? { sourceIds: input.sourceIds } : {}),
    perSource: 5,
    maxTotal: 30,
  });
  const context = renderContext(chunks);
  const names = sourceNames(chunks);
  const provider = getChatProvider();

  return generateStructured(
    provider,
    [
      {
        role: 'user',
        content: buildCoCreationPlanPrompt({
          context,
          sourceNames: names,
          artifactType: input.artifactType,
          prompt: input.prompt,
        }),
      },
    ],
    { validate: (value) => coCreationSchema.parse(value) },
  );
}

/** Expose the embedding model name so the API can report it. */
export function activeEmbeddingModel(): string {
  return getEmbeddingProvider().info.embeddingModel;
}
