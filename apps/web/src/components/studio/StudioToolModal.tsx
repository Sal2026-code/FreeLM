'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Source, StudioToolType } from '@freelm/shared';
import {
  AUDIO_FORMATS,
  LANGUAGES,
  LENGTH_OPTIONS,
  QUIZ_DIFFICULTIES,
  QUIZ_QUANTITIES,
  QUIZ_TYPES,
  STUDIO_TOOL_MAP,
  VIDEO_STYLES,
} from '@freelm/shared';

import { Modal } from '@/components/ui/Modal';
import {
  Button,
  cn,
  Spinner,
  useToast,
} from '@/components/ui/primitives';

export interface StudioToolModalProps {
  toolType: string | null;
  notebookId: string;
  sources: Source[];
  selectedSourceIds: string[];
  onClose: () => void;
  onGenerating: (type: string) => void;
  onGenerated: () => void | Promise<void>;
}

const FOCUS_CHIPS: Record<string, string[]> = {
  audio_overview: [
    'Certification Debate',
    'FSE vs Code',
    'Expert Panel',
    'Beginner Overview',
  ],
  video_overview: [
    'Upgrade Roadmap',
    'Beginner Overview',
    'Key Trade-offs',
  ],
  quiz: ['Key Concepts', 'Exam Format', 'Common Pitfalls'],
  flashcards: ['Terminology', 'Dates and Numbers', 'Definitions'],
  report: ['Executive Summary', 'Risks and Caveats', 'Recommendations'],
  slide_deck: ['Opening Story', 'Customer Impact', 'Next Steps'],
};

const THINGS_TO_TRY: Record<string, string[]> = {
  data_table: [
    'Create a table with the major findings in these research papers, using columns: title, author, key result',
    'Extract the most important quotes from my readings, grouping them by topic and author',
  ],
  quiz: [
    'The quiz must be restricted to a specific source (e.g. "the article about Italy")',
    'The quiz must focus solely on the key concepts of physics',
    'Create a quiz to help me prepare for my history exam on Ancient Egypt',
  ],
  flashcards: [
    'Focus on the vocabulary and technical terms',
    'Cover the dates and sequences of events',
    'Test the definitions of each key concept',
  ],
  report: [
    'Write a briefing doc for an executive audience',
    'Turn the material into a study guide with practice questions',
    'Compare the two approaches described in the sources',
  ],
  slide_deck: [
    'Propose a narrative for a keynote talk',
    'Start with the problem, then the solution',
    'Keep it to eight slides with a strong close',
  ],
  infographic: [
    'Show the timeline of the events as a visual',
    'Compare the two approaches side by side',
    'Highlight the most surprising finding',
  ],
  video_overview: [
    'Explain the core idea in under a minute',
    'Use an analogy a beginner would understand',
  ],
  audio_overview: [
    'Explain it like I am five years old',
    'Focus on the certification exam format',
    'Compare the two viewpoints in the sources',
  ],
};

/**
 * The "Customize …" dialog for every Studio tool.
 *
 * The layout mirrors the reference screenshots: format cards, a language
 * dropdown, a segmented control, a focus textarea with a sparkles button and
 * clickable focus chips.
 */
