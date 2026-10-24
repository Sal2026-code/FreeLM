CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TYPE "public"."chat_mode" AS ENUM('exploratory', 'analytical', 'study', 'creative', 'instructional', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."notebook_kind" AS ENUM('regular', 'study', 'featured');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('uploaded', 'extracting', 'chunking', 'embedding', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('file', 'pdf', 'text', 'web', 'youtube', 'image', 'audio', 'gdrive', 'gdrive_doc', 'gdrive_sheet', 'gdrive_slide', 'ebook', 'note', 'research', 'chat_import', 'epub', 'docx', 'pptx', 'csv');--> statement-breakpoint
CREATE TYPE "public"."studio_tool" AS ENUM('report', 'slide_deck', 'infographic', 'mind_map', 'data_table', 'video_overview', 'quiz', 'flashcards', 'audio_overview', 'briefing_doc', 'study_guide', 'faq', 'timeline', 'outline', 'key_concepts', 'argument_map', 'concept_map', 'section_breakdown', 'chapter_summary', 'learning_objectives', 'practice_questions', 'socratic_qa', 'reading_comprehension', 'teach_back', 'lesson_plan', 'interactive_learning', 'data_analysis', 'note');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"section_title" text,
	"page_number" integer,
	"text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"char_start" integer,
	"char_end" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co_creation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"output_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"chunk_id" uuid PRIMARY KEY NOT NULL,
	"vector" vector(1536) NOT NULL,
	"model_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"value" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"isbn" text,
	"cover_url" text,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"mode" "chat_mode",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebook_overviews" (
	"notebook_id" uuid PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebook_settings" (
	"notebook_id" uuid PRIMARY KEY NOT NULL,
	"custom_instructions" text DEFAULT '' NOT NULL,
	"chat_mode" "chat_mode" DEFAULT 'exploratory' NOT NULL,
	"response_length" text DEFAULT 'medium' NOT NULL,
	"default_scope" text DEFAULT 'all' NOT NULL,
	"retrieval_k" integer DEFAULT 12 NOT NULL,
	"output_language" text DEFAULT 'en' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebook_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"session_id" text,
	"title" text NOT NULL,
	"description" text,
	"icon" text DEFAULT '📓' NOT NULL,
	"kind" "notebook_kind" DEFAULT 'regular' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"learning_goal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled note' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"citation_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email" text,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_label_members" (
	"label_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "source_label_members_label_id_source_id_pk" PRIMARY KEY("label_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "source_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#8ab4f8' NOT NULL,
	"is_auto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "source_type" DEFAULT 'file' NOT NULL,
	"status" "source_status" DEFAULT 'uploaded' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"storage_key" text,
	"extracted_text" text,
	"guide" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"type" "studio_tool" NOT NULL,
	"title" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_url" text,
	"file_mime" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"output_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"right_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_creation_sessions" ADD CONSTRAINT "co_creation_sessions_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co_creation_sessions" ADD CONSTRAINT "co_creation_sessions_output_id_studio_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."studio_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_overviews" ADD CONSTRAINT "notebook_overviews_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_settings" ADD CONSTRAINT "notebook_settings_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_shares" ADD CONSTRAINT "notebook_shares_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_label_members" ADD CONSTRAINT "source_label_members_label_id_source_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."source_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_label_members" ADD CONSTRAINT "source_label_members_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_labels" ADD CONSTRAINT "source_labels_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_outputs" ADD CONSTRAINT "studio_outputs_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_output_id_studio_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."studio_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_source_index_idx" ON "chunks" USING btree ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "co_creation_sessions_notebook_idx" ON "co_creation_sessions" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "embeddings_model_idx" ON "embeddings" USING btree ("model_name");--> statement-breakpoint
CREATE INDEX "feedback_target_idx" ON "feedback" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "library_books_notebook_idx" ON "library_books" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "message_citations_message_idx" ON "message_citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_citations_chunk_idx" ON "message_citations" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notebook_shares_token_idx" ON "notebook_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "notebooks_owner_idx" ON "notebooks" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "notebooks_session_idx" ON "notebooks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "notebooks_featured_idx" ON "notebooks" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "notebooks_updated_idx" ON "notebooks" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "notes_notebook_idx" ON "notes" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_label_members_source_idx" ON "source_label_members" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_labels_notebook_idx" ON "source_labels" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "sources_notebook_idx" ON "sources" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_outputs_notebook_idx" ON "studio_outputs" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "studio_outputs_type_idx" ON "studio_outputs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "study_sessions_notebook_idx" ON "study_sessions" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "threads_notebook_idx" ON "threads" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "threads_updated_idx" ON "threads" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
--> statement-breakpoint
-- Vector search index. ivfflat is a good default for a self-hosted corpus
-- of this size; switch to hnsw for larger datasets.
CREATE INDEX IF NOT EXISTS embeddings_vector_idx
  ON embeddings USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
--> statement-breakpoint
-- Keep notebook updated_at in step with its children.
CREATE OR REPLACE FUNCTION freelm_touch_notebook() RETURNS trigger AS $$
BEGIN
  UPDATE notebooks SET updated_at = now() WHERE id = NEW.notebook_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sources_touch_notebook ON sources;
--> statement-breakpoint
CREATE TRIGGER sources_touch_notebook
  AFTER INSERT OR UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION freelm_touch_notebook();
--> statement-breakpoint
DROP TRIGGER IF EXISTS threads_touch_notebook ON threads;
--> statement-breakpoint
CREATE TRIGGER threads_touch_notebook
  AFTER INSERT OR UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION freelm_touch_notebook();
--> statement-breakpoint
DROP TRIGGER IF EXISTS outputs_touch_notebook ON studio_outputs;
--> statement-breakpoint
CREATE TRIGGER outputs_touch_notebook
  AFTER INSERT OR UPDATE ON studio_outputs
  FOR EACH ROW EXECUTE FUNCTION freelm_touch_notebook();

