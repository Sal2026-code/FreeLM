'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  AudioOverviewContent,
  DataTable as DataTableContent,
  Flashcard,
  InteractiveLearningContent,
  MindMapNode,
  QuizQuestion,
  SlideDeck,
  StudioOutput,
  VideoOverviewContent,
} from '@freelm/shared';

import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import {
  Button,
  cn,
  IconButton,
  Spinner,
  useToast,
} from '@/components/ui/primitives';

export interface StudioOutputViewerProps {
  output: StudioOutput;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
  onSendToChat: (content: string) => void | Promise<void>;
}

/** Routes an output to its bespoke viewer. */
export function StudioOutputViewer({
  output,
  onBack,
  onChanged,
  onSendToChat,
}: StudioOutputViewerProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 pb-2">
        <IconButton icon="arrow_back" label="Back to studio" onClick={onBack} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-100">
          {output.title}
        </span>
        <IconButton
          icon={copied ? 'check' : 'content_copy'}
          label="Copy"
          onClick={async () => {
            const text =
              typeof output.content === 'string'
                ? output.content
                : JSON.stringify(output.content, null, 2);
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        />
        <IconButton
          icon="forum"
          label="Send to chat"
          onClick={() =>
            void onSendToChat(
              `Summarise the Studio output "${output.title}" and explain what it contains.`,
            )
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {output.meta && (output.meta as { status?: string }).status === 'generating' ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Spinner />
            <p className="text-[13px] text-neutral-500">Generating…</p>
            {typeof (output.meta as { progress?: number }).progress === 'number' ? (
              <p className="text-[12px] text-neutral-600">
                {Math.round(
                  (output.meta as { progress: number }).progress * 100,
                )}
                %
              </p>
            ) : null}
          </div>
        ) : (
          <OutputBody output={output} onChanged={onChanged} toast={toast} />
        )}
      </div>
    </div>
  );
}

function OutputBody({
  output,
  onChanged,
  toast,
}: {
  output: StudioOutput;
  onChanged: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  switch (output.type) {
    case 'audio_overview':
      return (
        <AudioViewer
          output={output}
          content={output.content as AudioOverviewContent}
        />
      );
    case 'video_overview':
      return (
        <VideoViewer
          output={output}
          content={output.content as VideoOverviewContent}
        />
      );
    case 'quiz':
      return (
        <QuizViewer
          output={output}
          questions={
            ((output.content as { questions?: QuizQuestion[] })?.questions ??
              []) as QuizQuestion[]
          }
          onChanged={onChanged}
        />
      );
    case 'flashcards':
      return (
        <FlashcardViewer
          output={output}
          cards={
            ((output.content as { cards?: Flashcard[] })?.cards ?? []) as Flashcard[]
          }
          onChanged={onChanged}
        />
      );
    case 'mind_map':
      return <MindMapViewer root={output.content as MindMapNode} />;
    case 'data_table':
      return <DataTableViewer output={output} content={output.content as DataTableContent} />;
    case 'slide_deck':
      return <DeckViewer output={output} content={output.content as SlideDeck} />;
    case 'infographic':
      return <InfographicViewer output={output} />;
    case 'interactive_learning':
      return (
        <InteractiveViewer content={output.content as InteractiveLearningContent} />
      );
    case 'data_analysis':
      return <AnalysisViewer content={output.content as { title: string; code: string; stdout: string; result: string }} />;
    default:
      return (
        <MarkdownRenderer
          content={
            typeof output.content === 'string'
              ? output.content
              : JSON.stringify(output.content, null, 2)
          }
        />
      );
  }
  void toast;
  void onChanged;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function AudioViewer({
  output,
  content,
}: {
  output: StudioOutput;
  content: AudioOverviewContent;
}) {
  const [interactive, setInteractive] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  return (
    <div className="space-y-3">
      {output.fileUrl ? (
        <audio controls src={output.fileUrl} className="w-full" />
      ) : (
        <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-[12.5px] text-neutral-400">
          The audio file is still being rendered.
        </p>
      )}

      {output.fileUrl ? (
        <a
          href={output.fileUrl}
          download
          className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:text-accent-hover"
        >
          <span className="material-symbols-rounded text-[16px]" aria-hidden>
            download
          </span>
          Download .mp3
        </a>
      ) : null}

      {/* Interactive mode — talk to the hosts */}
      <div className="rounded-xl border border-hairline bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-neutral-100">
            Join the conversation
          </p>
          <button
            type="button"
            onClick={() => setInteractive((value) => !value)}
            className={cn(
              'rounded-pill border px-2.5 py-1 text-[12px] transition',
              interactive
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-hairline text-neutral-400 hover:text-neutral-200',
            )}
          >
            {interactive ? 'On' : 'Off'}
          </button>
        </div>

        {interactive ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-[12px] leading-5 text-neutral-500">
              Ask the hosts a question. They answer from your sources only.
            </p>
            <div className="flex gap-1.5">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    window.dispatchEvent(
                      new CustomEvent('freelm:send-message', {
                        detail: `In the audio overview "${content?.title ?? ''}", the hosts discuss: ${question}. Ask a follow-up question about that and answer it from my sources.`,
                      }),
                    );
                    setQuestion('');
                  }
                }}
                placeholder="Ask the hosts…"
                className="field h-9 py-0 text-[13px]"
              />
              <Button
                icon="send"
                loading={asking}
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('freelm:send-message', {
                      detail: `In the audio overview "${content?.title ?? ''}", the hosts discuss: ${question}. Ask a follow-up question about that and answer it from my sources.`,
                    }),
                  );
                  setQuestion('');
                }}
              >
                Ask
              </Button>
            </div>
            {answer ? (
              <p className="rounded-lg bg-surface-3 p-2 text-[12.5px] text-neutral-200">
                {answer}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Transcript */}
      {content?.transcript?.length ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Transcript
          </p>
          <div className="space-y-2">
            {content.transcript.map((turn, index) => (
              <p key={`${turn.speaker}-${index}`} className="text-[13px] leading-6">
                <span className="font-semibold text-neutral-100">
                  {turn.speaker}:{' '}
                </span>
                <span className="text-neutral-300">{turn.text}</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

function VideoViewer({
  output,
  content,
}: {
  output: StudioOutput;
  content: VideoOverviewContent;
}) {
  return (
    <div className="space-y-3">
      {output.fileUrl ? (
        <video
          controls
          src={output.fileUrl}
          className="w-full rounded-xl border border-hairline bg-black"
        />
      ) : (
        <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-[12.5px] text-neutral-400">
          The video is still being rendered.
        </p>
      )}

      {output.fileUrl ? (
        <div className="flex items-center gap-3">
          <a
            href={output.fileUrl}
            download
            className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:text-accent-hover"
          >
            <span className="material-symbols-rounded text-[16px]" aria-hidden>
              download
            </span>
            Download .mp4
          </a>
          <span className="text-[12px] text-neutral-500">
            {content?.scenes?.length ?? 0} scenes
          </span>
        </div>
      ) : null}

      {content?.scenes?.length ? (
        <div className="space-y-2">
          {content.scenes.map((scene, index) => (
            <div
              key={scene.id ?? index}
              className="rounded-xl border border-hairline bg-surface-2 p-2.5"
            >
              <p className="text-[13px] font-medium text-neutral-100">
                {scene.heading}
              </p>
              {scene.bullets?.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-neutral-300">
                  {scene.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {scene.narration ? (
                <p className="mt-1.5 text-[12px] italic text-neutral-500">
                  “{scene.narration}”
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

function QuizViewer({
  output,
  questions,
  onChanged,
}: {
  output: StudioOutput;
  questions: QuizQuestion[];
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  const current = questions[index];

  const stats = useMemo(() => {
    let right = 0;
    let wrong = 0;
    let skipped = 0;
    for (const question of questions) {
      const answer = answers[question.id];
      if (answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0)) {
        skipped += 1;
        continue;
      }
      if (isCorrect(question, answer)) right += 1;
      else wrong += 1;
    }
    return { right, wrong, skipped };
  }, [answers, questions]);

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
        String(answer).trim().toLowerCase() ===
        String(question.answer).trim().toLowerCase()
      );
    }
    return answer === question.answer;
  }

  async function finish() {
    setFinished(true);
    await fetch(`/api/notebooks/${output.notebookId}/study`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outputId: output.id,
        kind: 'quiz',
        answers,
        rightCount: stats.right,
        wrongCount: stats.wrong,
        skippedCount: stats.skipped,
        topics: [...new Set(questions.map((question) => question.topic))],
      }),
    });
    await onChanged();
  }

  if (questions.length === 0) {
    return (
      <p className="text-[13px] text-neutral-500">This quiz has no questions.</p>
    );
  }

  if (finished) {
    const total = questions.length;
    const percent = Math.round((stats.right / total) * 100);
    const topics = [...new Set(questions.map((question) => question.topic))];

    return (
      <div className="space-y-3">
        <p className="text-[13px] text-neutral-300">
          You did it! Quiz complete.
        </p>

        <div className="rounded-xl border border-hairline bg-surface-2 p-3">
          <div className="flex items-center gap-4">
            <ProgressRing percent={percent} />
            <dl className="flex-1 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-neutral-400">Right</dt>
                <dd className="font-medium text-success">{stats.right}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-400">Wrong</dt>
                <dd className="font-medium text-danger">{stats.wrong}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-400">Skipped</dt>
                <dd className="font-medium text-neutral-300">
                  {stats.skipped}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface-2 p-3">
            <p className="mb-1.5 text-[12.5px] font-medium text-neutral-100">
              Topics covered
            </p>
            <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-neutral-300">
              {topics.slice(0, 8).map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2 p-3">
            <p className="mb-1.5 text-[12.5px] font-medium text-neutral-100">
              Keep learning
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {topics.slice(0, 4).map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('freelm:send-message', {
                        detail: `Give me more practice questions about "${topic}" from my sources.`,
                      }),
                    )
                  }
                  className="rounded-pill border border-hairline bg-surface-3 px-2.5 py-1 text-[12px] text-neutral-200 transition hover:border-hairline-strong"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              setFinished(false);
              setIndex(0);
              setAnswers({});
              setRevealed(false);
            }}
          >
            Review quiz
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setAnswers({});
              setIndex(0);
              setRevealed(false);
              setFinished(false);
            }}
          >
            Retake quiz
          </Button>
        </div>

        <p className="text-[12px] text-neutral-500">
          Ask your notebook about your results any time — it knows what you got
          right and wrong.
        </p>
      </div>
    );
  }

  if (!current) return null;

  const answer = answers[current.id];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12.5px] text-neutral-500">
        <span>
          {index + 1} / {questions.length}
        </span>
        <span>{current.topic}</span>
      </div>

      <p className="text-[14px] font-medium leading-6 text-neutral-100">
        {current.prompt}
      </p>

      {/* Answer inputs by type */}
      {current.type === 'multiple_choice' || current.type === 'multiple_select' ? (
        <div className="space-y-1.5">
          {(current.options ?? []).map((option, optionIndex) => {
            const letter = String.fromCharCode(65 + optionIndex);
            const selected =
              current.type === 'multiple_select'
                ? Array.isArray(answer) && answer.includes(String(optionIndex))
                : answer === option;
            const isRight =
              current.type === 'multiple_select'
                ? (current.correctOptions ?? []).includes(optionIndex)
                : current.answer === option;

            return (
              <button
                key={optionIndex}
                type="button"
                onClick={() => {
                  if (current.type === 'multiple_select') {
                    setAnswers((currentAnswers) => {
                      const list = Array.isArray(currentAnswers[current.id])
                        ? (currentAnswers[current.id] as string[])
                        : [];
                      return {
                        ...currentAnswers,
                        [current.id]: list.includes(String(optionIndex))
                          ? list.filter((value) => value !== String(optionIndex))
                          : [...list, String(optionIndex)],
                      };
                    });
                  } else {
                    setAnswers((currentAnswers) => ({
                      ...currentAnswers,
                      [current.id]: option,
                    }));
                  }
                  setRevealed(false);
                }}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition',
                  revealed && isRight
                    ? 'border-success/60 bg-success/10'
                    : revealed && selected && !isRight
                      ? 'border-danger/60 bg-danger/10'
                      : selected
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-hairline bg-surface-2 hover:border-hairline-strong',
                )}
              >
                <span className="mt-px font-mono text-[12px] text-neutral-500">
                  {letter}.
                </span>
                <span className="text-neutral-200">{option}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={typeof answer === 'string' ? answer : ''}
          onChange={(event) =>
            setAnswers((currentAnswers) => ({
              ...currentAnswers,
              [current.id]: event.target.value,
            }))
          }
          placeholder="Type your answer"
          className="field"
        />
      )}

      {revealed ? (
        <div className="rounded-xl border border-hairline bg-surface-2 p-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
            Answer
          </p>
          <p className="mt-1 text-[13px] text-neutral-100">{current.answer}</p>
          {current.explanation ? (
            <p className="mt-1.5 text-[12.5px] leading-5 text-neutral-400">
              {current.explanation}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHintOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface-2 px-3 py-1.5 text-[12.5px] text-neutral-300 transition hover:border-hairline-strong"
        >
          Hint
          <span className="material-symbols-rounded text-[14px] text-neutral-500">
            expand_more
          </span>
        </button>

        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => {
            if (revealed) {
              if (index + 1 >= questions.length) void finish();
              else {
                setIndex(index + 1);
                setRevealed(false);
                setHintOpen(false);
              }
            } else {
              setRevealed(true);
            }
          }}
        >
          {revealed
            ? index + 1 >= questions.length
              ? 'Finish'
              : 'Next'
            : 'Check answer'}
        </Button>
      </div>

      {hintOpen && !revealed ? (
        <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-[12.5px] leading-5 text-neutral-400">
          Think about which source covers this: {current.topic}. Re-read the
          passage and check the exact wording it uses.
        </p>
      ) : null}
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="7"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="#81c995"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-semibold text-neutral-50">
          {percent}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

function FlashcardViewer({
  output,
  cards,
  onChanged,
}: {
  output: StudioOutput;
  cards: Flashcard[];
  onChanged: () => void | Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shuffled, setShuffled] = useState<Flashcard[]>(cards);
  const [results, setResults] = useState<Record<string, 'right' | 'wrong'>>({});

  useEffect(() => {
    setShuffled(cards);
  }, [cards]);

  if (cards.length === 0) {
    return (
      <p className="text-[13px] text-neutral-500">This deck has no cards.</p>
    );
  }

  const current = shuffled[index]!;
  const rightCount = Object.values(results).filter((value) => value === 'right').length;
  const wrongCount = Object.values(results).filter((value) => value === 'wrong').length;

  function shuffle() {
    const copy = [...cards];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    setShuffled(copy);
    setIndex(0);
    setRevealed(false);
  }

  async function mark(result: 'right' | 'wrong') {
    const next = { ...results, [current.id]: result };
    setResults(next);
    if (index + 1 >= shuffled.length) {
      await fetch(`/api/notebooks/${output.notebookId}/study`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputId: output.id,
          kind: 'flashcards',
          answers: next,
          rightCount: Object.values(next).filter((v) => v === 'right').length,
          wrongCount: Object.values(next).filter((v) => v === 'wrong').length,
          skippedCount: 0,
          topics: [...new Set(cards.map((card) => card.topic))],
        }),
      });
      await onChanged();
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12.5px] text-neutral-500">
        <span>
          {index + 1} / {shuffled.length}
        </span>
        <IconButton icon="shuffle" label="Shuffle" onClick={shuffle} />
      </div>

      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        className={cn(
          'w-full rounded-2xl border border-hairline bg-surface-2 p-5 text-left transition',
          'hover:border-hairline-strong',
        )}
      >
        <p className="text-[14px] font-medium leading-6 text-neutral-50">
          {current.question}
        </p>
        {revealed ? (
          <p className="mt-3 border-t border-hairline pt-3 text-[13.5px] leading-6 text-neutral-200">
            {current.answer}
          </p>
        ) : (
          <p className="mt-3 text-[12px] text-neutral-500">Tap to reveal</p>
        )}
      </button>

      <div className="flex items-center justify-center gap-3">
        <IconButton
          icon="close"
          label="Missed it"
          tone="danger"
          onClick={() => void mark('wrong')}
        />
        <IconButton
          icon="check"
          label="Got it"
          tone="accent"
          onClick={() => void mark('right')}
        />
      </div>

      <p className="text-center text-[12px] text-neutral-500">
        {rightCount} right · {wrongCount} missed
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mind map
// ---------------------------------------------------------------------------

function MindMapViewer({ root }: { root: MindMapNode }) {
  const [selected, setSelected] = useState<MindMapNode | null>(null);

  if (!root) {
    return <p className="text-[13px] text-neutral-500">No mind map data.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-4">
        <svg viewBox="0 0 520 320" className="h-auto w-full min-w-[520px]">
          <g stroke="rgba(138,180,248,0.5)" strokeWidth="1.5" fill="none">
            {root.children.map((child, childIndex) => {
              const childY = 60 + childIndex * 46;
              return (
                <path
                  key={child.id}
                  d={`M 150 160 C 190 160, 200 ${childY}, 240 ${childY}`}
                />
              );
            })}
          </g>

          <g>
            <rect
              x="20"
              y="140"
              width="130"
              height="40"
              rx="12"
              fill="#232327"
              stroke="rgba(255,255,255,0.18)"
            />
            <text
              x="85"
              y="165"
              textAnchor="middle"
              fill="#f5f5f5"
              fontSize="12"
              fontFamily="Inter, sans-serif"
            >
              {truncate(root.label, 18)}
            </text>

            {root.children.map((child, childIndex) => {
              const childY = 40 + childIndex * 46;
              return (
                <g key={child.id}>
                  <rect
                    x="240"
                    y={childY}
                    width="180"
                    height="36"
                    rx="10"
                    fill="#1a1a1d"
                    stroke="rgba(255,255,255,0.12)"
                    onClick={() => setSelected(child)}
                    style={{ cursor: 'pointer' }}
                  />
                  <text
                    x="256"
                    y={childY + 23}
                    fill="#e5e5e5"
                    fontSize="12"
                    fontFamily="Inter, sans-serif"
                  >
                    {truncate(child.label, 24)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selected ? (
        <div className="rounded-xl border border-hairline bg-surface-2 p-3">
          <p className="text-[13px] font-medium text-neutral-100">
            {selected.label}
          </p>
          {selected.children.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12.5px] text-neutral-300">
              {selected.children.map((child) => (
                <li key={child.id}>{child.label}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('freelm:send-message', {
                  detail: `Tell me about "${selected.label}" in my sources.`,
                }),
              )
            }
            className="mt-2 text-[12.5px] text-accent hover:text-accent-hover"
          >
            Ask about this branch
          </button>
        </div>
      ) : null}
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

function DataTableViewer({
  output,
  content,
}: {
  output: StudioOutput;
  content: DataTableContent;
}) {
  const toast = useToast();
  if (!content?.columns?.length) {
    return <p className="text-[13px] text-neutral-500">No table data.</p>;
  }

  function exportCsv() {
    const header = content.columns.map((column) => column.header).join(',');
    const rows = content.rows.map((row) =>
      content.columns
        .map((column) => `"${String(row[column.key] ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header, ...rows].join('\n')], {
      type: 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${content.title || 'table'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.push({ tone: 'success', title: 'CSV downloaded' });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-neutral-100">
          {content.title}
        </p>
        <Button size="sm" icon="download" onClick={exportCsv}>
          CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {content.columns.map((column) => (
                <th
                  key={column.key}
                  className="border-b border-hairline bg-surface-2 px-2.5 py-2 text-left font-semibold text-neutral-100"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {content.columns.map((column) => (
                  <td
                    key={column.key}
                    className="border-b border-hairline px-2.5 py-2 align-top text-neutral-200"
                  >
                    {row[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">{output.title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide deck
// ---------------------------------------------------------------------------

function DeckViewer({
  output,
  content,
}: {
  output: StudioOutput;
  content: SlideDeck;
}) {
  const [index, setIndex] = useState(0);
  const slides = content?.slides ?? [];
  if (slides.length === 0) {
    return <p className="text-[13px] text-neutral-500">No slides yet.</p>;
  }

  const current = slides[Math.min(index, slides.length - 1)]!;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-hairline bg-surface-2 p-5">
        <p className="text-[15px] font-semibold text-neutral-50">
          {current.title}
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {current.bullets.map((bullet, bulletIndex) => (
            <li
              key={bulletIndex}
              className="flex gap-2 text-[13px] leading-5 text-neutral-200"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              {bullet}
            </li>
          ))}
        </ul>
        {current.speakerNote ? (
          <p className="mt-3 border-t border-hairline pt-2 text-[12px] italic text-neutral-500">
            {current.speakerNote}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <IconButton
          icon="chevron_left"
          label="Previous slide"
          disabled={index === 0}
          onClick={() => setIndex(Math.max(0, index - 1))}
        />
        <span className="text-[12.5px] text-neutral-500">
          {index + 1} / {slides.length}
        </span>
        <IconButton
          icon="chevron_right"
          label="Next slide"
          disabled={index >= slides.length - 1}
          onClick={() => setIndex(Math.min(slides.length - 1, index + 1))}
        />
        <span className="ml-auto text-[12px] text-neutral-500">{output.title}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Infographic
// ---------------------------------------------------------------------------

function InfographicViewer({ output }: { output: StudioOutput }) {
  if (output.fileUrl) {
    return (
      <img
        src={output.fileUrl}
        alt={output.title}
        className="w-full rounded-xl border border-hairline"
      />
    );
  }

  const content = output.content as {
    title: string;
    subtitle: string;
    sections: { heading: string; bullets: string[] }[];
  };

  return (
    <div className="rounded-xl border border-hairline bg-surface-2 p-4">
      <p className="text-[16px] font-semibold text-neutral-50">
        {content?.title}
      </p>
      {content?.subtitle ? (
        <p className="mt-1 text-[12.5px] text-neutral-400">{content.subtitle}</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {(content?.sections ?? []).map((section) => (
          <div key={section.heading}>
            <p className="text-[13px] font-semibold text-accent">
              {section.heading}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-neutral-300">
              {section.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex}>{bullet}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive learning
// ---------------------------------------------------------------------------

function InteractiveViewer({
  content,
}: {
  content: InteractiveLearningContent;
}) {
  const [step, setStep] = useState(0);
  const steps = content?.steps ?? [];
  if (steps.length === 0) {
    return (
      <p className="text-[13px] text-neutral-500">No learning steps yet.</p>
    );
  }

  const current = steps[Math.min(step, steps.length - 1)]!;

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-neutral-100">{content.title}</p>
      {content.goal ? (
        <p className="text-[12.5px] text-neutral-500">{content.goal}</p>
      ) : null}

      <div className="rounded-xl border border-hairline bg-surface-2 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          {current.kind}
        </p>
        <p className="mt-1 text-[14px] font-medium text-neutral-50">
          {current.heading}
        </p>
        <p className="mt-1.5 text-[13px] leading-6 text-neutral-300">
          {current.body}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <IconButton
          icon="chevron_left"
          label="Previous step"
          disabled={step === 0}
          onClick={() => setStep(Math.max(0, step - 1))}
        />
        <span className="text-[12.5px] text-neutral-500">
          {step + 1} / {steps.length}
        </span>
        <IconButton
          icon="chevron_right"
          label="Next step"
          disabled={step >= steps.length - 1}
          onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data analysis
// ---------------------------------------------------------------------------

function AnalysisViewer({
  content,
}: {
  content: { title: string; code: string; stdout: string; result: string };
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-neutral-100">{content?.title}</p>
      <pre className="overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-3 font-mono text-[12px] leading-5 text-neutral-200">
        {content?.code}
      </pre>
      {content?.result ? (
        <div className="rounded-xl border border-hairline bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Result
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-neutral-100">
            {content.result}
          </p>
        </div>
      ) : null}
      {content?.stdout ? (
        <pre className="overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-3 font-mono text-[11.5px] leading-5 text-neutral-400">
          {content.stdout}
        </pre>
      ) : null}
    </div>
  );
}
