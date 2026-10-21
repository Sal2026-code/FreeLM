/**
 * FreeLM — PostgreSQL schema (Drizzle ORM).
 *
 * Design notes
 * ------------
 * * `embeddings.vector` uses pgvector. Its width comes from
 *   `FREELM_EMBEDDING_DIM` so a different embedding model is a migration +
 *   re-embed (see `scripts/reembed.ts`), never a silent corruption.
 * * Every embedding row records the `model_name` that produced it and
 *   retrieval filters on the active model, so two models can coexist.
 * * There is deliberately **no source-count limit** anywhere in this schema.
 * * Cascades are set so deleting a notebook removes everything under it.
 */

import { relations, sql, type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const notebookKindEnum = pgEnum('notebook_kind', [
  'regular',
  'study',
  'featured',
]);

export const sourceTypeEnum = pgEnum('source_type', [
  'file',
  'pdf',
  'text',
  'web',
  'youtube',
  'image',
  'audio',
  'gdrive',
  'gdrive_doc',
  'gdrive_sheet',
  'gdrive_slide',
  'ebook',
  'note',
  'research',
  'chat_import',
  'epub',
  'docx',
  'pptx',
  'csv',
]);

export const sourceStatusEnum = pgEnum('source_status', [
  'uploaded',
  'extracting',
  'chunking',
  'embedding',
  'ready',
  'error',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'system',
]);

export const chatModeEnum = pgEnum('chat_mode', [
  'exploratory',
  'analytical',
  'study',
  'creative',
  'instructional',
  'synthesis',
]);

export const studioToolEnum = pgEnum('studio_tool', [
  'report',
  'slide_deck',
  'infographic',
  'mind_map',
  'data_table',
  'video_overview',
  'quiz',
  'flashcards',
  'audio_overview',
  'briefing_doc',
  'study_guide',
  'faq',
  'timeline',
  'outline',
  'key_concepts',
  'argument_map',
  'concept_map',
  'section_breakdown',
  'chapter_summary',
  'learning_objectives',
  'practice_questions',
  'socratic_qa',
  'reading_comprehension',
  'teach_back',
  'lesson_plan',
  'interactive_learning',
  'data_analysis',
  'note',
]);

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email'),
    name: text('name'),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    name: text('name'),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdx: index('sessions_user_idx').on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export const notebooks = pgTable(
  'notebooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    /** `null` means the notebook belongs to a guest session. */
    sessionId: text('session_id').references(() => sessions.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    description: text('description'),
    /** Native OS device emoji. */
    icon: text('icon').notNull().default('📓'),
    kind: notebookKindEnum('kind').notNull().default('regular'),
    isFeatured: boolean('is_featured').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    learningGoal: text('learning_goal'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    ownerIdx: index('notebooks_owner_idx').on(table.ownerUserId),
    sessionIdx: index('notebooks_session_idx').on(table.sessionId),
    featuredIdx: index('notebooks_featured_idx').on(table.isFeatured),
    updatedIdx: index('notebooks_updated_idx').on(table.updatedAt),
  }),
);

export const notebookSettings = pgTable('notebook_settings', {
  notebookId: uuid('notebook_id')
    .primaryKey()
    .references(() => notebooks.id, { onDelete: 'cascade' }),
  customInstructions: text('custom_instructions').notNull().default(''),
  chatMode: chatModeEnum('chat_mode').notNull().default('exploratory'),
  responseLength: text('response_length').notNull().default('medium'),
  defaultScope: text('default_scope').notNull().default('all'),
  retrievalK: integer('retrieval_k').notNull().default(12),
  outputLanguage: text('output_language').notNull().default('en'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notebookShares = pgTable(
  'notebook_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    tokenIdx: uniqueIndex('notebook_shares_token_idx').on(table.token),
  }),
);

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: sourceTypeEnum('type').notNull().default('file'),
    status: sourceStatusEnum('status').notNull().default('uploaded'),
    progress: integer('progress').notNull().default(0),
    error: text('error'),
    /** Object-storage key for the raw upload. */
    storageKey: text('storage_key'),
    /** Extracted plain text. */
    extractedText: text('extracted_text'),
    /** Auto-generated per-source summary + outline (the "Source Guide"). */
    guide: jsonb('guide').$type<{
      summary: string;
      outline: { title: string; chunkId: string | null }[];
    } | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('sources_notebook_idx').on(table.notebookId),
    statusIdx: index('sources_status_idx').on(table.status),
  }),
);

