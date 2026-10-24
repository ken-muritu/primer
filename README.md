# Primer

An AI-powered learning platform that transforms official software documentation
into interactive, trustworthy learning experiences while preserving the original
source as the single source of truth.

Paste a documentation URL. Primer crawls it once into a Space, then gives you two
experiences from the same indexed knowledge:

- Chat: ask anything; answers are grounded in the docs and cite the exact source page.
- Course: auto-generated lessons plus quizzes with XP and streaks.

Live: [primer-puce.vercel.app](https://primer-puce.vercel.app)

## Architecture

    URL
      |
      v
    Crawler (depth-limited, public pages only, 60-page cap)
      |
      v
    Markdown normalization
      |
      v
    Chunking
      |
      v
    Embeddings
      |
      v
    Knowledge Index (source_pages + chunks)
      /                       \\
  Chat                       Course

Ingestion is asynchronous: creating a Space queues a job; a worker (the Space page polling,
with a daily Vercel Cron on /api/cron/ingest as a backstop) crawls and indexes it. The
user is never blocked. Lessons are generated lazily the first time the Course tab
is opened, then cached - so chat-only users never pay for generation.

## Stack

- Next.js 15 (App Router) and Tailwind
- Turso (libSQL) for DB plus vectors (a chunks.embedding column, cosine over normalized vectors)
- Anthropic Claude for chat, lesson, and quiz generation (optional - graceful local fallback if absent)
- Hosted on Vercel (cron drives the ingest job queue)

## Data model

spaces, source_pages, chunks (reference page_id), jobs (ingest queue), lessons,
quiz_questions, user_progress, streaks, sessions. See src/lib/db.ts for the schema.

## Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `TURSO_URL` (or `DATABASE_URL`) | Persistence | Your Turso database URL (`libsql://…`). Without it the app falls back to in-memory SQLite (sql.js), which works locally but does not persist across requests on Vercel. |
| `TURSO_AUTH_TOKEN` (or `DATABASE_AUTH_TOKEN`) | Persistence | Turso auth token |
| `ANTHROPIC_API_KEY` | Full answers | Optional. Claude (`claude-sonnet-4-0`) writes chat answers, lessons and quizzes. Without it a local fallback is used. |
| `CRON_SECRET` | Production | Protects `/api/cron/ingest`. Vercel Cron sends it as a bearer token. If it is unset the endpoint is open. |
| `PRIMER_MAX_PAGES` | Optional | Crawl cap per Space (default 60) |

Set them in the Vercel project (Settings > Environment Variables), or locally in a `.env.local` file (git ignores it).

## Local dev

    npm install
    npm run dev

With no environment variables the app still runs: it uses the in-memory database and deterministic
embeddings, so chat and courses work end to end without API keys.

## MVP scope

In: URL ingest (queued), cited chat, lazy course generation, quizzes, XP/streak,
public sharing, Space versioning (version_label + last_synced).
Out (v1): deep or multi-domain crawl, PDF or video sources, audio, leaderboards, teams.

## Licence

Copyright © 2026 Kennedy Muritu. All rights reserved. The code is public to read, not to reuse. See [LICENSE](LICENSE).
