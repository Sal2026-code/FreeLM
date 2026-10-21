/**
 * FreeLM — shared constants: enums, labels and tool registry.
 *
 * The tool registry is the single list of Studio tools. Adding a new tool
 * means adding one entry here (plus a generator + viewer on the server/web
 * side) — it never means editing a long switch statement in a component.
 */

import type {
  ChatMode,
  LengthOption,
  ResponseLength,
  ScopeMode,
  SourceStatus,
  SourceType,
  StudioToolMeta,
  StudioToolType,
} from './types';

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const CHAT_MODES: ReadonlyArray<{
  value: ChatMode;
  label: string;
  description: string;
}> = [
  {
    value: 'exploratory',
    label: 'Exploratory',
    description: 'Broad questions and high-level overviews of your material.',
  },
  {
    value: 'analytical',
    label: 'Analytical',
    description: 'Deep comparison of arguments, evidence and contradictions.',
  },
  {
    value: 'study',
    label: 'Study',
    description: 'Flashcards, quizzes, practice questions and exam preparation.',
  },
  {
    value: 'creative',
    label: 'Creative',
    description: 'Scripts, dialogues, analogies and narrative explanations.',
  },
  {
    value: 'instructional',
    label: 'Instructional',
    description: 'Step-by-step teaching, scaffolding and worked examples.',
  },
  {
    value: 'synthesis',
    label: 'Synthesis',
    description: 'Integrated understanding that merges multiple documents.',
  },
] as const;

export const RESPONSE_LENGTHS: ReadonlyArray<{
  value: ResponseLength;
  label: string;
  description: string;
}> = [
  { value: 'short', label: 'Short', description: 'Concise answers.' },
  { value: 'medium', label: 'Medium', description: 'Balanced detail.' },
  { value: 'long', label: 'Long', description: 'Thorough answers.' },
] as const;

export const SCOPE_MODES: ReadonlyArray<{ value: ScopeMode; label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'selected', label: 'Selected sources' },
] as const;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  uploaded: 'Uploading',
  extracting: 'Extracting',
  chunking: 'Chunking',
  embedding: 'Embedding',
  ready: 'Ready',
  error: 'Error',
};

export const SOURCE_STATUS_ORDER: SourceStatus[] = [
  'uploaded',
  'extracting',
  'chunking',
  'embedding',
  'ready',
];

/** Label + Material Symbols icon for each source type. */
export const SOURCE_TYPE_META: Record<
  SourceType,
  { label: string; icon: string; color: string }
> = {
  file: { label: 'File', icon: 'draft', color: '#8ab4f8' },
  pdf: { label: 'PDF', icon: 'picture_as_pdf', color: '#f28b82' },
  text: { label: 'Text', icon: 'notes', color: '#fdd663' },
  web: { label: 'Website', icon: 'language', color: '#81c995' },
  youtube: { label: 'YouTube', icon: 'smart_display', color: '#ff8f8f' },
  image: { label: 'Image', icon: 'image', color: '#c58af9' },
  audio: { label: 'Audio', icon: 'headphones', color: '#78d9ec' },
  gdrive: { label: 'Drive', icon: 'drive_file_move', color: '#fdd663' },
  gdrive_doc: { label: 'Google Doc', icon: 'description', color: '#8ab4f8' },
  gdrive_sheet: { label: 'Google Sheet', icon: 'table_chart', color: '#81c995' },
  gdrive_slide: { label: 'Google Slides', icon: 'slideshow', color: '#ff8f8f' },
  ebook: { label: 'eBook', icon: 'menu_book', color: '#c58af9' },
  note: { label: 'Note', icon: 'sticky_note_2', color: '#fdd663' },
  research: { label: 'Research', icon: 'travel_explore', color: '#78d9ec' },
  chat_import: { label: 'Chat', icon: 'forum', color: '#81c995' },
  epub: { label: 'ePub', icon: 'book', color: '#c58af9' },
  docx: { label: 'Word', icon: 'article', color: '#8ab4f8' },
  pptx: { label: 'Slides', icon: 'slideshow', color: '#ff8f8f' },
  csv: { label: 'CSV', icon: 'table_view', color: '#81c995' },
};