export function StudioToolModal({
  toolType,
  notebookId,
  sources,
  selectedSourceIds,
  onClose,
  onGenerating,
  onGenerated,
}: StudioToolModalProps) {
  const toast = useToast();
  const tool = toolType ? STUDIO_TOOL_MAP[toolType as StudioToolType] : null;

  const [language, setLanguage] = useState('en');
  const [format, setFormat] = useState<string>('deep_dive');
  const [length, setLength] = useState<string>('default');
  const [style, setStyle] = useState<string>('professional');
  const [duration, setDuration] = useState<string>('standard');
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [quantity, setQuantity] = useState<string>('standard');
  const [types, setTypes] = useState<string[]>([
    'multiple_choice',
    'multiple_select',
    'short_answer',
    'fill_in_blank',
  ]);
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!toolType) return;
    setFocus('');
    setFormat(toolType === 'video_overview' ? 'explainer' : 'deep_dive');
    setLength('default');
    setStyle('professional');
    setDuration('standard');
    setDifficulty('medium');
    setQuantity('standard');
    setTypes([
      'multiple_choice',
      'multiple_select',
      'short_answer',
      'fill_in_blank',
    ]);
  }, [toolType]);

  const focusChips = useMemo(
    () => (toolType ? (FOCUS_CHIPS[toolType] ?? []) : []),
    [toolType],
  );
  const thingsToTry = useMemo(
    () => (toolType ? (THINGS_TO_TRY[toolType] ?? []) : []),
    [toolType],
  );

  if (!tool || !toolType) return null;

  // Narrowed copies so the closures below keep the narrowed types.
  const activeTool = tool;
  const activeToolType = toolType;

  const isAudio = toolType === 'audio_overview';
  const isVideo = toolType === 'video_overview';
  const isQuiz = toolType === 'quiz';
  const isFlashcards = toolType === 'flashcards';
  const isTable = toolType === 'data_table';
  const isDeck = toolType === 'slide_deck';

  async function suggestFocus() {
    setSuggesting(true);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/studio/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: selectedSourceIds }),
      });
      if (response.ok) {
        const data = (await response.json()) as { suggestion?: string };
        if (data.suggestion) setFocus(data.suggestion);
      }
    } catch {
      toast.push({ tone: 'error', title: 'Could not suggest a focus' });
    } finally {
      setSuggesting(false);
    }
  }

  async function generate() {
    setBusy(true);
    onGenerating(activeToolType);
    try {
      const options: Record<string, unknown> = {};
      if (isAudio) {
        options.format = format;
        options.length = length;
        options.focusPrompt = focus;
      }
      if (isVideo) {
        options.style = style;
        options.duration = duration;
        options.focusPrompt = focus;
      }
      if (isQuiz || isFlashcards) {
        options.difficulty = difficulty;
        options.quantity = quantity;
        options.types = types;
        options.topics = focus;
      }
      if (isTable) options.description = focus;
      if (isDeck) options.style = style;

      const response = await fetch(
        `/api/notebooks/${notebookId}/studio/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: activeToolType,
            sourceIds: selectedSourceIds,
            prompt: focus,
            language,
            options,
          }),
        },
      );

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? 'Generation failed.');
      }

      await onGenerated();
    } catch (error) {
      toast.push({
        tone: 'error',
        title: 'Could not generate that',
        description:
          error instanceof Error ? error.message : 'Something went wrong.',
      });
      onGenerating('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={isAudio ? 'max-w-4xl' : 'max-w-3xl'}
      title={
        <span className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[20px] text-neutral-400">
            {tool.icon}
          </span>
          Customize {activeTool.label}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={sources.length === 0}
            onClick={() => void generate()}
          >
            Generate
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Format cards — Audio Overview */}
        {isAudio ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-neutral-200">Format</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {AUDIO_FORMATS.map((option) => {
                const selected = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormat(option.value)}
                    className={cn(
                      'relative rounded-xl border p-3 text-left transition',
                      selected
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-hairline bg-surface-2 hover:border-hairline-strong hover:bg-surface-3',
                    )}
                  >
                    {selected ? (
                      <span className="absolute right-2 top-2 material-symbols-rounded text-[16px] text-accent">
                        check
                      </span>
                    ) : null}
                    <p className="text-[13px] font-semibold text-neutral-50">
                      {option.label}
                    </p>
                    <p className="mt-1.5 text-[11.5px] leading-4 text-neutral-400">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Quiz / Flashcards controls */}
        {isQuiz || isFlashcards ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[13px] font-medium text-neutral-200">
                Number of {isQuiz ? 'questions' : 'cards'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUIZ_QUANTITIES.map((option) => {
                  const label =
                    option === 'standard'
                      ? 'Standard (Default)'
                      : option === 'fewer'
                        ? 'Fewer'
                        : 'More';
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setQuantity(option)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] transition',
                        quantity === option
                          ? 'border-accent/60 bg-accent/10 text-accent'
                          : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                      )}
                    >
                      {quantity === option ? (
                        <span className="material-symbols-rounded text-[14px]">
                          check
                        </span>
                      ) : null}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium text-neutral-200">
                Level of Difficulty
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUIZ_DIFFICULTIES.map((option) => {
                  const label = `${option.charAt(0).toUpperCase()}${option.slice(1)}${
                    option === 'medium' ? ' (Default)' : ''
                  }`;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDifficulty(option)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] transition',
                        difficulty === option
                          ? 'border-accent/60 bg-accent/10 text-accent'
                          : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                      )}
                    >
                      {difficulty === option ? (
                        <span className="material-symbols-rounded text-[14px]">
                          check
                        </span>
                      ) : null}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isQuiz ? (
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-medium text-neutral-200">
                  Question types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUIZ_TYPES.map((option) => {
                    const selected = types.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setTypes((current) =>
                            current.includes(option)
                              ? current.filter((value) => value !== option)
                              : [...current, option],
                          )
                        }
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] transition',
                          selected
                            ? 'border-accent/60 bg-accent/10 text-accent'
                            : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                        )}
                      >
                        {selected ? (
                          <span className="material-symbols-rounded text-[14px]">
                            check
                          </span>
                        ) : null}
                        {option.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Language + length / style */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-medium text-neutral-200">
              Choose language
            </p>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="field"
            >
              {LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          {isAudio ? (
            <div>
              <p className="mb-2 text-[13px] font-medium text-neutral-200">
                Length
              </p>
              <div className="flex gap-1.5">
                {LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLength(option.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] transition',
                      length === option.value
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                    )}
                  >
                    {length === option.value ? (
                      <span className="material-symbols-rounded text-[14px]">
                        check
                      </span>
                    ) : null}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isVideo || isDeck ? (
            <div>
              <p className="mb-2 text-[13px] font-medium text-neutral-200">
                Visual style
              </p>
              <select
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                className="field"
              >
                {VIDEO_STYLES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {isVideo ? (
            <div>
              <p className="mb-2 text-[13px] font-medium text-neutral-200">
                Length
              </p>
              <div className="flex gap-1.5">
                {[
                  { value: 'short', label: 'Short (~60s)' },
                  { value: 'standard', label: 'Standard' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDuration(option.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] transition',
                      duration === option.value
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                    )}
                  >
                    {duration === option.value ? (
                      <span className="material-symbols-rounded text-[14px]">
                        check
                      </span>
                    ) : null}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Focus prompt */}
        <div>
          <p className="mb-2 text-[13px] font-medium text-neutral-200">
            {isAudio
              ? 'What should the AI hosts focus on in this episode?'
              : isQuiz
                ? 'What should the topic be?'
                : isFlashcards
                  ? 'What should the cards cover?'
                  : isTable
                    ? 'Describe the data table you want to create'
                    : isDeck
                      ? 'What should the deck cover?'
                      : 'What should this focus on?'}
          </p>

          <div className="relative">
            <textarea
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              rows={5}
              placeholder={
                thingsToTry.length > 0
                  ? `Things to try:\n${thingsToTry.map((item) => `• ${item}`).join('\n')}`
                  : 'Add any instructions to shape the output.'
              }
              className="field resize-none pr-12 text-[13px]"
            />
            {/* The "Tab →" hint matches the reference modal. */}
            <span className="pointer-events-none absolute right-3 top-2 hidden text-[11px] text-neutral-500 sm:inline">
              Tab →
            </span>
            <button
              type="button"
              onClick={() => void suggestFocus()}
              disabled={suggesting || sources.length === 0}
              aria-label="Suggest a focus"
              className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-[#34d399] transition hover:bg-neutral-700 disabled:opacity-40"
            >
              {suggesting ? (
                <Spinner size={14} />
              ) : (
                <span className="material-symbols-rounded text-[18px]" aria-hidden>
                  auto_awesome
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Focus chips */}
        {focusChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {focusChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setFocus((current) => (current ? `${current} ${chip}` : chip))}
                className="rounded-pill border border-hairline bg-surface-2 px-2.5 py-1 text-[12px] text-neutral-300 transition hover:border-hairline-strong hover:bg-surface-3"
              >
                + {chip}
              </button>
            ))}
          </div>
        ) : null}

        {sources.length === 0 ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
            Add at least one ready source before generating.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

