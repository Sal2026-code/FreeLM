/**
 * FreeLM — shared domain types.
 *
 * These types are the single source of truth for the web app, the mobile app
 * and the API. Import them from `@freelm/shared`.
 */

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  image: string | null;
  isGuest: boolean;
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export type NotebookKind = 'regular' | 'study' | 'featured';

export interface Notebook {
  id: string;
  ownerUserId: string | null;
  title: string;
  description: string | null;
  /** Native OS device emoji, editable by the user. */
  icon: string;
  kind: NotebookKind;
  isFeatured: boolean;
  isPublic: boolean;
  isPinned: boolean;
  /** Set for study notebooks: the learning goal the assistant personalises for. */
  learningGoal: string | null;
  sourceCount: number;
  readySourceCount: number;
  threadCount: number;
  outputCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ChatMode =
  | 'exploratory'
  | 'analytical'
  | 'study'
  | 'creative'
  | 'instructional'
  | 'synthesis';

export type ResponseLength = 'short' | 'medium' | 'long';

export type ScopeMode = 'all' | 'selected';

export interface NotebookSettings {
  notebookId: string;
  customInstructions: string;
  chatMode: ChatMode;
  responseLength: ResponseLength;
  defaultScope: ScopeMode;
  retrievalK: number;
  outputLanguage: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type SourceType =
  | 'file'
  | 'pdf'
  | 'text'
  | 'web'
  | 'youtube'
  | 'image'
  | 'audio'
  | 'gdrive'
  | 'gdrive_doc'
  | 'gdrive_sheet'
  | 'gdrive_slide'
  | 'ebook'
  | 'note'
  | 'research'
  | 'chat_import'
  | 'epub'
  | 'docx'
  | 'pptx'
  | 'csv';

export type SourceStatus =
  | 'uploaded'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'error';

export interface SourceMetadata {
  pageCount?: number;
  url?: string;
  language?: string;
  wordCount?: number;
  charCount?: number;
  mimeType?: string;
  originalName?: string;
  /** Set for Drive-backed documents: they re-sync periodically. */
  isLiving?: boolean;
  driveFileId?: string;
  driveMimeType?: string;
  author?: string;
  isbn?: string;
  coverUrl?: string;
  durationSeconds?: number;
  [key: string]: unknown;
}

export interface Source {
  id: string;
  notebookId: string;
  title: string;
  type: SourceType;
  status: SourceStatus;
  /** 0-100, shown in the source row progress badge. */
  progress: number;
  error: string | null;
  metadata: SourceMetadata;
  labelIds: string[];
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceLabel {
  id: string;
  notebookId: string;
  name: string;
  color: string;
  sourceCount: number;
}

/** A tab of the source viewer. */
export interface SourceGuide {
  summary: string;
  outline: { title: string; chunkId: string | null }[];
}

export interface Chunk {
  id: string;
  sourceId: string;
  chunkIndex: number;
  sectionTitle: string | null;
  pageNumber: number | null;
  text: string;
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface Thread {
  id: string;
  notebookId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Citation {
  id: string;
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  /** Human readable chunk reference, e.g. "Chunk 12". */
  chunkLabel: string;
  quote: string | null;
  pageNumber: number | null;
  sectionTitle: string | null;
}

export interface Message {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  mode: ChatMode | null;
  citations: Citation[];
  createdAt: string;
}

export interface NotebookOverview {
  notebookId: string;
  content: string;
  citations: Citation[];
  suggestedQuestions: string[];
  updatedAt: string;
}

/** Server-Sent Events payloads for the notebook workspace. */
export type WorkspaceEvent =
  | { type: 'source'; source: Source }
  | { type: 'source_removed'; sourceId: string }
  | { type: 'output'; output: StudioOutput }
  | { type: 'output_removed'; outputId: string }
  | { type: 'overview'; overview: NotebookOverview }
  | { type: 'note'; note: Note }
  | { type: 'ping' };

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export type StudioToolType =
  // Tier 1
  | 'report'
  | 'slide_deck'
  | 'infographic'
  | 'mind_map'
  // Tier 2
  | 'data_table'
  | 'video_overview'
  | 'quiz'
  | 'flashcards'
  | 'audio_overview'
  // Long tail
  | 'briefing_doc'
  | 'study_guide'
  | 'faq'
  | 'timeline'
  | 'outline'
  | 'key_concepts'
  | 'argument_map'
  | 'concept_map'
  | 'section_breakdown'
  | 'chapter_summary'
  | 'learning_objectives'
  | 'practice_questions'
  | 'socratic_qa'
  | 'reading_comprehension'
  | 'teach_back'
  | 'lesson_plan'
  | 'interactive_learning'
  | 'data_analysis'
  // Utility
  | 'note';

export type AudioFormat = 'deep_dive' | 'brief' | 'critique' | 'debate';
export type LengthOption = 'short' | 'default' | 'long';
export type VideoStyle =
  | 'scientific'
  | 'professional'
  | 'editorial'
  | 'sketch_note'
  | 'explainer';
export type VideoDuration = 'short' | 'standard';

export interface StudioToolMeta {
  type: StudioToolType;
  label: string;
  icon: string;
  description: string;
  tier: 1 | 2 | 3;
  /** Whether the tool renders a bespoke viewer component. */
  viewer?: string;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'multiple_select' | 'short_answer' | 'fill_in_blank';
  prompt: string;
  options?: string[];
  /** For multiple_select, the correct option indices. */
  correctOptions?: number[];
  answer: string;
  explanation: string;
  topic: string;
  citationChunkIds: string[];
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  citationChunkIds: string[];
}

export interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
  citationChunkIds: string[];
}

export interface DataTable {
  title: string;
  columns: { key: string; header: string }[];
  rows: Record<string, string>[];
  citationChunkIds: string[];
}

export interface SlideDeck {
  title: string;
  slides: {
    id: string;
    title: string;
    bullets: string[];
    speakerNote: string;
    citationChunkIds: string[];
  }[];
}

export interface Infographic {
  title: string;
  subtitle: string;
  sections: { heading: string; bullets: string[] }[];
  palette: string;
  citationChunkIds: string[];
}

export interface AudioOverviewContent {
  title: string;
  format: AudioFormat;
  language: string;
  length: LengthOption;
  focusPrompt: string;
  /** Turns of the two-host (or single-host) dialogue. */
  transcript: { speaker: string; text: string; citationChunkIds: string[] }[];
  citationChunkIds: string[];
}

export interface VideoOverviewContent {
  title: string;
  style: VideoStyle;
  duration: VideoDuration;
  language: string;
  scenes: {
    id: string;
    heading: string;
    bullets: string[];
    narration: string;
    citationChunkIds: string[];
  }[];
}

export interface InteractiveLearningContent {
  title: string;
  goal: string;
  steps: {
    id: string;
    heading: string;
    body: string;
    kind: 'summary' | 'slides' | 'quiz' | 'flashcards' | 'checkpoint';
    artifactId: string | null;
    citationChunkIds: string[];
  }[];
}

export interface DataAnalysisContent {
  title: string;
  code: string;
  stdout: string;
  result: string;
  language: 'python' | 'javascript';
  citationChunkIds: string[];
}

export interface CoCreationPlan {
  artifactType: 'slide_deck' | 'video_overview';
  title: string;
  suggestedTopics: { title: string; rationale: string; selected: boolean }[];
  outline: { title: string; detail: string }[];
  style: string;
  format: string;
  reviewNotes: string;
  status: 'draft' | 'reviewed' | 'rendered';
}

export interface StudioOutput {
  id: string;
  notebookId: string;
  type: StudioToolType;
  title: string;
  /** Tool-specific structured payload. */
  content: unknown;
  fileUrl: string | null;
  fileMime: string | null;
  meta: Record<string, unknown>;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  citationChunkIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  notebookId: string;
  outputId: string;
  kind: 'quiz' | 'flashcards';
  answers: Record<string, string | string[]>;
  rightCount: number;
  wrongCount: number;
  skippedCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export interface ResearchCandidate {
  title: string;
  url: string;
  snippet: string;
  /** Why the source is relevant to the query. */
  relevance: string;
  faviconUrl: string | null;
  sourceType: SourceType;
}

export type ResearchMode = 'fast' | 'deep';

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  /** Machine readable code, e.g. "NO_SOURCES", "UPSTREAM_ERROR". */
  code: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}