export const sourceLabels = pgTable(
  'source_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#8ab4f8'),
    /** Set when the label was created by the auto-categoriser. */
    isAuto: boolean('is_auto').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('source_labels_notebook_idx').on(table.notebookId),
  }),
);

export const sourceLabelMembers = pgTable(
  'source_label_members',
  {
    labelId: uuid('label_id')
      .notNull()
      .references(() => sourceLabels.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.labelId, table.sourceId] }),
    sourceIdx: index('source_label_members_source_idx').on(table.sourceId),
  }),
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    sectionTitle: text('section_title'),
    pageNumber: integer('page_number'),
    text: text('text').notNull(),
    tokenCount: integer('token_count').notNull().default(0),
    charStart: integer('char_start'),
    charEnd: integer('char_end'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sourceIdx: uniqueIndex('chunks_source_index_idx').on(
      table.sourceId,
      table.chunkIndex,
    ),
  }),
);

/**
 * Embeddings. The vector width is configurable; changing it requires a
 * migration and a re-embed run.
 */
export const EMBEDDING_DIM = Number(process.env.FREELM_EMBEDDING_DIM ?? 1536);

export const embeddings = pgTable(
  'embeddings',
  {
    chunkId: uuid('chunk_id')
      .primaryKey()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    vector: vector('vector', { dimensions: EMBEDDING_DIM }).notNull(),
    modelName: text('model_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    modelIdx: index('embeddings_model_idx').on(table.modelName),
  }),
);

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New chat'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('threads_notebook_idx').on(table.notebookId),
    updatedIdx: index('threads_updated_idx').on(table.updatedAt),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    /** Clean markdown (citation markers removed). */
    mode: chatModeEnum('mode'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    threadIdx: index('messages_thread_idx').on(table.threadId),
    createdIdx: index('messages_created_idx').on(table.createdAt),
  }),
);

export const messageCitations = pgTable(
  'message_citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    quote: text('quote'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    messageIdx: index('message_citations_message_idx').on(table.messageId),
    chunkIdx: index('message_citations_chunk_idx').on(table.chunkId),
  }),
);

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export const studioOutputs = pgTable(
  'studio_outputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    type: studioToolEnum('type').notNull(),
    title: text('title').notNull(),
    /** Tool-specific structured payload. */
    content: jsonb('content').$type<unknown>().notNull().default({}),
    /** Where the generated .mp3 / .mp4 / .png lives. */
    fileUrl: text('file_url'),
    fileMime: text('file_mime'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    sourceIds: jsonb('source_ids').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('studio_outputs_notebook_idx').on(table.notebookId),
    typeIdx: index('studio_outputs_type_idx').on(table.type),
  }),
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Untitled note'),
    content: text('content').notNull().default(''),
    citationChunkIds: jsonb('citation_chunk_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('notes_notebook_idx').on(table.notebookId),
  }),
);