export const ACCEPTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.docx',
  '.pptx',
  '.epub',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.heic',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.flac',
];

export const ACCEPTED_UPLOAD_MIME = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/epub+zip',
  'image/*',
  'audio/*',
];

// ---------------------------------------------------------------------------
// Studio tool registry
// ---------------------------------------------------------------------------

export const STUDIO_TOOLS: readonly StudioToolMeta[] = [
  {
    type: 'audio_overview',
    label: 'Audio Overview',
    icon: 'graphic_eq',
    description:
      'Two AI hosts unpack and connect the key topics in your sources in a lively conversation.',
    tier: 1,
    viewer: 'audio',
  },
  {
    type: 'video_overview',
    label: 'Video Overview',
    icon: 'movie',
    description:
      'A narrated explainer that turns your sources into a visual walkthrough.',
    tier: 1,
    viewer: 'video',
  },
  {
    type: 'mind_map',
    label: 'Mind Map',
    icon: 'account_tree',
    description: 'See everything in your sources at a glance and explore any branch.',
    tier: 1,
    viewer: 'mindmap',
  },
  {
    type: 'report',
    label: 'Reports',
    icon: 'description',
    description: 'Briefing docs, study guides and custom markdown reports.',
    tier: 1,
    viewer: 'report',
  },
  {
    type: 'slide_deck',
    label: 'Slide Decks',
    icon: 'view_carousel',
    description: 'A complete presentation built from your sources.',
    tier: 1,
    viewer: 'deck',
  },
  {
    type: 'infographic',
    label: 'Infographics',
    icon: 'polyline',
    description: 'A single polished visual summary you can post or share.',
    tier: 1,
    viewer: 'infographic',
  },
  {
    type: 'flashcards',
    label: 'Flashcards',
    icon: 'style',
    description: 'Flip cards to memorise key terms, dates and concepts.',
    tier: 2,
    viewer: 'flashcards',
  },
  {
    type: 'quiz',
    label: 'Quiz',
    icon: 'quiz',
    description: 'Test yourself with questions grounded in your sources.',
    tier: 2,
    viewer: 'quiz',
  },
  {
    type: 'data_table',
    label: 'Data Table',
    icon: 'table_chart',
    description: 'Pull scattered information into a structured, exportable table.',
    tier: 2,
    viewer: 'table',
  },
  {
    type: 'interactive_learning',
    label: 'Interactive Learning',
    icon: 'school',
    description:
      'A step-by-step walkthrough that weaves together summaries, slides, quizzes and flashcards.',
    tier: 1,
    viewer: 'interactive',
  },
  {
    type: 'data_analysis',
    label: 'Data Analysis',
    icon: 'calculate',
    description:
      'Run code in a sandbox against your spreadsheets and data to get real numbers.',
    tier: 2,
    viewer: 'analysis',
  },
  {
    type: 'briefing_doc',
    label: 'Briefing Doc',
    icon: 'summarize',
    description: 'A detailed executive summary of the material.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'study_guide',
    label: 'Study Guide',
    icon: 'menu_book',
    description: 'A thorough guide to everything covered in the sources.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'faq',
    label: 'FAQ',
    icon: 'help',
    description: 'Questions you did not think to ask, answered from the sources.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'timeline',
    label: 'Timeline',
    icon: 'timeline',
    description: 'Events and dates ordered across every source.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'outline',
    label: 'Outline',
    icon: 'format_list_bulleted',
    description: 'A hierarchical outline of the content.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'key_concepts',
    label: 'Key Concepts',
    icon: 'key',
    description: 'The essential terms and definitions to know.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'argument_map',
    label: 'Argument Map',
    icon: 'schema',
    description: 'Claims, evidence and how they connect.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'concept_map',
    label: 'Concept Map',
    icon: 'hub',
    description: 'How the big ideas relate across documents.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'section_breakdown',
    label: 'Section Breakdown',
    icon: 'segment',
    description: 'A section-by-section tour of each source.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'chapter_summary',
    label: 'Chapter Summary',
    icon: 'auto_stories',
    description: 'A summary for each chapter or major part.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'learning_objectives',
    label: 'Learning Objectives',
    icon: 'flag',
    description: 'What a learner should be able to do afterwards.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'practice_questions',
    label: 'Practice Questions',
    icon: 'help_center',
    description: 'Extra questions for deliberate practice.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'socratic_qa',
    label: 'Socratic Q&A',
    icon: 'psychology',
    description: 'Guiding questions that make you think it through.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'reading_comprehension',
    label: 'Reading Comprehension',
    icon: 'menu_book',
    description: 'Questions that check genuine understanding of the text.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'teach_back',
    label: 'Teach-Back',
    icon: 'record_voice_over',
    description: 'Explain it back and get graded on the attempt.',
    tier: 3,
    viewer: 'report',
  },
  {
    type: 'lesson_plan',
    label: 'Lesson Plan',
    icon: 'co_present',
    description: 'A full teaching plan built from the material.',
    tier: 3,
    viewer: 'report',
  },
] as const;

