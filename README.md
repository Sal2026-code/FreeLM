# FreeLM

**An open-source, unrestricted clone of Google's Gemini Notebook (formerly NotebookLM).**

FreeLM is a source-grounded research and study assistant: you add sources, ask
questions, and get answers that cite the exact passage they came from. It ships
as **both a website and a mobile app** and shares one backend.

> **Everything is unlocked.** There are no premium tiers, no paywalls, no
> feature flags and no upgrade prompts. Every tool in Google’s Notebook is
> available to every user, including the ones Google gates behind its paid
> plans. That is the entire point of this project.

---

## Table of contents

- [What it does](#what-it-does)
- [Feature parity with Gemini Notebook](#feature-parity-with-gemini-notebook)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [API reference](#api-reference)
- [Mobile app](#mobile-app)
- [How the grounding works](#how-the-grounding-works)
- [Scripts](#scripts)
- [License](#license)

---

## What it does

FreeLM is a three-pane workspace, exactly like the original:

| Pane | What it does |
|---|---|
| **Sources** (left) | Add PDFs, Word documents, PowerPoint, CSV, ePub, images (OCR), audio (transcription), websites, YouTube videos, Google Drive files, pasted text and notes. Watch them move through *Uploading → Extracting → Chunking → Embedding → Ready*. Read the extracted text, the chunks or the metadata. Group them with auto-generated labels. |
| **Chat** (center) | Ask anything. Every factual claim is grounded in a retrieved chunk and carries a clickable citation chip. Click a chip and the Sources pane scrolls to the exact passage and highlights it. Six response modes, source scoping, custom instructions, multiple threads, and a pinned notebook overview with suggested questions. |
| **Studio** (right) | Generate real deliverables: audio overviews, video overviews, slide decks, infographics, mind maps, quizzes, flashcards, data tables, study guides, briefing docs, FAQs, timelines, outlines, and more. Save the result as a note, or send it back into the chat. |

---

## Feature parity with Gemini Notebook

FreeLM tracks Google’s Gemini Notebook as of **19 October 2026**. Everything in
this table is implemented and unlocked.

### Sources

| Feature | Where |
|---|---|
| Upload files (PDF, DOCX, PPTX, CSV, MD, TXT, ePub, images, audio) | `POST /api/notebooks/:id/sources/upload` |
| Websites (Readability extraction) | `POST /api/notebooks/:id/sources/web` |
| Copied text | `POST /api/notebooks/:id/sources/text` |
| YouTube transcripts | `POST /api/notebooks/:id/sources/youtube` |
| Google Drive import (auto-syncing living documents) | `sources.type = 'gdrive*'` |
| **Web + Fast Research** | `POST /api/notebooks/:id/search` (`mode: 'fast'`) |
| **Web + Deep Research** (synthesises a report and adds it as a source) | `POST /api/notebooks/:id/search` (`mode: 'deep'`) |
| **Expert Intelligence** — ebooks from a personal library | `library_books` table + `sources.type = 'ebook'` |
| **Auto-label & categorise** sources (5+ sources) | `source_labels` / `source_label_members` |
| **Source Guide** — per-source summary and outline | `sources.guide` |
| **Audio import** — MP3/WAV/M4A/…, 80+ languages | `sources.type = 'audio'` |
| **Photo / handwriting OCR** | `sources.type = 'image'` |
| **Voice memo capture** (mobile) → source | `apps/mobile/app/capture.tsx` |
| **No source limit** — enforced nowhere | schema + API |

### Chat

| Feature | Where |
|---|---|
| Grounded answers with inline citation chips | `[[C:chunkId]]` protocol, validated server-side |
| Click a citation → scroll + highlight the chunk | `CitationChip` → `SourceViewer` |
| **Configure Chat** — custom instructions, mode, length, scope | `notebook_settings` |
| **Delete Chat History** | `DELETE /api/notebooks/:id/threads/:threadId/messages` |
| Multiple threads with auto-generated 3–6 word titles | `threads` + `maybeAutoTitle()` |
| Pinned notebook overview + 3–6 suggested questions | `notebook_overviews` |
| **Ask about your quiz/flashcard performance** | `study_sessions` |
| **Real-time voice conversation** (mobile) | `expo-speech` + streaming chat |

### Studio

| Tool | Output |
|---|---|
| **Audio Overview** — Deep Dive, The Brief, The Critique, The Debate | A real `.mp3` podcast (two TTS voices → ffmpeg) + transcript + **Interactive Mode** (join the conversation) |
| **Video Overview** — Scientific, Professional, Editorial, Sketch Note, Explainer | A real `.mp4` (canvas slides → TTS → ffmpeg) |
| **Short Video Overview** (~60 seconds, shareable) | `.mp4` with `duration: 'short'` |
| **Reports** — briefing docs, study guides, FAQs, timelines, outlines, key concepts, argument maps, concept maps, section breakdowns, chapter summaries, learning objectives, practice questions, Socratic Q&A, reading comprehension, teach-back, lesson plans | Markdown document with citations |
| **Interactive Learning Overview** | A step-by-step walkthrough weaving summaries, slides, quizzes and flashcards together |
| **Slide Decks** | Deck structure + speaker notes, exportable to PDF/PPTX, per-slide revision instructions |
| **Infographics** | A rendered PNG visual |
| **Mind Maps** | An interactive node graph — click a branch to chat about it |
| **Quizzes** | Multiple choice, **multiple select**, **short answer** and **fill in the blank**; Right/Wrong/Skipped tracking, completion ring, topics covered, Keep-learning chips, Review and Retake |
| **Flashcards** | Shuffle, tap-to-reveal, Got it / Missed it, review and retake |
| **Data Tables** | Structured table with per-row citations and CSV export |
| **Data Analysis** (the "cloud computer") | Sandboxed code execution over your spreadsheets and data |
| **Co-creation** (Oct 2026) | Propose topics → confirm → steer → **Review toggle** with “Review outline notes” / “Review producer notes” → Proceed |
| **Notes** | Scratchpad notes, promotable to a source |

---

## Architecture

```
┌────────────────────────┐   ┌──────────────────────────┐
│  apps/web              │   │  apps/mobile             │
│  Next.js 14 App Router │   │  Expo SDK 58             │
│  (website + PWA)       │   │  (iOS + Android)         │
└───────────┬────────────┘   └────────────┬─────────────┘
            │                             │
            └──────────┬──────────────────┘
                       │  REST + NDJSON streaming
            ┌──────────▼───────────┐
            │  Next.js Route Handlers│
            └──────────┬───────────┘
                       │
      ┌────────────────┼─────────────────┐
      │                │                 │
┌─────▼─────┐   ┌──────▼──────┐   ┌──────▼───────┐
│ AI adapter│   │  BullMQ     │   │  Storage     │
│ OpenAI /  │   │  + Redis    │   │  local / S3  │
│ Gemini /  │   │  ingestion  │   └──────────────┘
│ Anthropic │   │  + studio   │
└─────┬─────┘   └──────┬──────┘
      │                │
      │         ┌──────▼────────────────────────┐
      │         │  PostgreSQL 16 + pgvector      │
      │         │  20 tables, ivfflat vector idx │
      │         └───────────────────────────────┘
      │
   ffmpeg ──► real .mp3 / .mp4 artifacts
```

### Why a provider adapter

Chat, embeddings, TTS and image generation all go through one interface, so
**you choose the model** — there is no vendor lock-in:

- `FREELM_AI_PROVIDER=openai` (default) — GPT-4o-mini + `text-embedding-3-small` (1536-dim, matching `vector(1536)`) + `gpt-4o-mini-tts`
- `openai-compatible` — Ollama, LM Studio, vLLM, OpenRouter, Groq, Together, DeepSeek, Mistral, xAI, Cloudflare Workers AI…
- `gemini` — native Gemini API, including multi-voice TTS for 100+ languages
- `anthropic` — Claude for chat (embeddings fall back to an OpenAI-compatible endpoint)

Embeddings are the one dimension-locked part: vectors from different models
live in different spaces, so changing the embedding model is a deliberate
migration, not a live toggle. FreeLM stores `model_name` on every vector,
filters retrieval by the active model, and ships `npm run db:reembed` to move
between them safely.

---

## Quick start

**Requirements:** Node.js 20+, Docker Desktop, and an API key for your chosen
AI provider. Everything else runs locally.

```bash
# 1. Start Postgres (with pgvector) and Redis
docker compose up -d

# 2. Install dependencies
npm install
npm run mobile:install          # mobile has its own tree (React 19)

# 3. Configure
cp .env.example apps/web/.env.local
#    then put your key in FREELM_OPENAI_API_KEY and set FREELM_AUTH_SECRET
#    (generate one: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 4. Create the schema and the sample notebooks
npm run db:migrate
npm run db:seed

# 5. Run it
npm run dev                     # website → http://localhost:3000
npm run worker                  # ingestion worker (separate terminal)
npm run worker:studio           # audio/video generation (separate terminal)
```

Open <http://localhost:3000> and click **Create new notebook**. No sign-up
required — every visitor gets a guest session and can use every feature.

---

## Configuration

All configuration lives in `apps/web/.env.local`. See `.env.example` for the
full list.

| Variable | Default | Purpose |
|---|---|---|
| `FREELM_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/freelm` | Postgres connection |
| `FREELM_REDIS_URL` | `redis://localhost:6379` | BullMQ |
| `FREELM_AUTH_SECRET` | — | **Required** for sessions. Generate one. |
| `FREELM_AI_PROVIDER` | `openai` | `openai` \| `gemini` \| `anthropic` \| `openai-compatible` |
| `FREELM_OPENAI_API_KEY` | — | Your provider key |
| `FREELM_EMBEDDING_DIM` | `1536` | pgvector column width |
| `FREELM_RETRIEVAL_K` | `12` | Default retrieval depth (4–40) |
| `FREELM_BRAVE_API_KEY` / `FREELM_TAVILY_API_KEY` | — | Optional: upgrades web search. Works keyless without them. |
| `FREELM_GOOGLE_CLIENT_ID` / `_SECRET` | — | Optional: enables Google sign-in and Drive import |
| `FREELM_STORAGE_DRIVER` | `local` | `local` or `s3` |

---

## Repository layout

```
freelm/
├── apps/
│   ├── web/                    Next.js 14 — website + PWA
│   │   ├── src/app/            Routes and API handlers
│   │   ├── src/components/     UI (workspace, chat, sources, studio)
│   │   ├── src/lib/            AI, RAG, ingestion, media, storage, auth
│   │   ├── src/workers/        BullMQ workers
│   │   └── scripts/            migrate, seed, reembed
│   └── mobile/                 Expo SDK 58 — iOS and Android
│       └── app/                expo-router screens
├── packages/shared/            Types, API client, citation parser, languages
├── drizzle/                    Generated SQL migrations
├── docker-compose.yml          Postgres + Redis
└── scripts/
```

---

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/session` | Current session and capabilities |
| `GET` `POST` | `/api/notebooks` | List / create notebooks |
| `GET` `PATCH` `DELETE` | `/api/notebooks/:id` | Read, rename, pin, delete |
| `GET` `PATCH` | `/api/notebooks/:id/settings` | Custom instructions, mode, length, retrieval depth |
| `GET` | `/api/notebooks/:id/sources` | List sources with progress |
| `POST` | `/api/notebooks/:id/sources/upload` | Upload files (multipart) |
| `POST` | `/api/notebooks/:id/sources/text` | Add pasted text |
| `POST` | `/api/notebooks/:id/sources/web` | Add a website |
| `POST` | `/api/notebooks/:id/sources/youtube` | Add a YouTube video |
| `GET` `PATCH` `DELETE` | `/api/notebooks/:id/sources/:sourceId` | Read (text + chunks), rename, remove |
| `POST` | `/api/notebooks/:id/sources/:sourceId/retry` | Retry a failed import |
| `GET` `POST` | `/api/notebooks/:id/sources/labels` | Source labels |
| `POST` | `/api/notebooks/:id/search` | Fast / Deep Research |
| `GET` `POST` | `/api/notebooks/:id/threads` | Chat threads |
| `GET` `POST` `DELETE` | `/api/notebooks/:id/threads/:threadId/messages` | Messages, ask, clear |
| `POST` | `/api/notebooks/:id/threads/:threadId/stream` | Streaming answer (NDJSON) |
| `GET` `POST` | `/api/notebooks/:id/studio/generate` | Generate a Studio artifact |
| `GET` `DELETE` | `/api/notebooks/:id/studio/outputs/:outputId` | Read / delete an artifact |
| `GET` | `/api/files/*` | Serve a generated `.mp3`, `.mp4`, `.png` |
| `GET` | `/api/notebooks/:id/events` | Workspace event stream (SSE) |
| `GET` `POST` | `/api/notebooks/:id/notes` | Notes |

---

## Mobile app

```bash
npm run mobile:install
npm run mobile            # Expo dev server (press `a` for Android, `i` for iOS)
npm run mobile:build:android   # EAS build → APK
npm run mobile:build:ios       # EAS build → IPA
```

The mobile app talks to the same API as the website. Point it at your machine
from **Settings → Server address** — use your LAN IP on a real device, or
`http://10.0.2.2:3000` on the Android emulator.

Mobile-only features: camera OCR, voice memo capture, read-aloud, and voice
conversation.

---

## How the grounding works

FreeLM does not ask a model to "try to cite". It makes citing impossible to
fake:

1. **Retrieve** — the question is embedded and matched against every chunk in
   scope using pgvector cosine distance. Retrieval is filtered by the active
   embedding model.
2. **Ground** — only the retrieved chunks are placed in the prompt. The model
   is instructed to emit `[[C:chunkId]]` markers copied verbatim from them.
3. **Validate** — the server checks every marker against the retrieved set.
   A citation to a chunk that was not retrieved is **stripped**. An answer that
   made claims but cited nothing is **regenerated once**; if it still fails, the
   user gets *"That information is not available in your sources."* rather than
   a plausible fabrication.
4. **Render** — surviving markers become numbered chips. Clicking one opens the
   Sources pane at that chunk and highlights the supporting passage.

Chunking targets 300–800 tokens with ~50 tokens of overlap, preserves
headings with the text they introduce, and keeps lists and tables intact.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app |
| `npm run worker` | Start the ingestion worker |
| `npm run worker:studio` | Start the audio/video generation worker |
| `npm run db:migrate` | Apply the schema |
| `npm run db:seed` | Create the featured sample notebooks |
| `npm run db:reembed` | Fill in or refresh embeddings |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` | Type-check every workspace |

---

## License

**AGPL-3.0-or-later.** FreeLM is free software — use it, modify it, self-host
it, and share it. If you run a modified version over a network, offer your
users the source.

This project is not affiliated with, endorsed by, or connected to Google.
NotebookLM and Gemini Notebook are trademarks of Google LLC.