export const notebookOverviews = pgTable('notebook_overviews', {
  notebookId: uuid('notebook_id')
    .primaryKey()
    .references(() => notebooks.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  citations: jsonb('citations').$type<unknown[]>().notNull().default([]),
  suggestedQuestions: jsonb('suggested_questions')
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Co-creation plans (Oct 2026 "Review outline notes" / "Review producer notes"). */
export const coCreationSessions = pgTable(
  'co_creation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    artifactType: text('artifact_type').notNull(),
    prompt: text('prompt').notNull().default(''),
    plan: jsonb('plan').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('draft'),
    outputId: uuid('output_id').references(() => studioOutputs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('co_creation_sessions_notebook_idx').on(table.notebookId),
  }),
);

/** Quiz / flashcard attempts — powers "ask about your performance". */
export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    outputId: uuid('output_id')
      .notNull()
      .references(() => studioOutputs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    answers: jsonb('answers').$type<Record<string, string | string[]>>().notNull().default({}),
    rightCount: integer('right_count').notNull().default(0),
    wrongCount: integer('wrong_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    topics: jsonb('topics').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('study_sessions_notebook_idx').on(table.notebookId),
  }),
);

/** Expert Intelligence — ebooks added from a personal library. */
export const libraryBooks = pgTable(
  'library_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notebookId: uuid('notebook_id')
      .notNull()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    author: text('author'),
    isbn: text('isbn'),
    coverUrl: text('cover_url'),
    sourceId: uuid('source_id').references(() => sources.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notebookIdx: index('library_books_notebook_idx').on(table.notebookId),
  }),
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    value: text('value').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    targetIdx: index('feedback_target_idx').on(table.targetType, table.targetId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const notebooksRelations = relations(notebooks, ({ many, one }) => ({
  settings: one(notebookSettings, {
    fields: [notebooks.id],
    references: [notebookSettings.notebookId],
  }),
  sources: many(sources),
  threads: many(threads),
  outputs: many(studioOutputs),
  notes: many(notes),
  labels: many(sourceLabels),
  overview: one(notebookOverviews, {
    fields: [notebooks.id],
    references: [notebookOverviews.notebookId],
  }),
}));

export const sourcesRelations = relations(sources, ({ many, one }) => ({
  notebook: one(notebooks, {
    fields: [sources.notebookId],
    references: [notebooks.id],
  }),
  chunks: many(chunks),
  labels: many(sourceLabelMembers),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  source: one(sources, { fields: [chunks.sourceId], references: [sources.id] }),
  embedding: one(embeddings, {
    fields: [chunks.id],
    references: [embeddings.chunkId],
  }),
}));

export const threadsRelations = relations(threads, ({ many, one }) => ({
  notebook: one(notebooks, {
    fields: [threads.notebookId],
    references: [notebooks.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ many, one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
  citations: many(messageCitations),
}));

export const messageCitationsRelations = relations(messageCitations, ({ one }) => ({
  message: one(messages, {
    fields: [messageCitations.messageId],
    references: [messages.id],
  }),
  chunk: one(chunks, {
    fields: [messageCitations.chunkId],
    references: [chunks.id],
  }),
}));

export const studioOutputsRelations = relations(studioOutputs, ({ one }) => ({
  notebook: one(notebooks, {
    fields: [studioOutputs.notebookId],
    references: [notebooks.id],
  }),
}));

export const sourceLabelsRelations = relations(sourceLabels, ({ many, one }) => ({
  notebook: one(notebooks, {
    fields: [sourceLabels.notebookId],
    references: [notebooks.id],
  }),
  members: many(sourceLabelMembers),
}));

export const sourceLabelMembersRelations = relations(
  sourceLabelMembers,
  ({ one }) => ({
    label: one(sourceLabels, {
      fields: [sourceLabelMembers.labelId],
      references: [sourceLabels.id],
    }),
    source: one(sources, {
      fields: [sourceLabelMembers.sourceId],
      references: [sources.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type SourceRow = InferSelectModel<typeof sources>;
export type SourceType = SourceRow['type'];
export type ThreadRow = InferSelectModel<typeof threads>;
export type NotebookRow = InferSelectModel<typeof notebooks>;
export type StudioOutputRow = InferSelectModel<typeof studioOutputs>;
export type NoteRow = InferSelectModel<typeof notes>;
export type ChunkRow = InferSelectModel<typeof chunks>;

// ---------------------------------------------------------------------------
// Raw SQL helpers used by the retrieval layer
// ---------------------------------------------------------------------------

/** Cosine-distance search restricted to one notebook / source set. */
export const VECTOR_SEARCH_SQL = sql`
  SELECT
    c.id,
    c.source_id,
    c.chunk_index,
    c.section_title,
    c.page_number,
    c.text,
    c.token_count,
    1 - (e.vector <=> ${sql.raw('q.query_vector')}) AS similarity
  FROM embeddings e
  JOIN chunks c ON c.id = e.chunk_id
  WHERE e.model_name = ${sql.raw('q.model_name')}
    AND c.source_id = ANY(${sql.raw('q.source_ids')}::uuid[])
  ORDER BY e.vector <=> ${sql.raw('q.query_vector')}
  LIMIT ${sql.raw('q.limit')}
`;