export const STUDIO_TOOL_MAP: Record<StudioToolType, StudioToolMeta> =
  STUDIO_TOOLS.reduce(
    (acc, tool) => {
      acc[tool.type] = tool;
      return acc;
    },
    {} as Record<StudioToolType, StudioToolMeta>,
  );

/** Tools that appear as buttons in the Studio grid. */
export const STUDIO_GRID_TOOLS: StudioToolType[] = [
  'audio_overview',
  'video_overview',
  'mind_map',
  'report',
  'slide_deck',
  'infographic',
  'flashcards',
  'quiz',
  'data_table',
];

// ---------------------------------------------------------------------------
// Customisation options (shared by the modals)
// ---------------------------------------------------------------------------

export const AUDIO_FORMATS: ReadonlyArray<{
  value: 'deep_dive' | 'brief' | 'critique' | 'debate';
  label: string;
  description: string;
}> = [
  {
    value: 'deep_dive',
    label: 'Deep Dive',
    description:
      'A lively conversation between two hosts, unpacking and connecting topics in your sources.',
  },
  {
    value: 'brief',
    label: 'The Brief',
    description:
      'A bite-sized overview to help you grasp the core ideas from your sources quickly.',
  },
  {
    value: 'critique',
    label: 'The Critique',
    description:
      'An expert review of your sources, offering constructive feedback to help you improve your material.',
  },
  {
    value: 'debate',
    label: 'The Debate',
    description:
      'A thoughtful debate between two hosts, illuminating different perspectives on your sources.',
  },
];

export const LENGTH_OPTIONS: ReadonlyArray<{
  value: LengthOption;
  label: string;
}> = [
  { value: 'short', label: 'Short' },
  { value: 'default', label: 'Default' },
  { value: 'long', label: 'Long' },
];

export const VIDEO_STYLES: ReadonlyArray<{
  value: 'scientific' | 'professional' | 'editorial' | 'sketch_note' | 'explainer';
  label: string;
}> = [
  { value: 'scientific', label: 'Scientific' },
  { value: 'professional', label: 'Professional' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'sketch_note', label: 'Sketch Note' },
  { value: 'explainer', label: 'Explainer' },
];

export const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const QUIZ_QUANTITIES = ['fewer', 'standard', 'more'] as const;
export type QuizQuantity = (typeof QUIZ_QUANTITIES)[number];

export const QUIZ_TYPES = [
  'multiple_choice',
  'multiple_select',
  'short_answer',
  'fill_in_blank',
] as const;

export const NOTEBOOK_ICONS = [
  '📓',
  '📔',
  '📒',
  '📚',
  '📖',
  '🗂️',
  '📁',
  '🧠',
  '💡',
  '🔬',
  '🧪',
  '📊',
  '📈',
  '🎯',
  '🚀',
  '⚙️',
  '🛠️',
  '🧭',
  '🔭',
  '🧬',
  '🌱',
  '⚖️',
  '🏛️',
  '🎨',
  '🎵',
  '⚽',
  '🍳',
  '💻',
  '📷',
  '🗺️',
] as const;

export const SOURCE_LABEL_COLORS = [
  '#8ab4f8',
  '#81c995',
  '#fdd663',
  '#f28b82',
  '#c58af9',
  '#78d9ec',
  '#f6a3b5',
  '#a8dab5',
] as const;
