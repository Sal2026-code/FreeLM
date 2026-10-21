import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import type { Citation } from '@freelm/shared';

import { db, schema } from '@/lib/db';
import { listMessages, listOutputs, listSources } from '@/lib/api/queries';
import { resolveShareToken } from '@/lib/auth/session';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { StudioOutputViewer } from '@/components/studio/StudioOutputViewer';
import { BrandMark } from '@/components/shell/TopNav';

export const dynamic = 'force-dynamic';

/**
 * A public, read-only view of a shared notebook.
 */
export default async function SharedNotebookPage({
  params,
}: {
  params: { token: string };
}) {
  const notebookId = await resolveShareToken(params.token);
  if (!notebookId) notFound();

  const [notebook] = await db
    .select()
    .from(schema.notebooks)
    .where(eq(schema.notebooks.id, notebookId))
    .limit(1);
  if (!notebook) notFound();

  const [thread] = await db
    .select()
    .from(schema.threads)
    .where(eq(schema.threads.notebookId, notebookId))
    .orderBy(asc(schema.threads.createdAt))
    .limit(1);

  const [sources, outputs, messages, overview] = await Promise.all([
    listSources(notebookId),
    listOutputs(notebookId),
    thread ? listMessages(thread.id) : Promise.resolve([]),
    db
      .select()
      .from(schema.notebookOverviews)
      .where(eq(schema.notebookOverviews.notebookId, notebookId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center gap-2.5 border-b border-hairline px-4">
        <BrandMark />
        <span className="text-[15px] font-semibold text-neutral-50">FreeLM</span>
        <span className="mx-2 h-5 w-px bg-hairline" />
        <span className="text-base leading-none" aria-hidden>
          {notebook.icon}
        </span>
        <span className="truncate text-[14px] text-neutral-200">
          {notebook.title}
        </span>
        <span className="ml-auto rounded-pill border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] text-neutral-500">
          Read-only shared view
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {notebook.description ? (
          <p className="mb-6 text-[14px] leading-6 text-neutral-400">
            {notebook.description}
          </p>
        ) : null}

        {overview ? (
          <section className="mb-8">
            <MarkdownRenderer
              content={overview.content}
              citations={(overview.citations ?? []) as Citation[]}
            />
          </section>
        ) : null}

        {messages.length > 0 ? (
          <section className="mb-8 space-y-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Conversation
            </h2>
            {messages.map((message) => (
              <article key={message.id}>
                {message.role === 'user' ? (
                  <p className="mb-2 text-[13px] font-medium text-neutral-400">
                    {message.content}
                  </p>
                ) : (
                  <MarkdownRenderer
                    content={message.content}
                    citations={message.citations}
                  />
                )}
              </article>
            ))}
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Sources ({sources.length})
          </h2>
          <ul className="space-y-1.5">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center gap-2 text-[13px] text-neutral-300">
                <span className="material-symbols-rounded text-[16px] text-neutral-500">
                  description
                </span>
                {source.title}
              </li>
            ))}
          </ul>
        </section>

        {outputs.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Studio outputs
            </h2>
            <div className="space-y-3">
              {outputs.map((output) => (
                <div
                  key={output.id}
                  className="rounded-panel border border-hairline bg-surface p-4"
                >
                  <StudioOutputViewer
                    output={output}
                    onBack={() => undefined}
                    onChanged={async () => undefined}
                    onSendToChat={async () => undefined}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
