/**
 * FreeLM — seed data.
 *
 * Creates the Featured notebooks that appear on the home screen, each with
 * a couple of ready sources so the app has something to show on first run.
 *
 * Run with:  npm run db:seed --workspace=@freelm/web
 */

import { Client } from 'pg';

import { getEmbeddingProvider } from '../src/lib/ai';
import { env } from '../src/lib/env';

interface SeedSource {
  title: string;
  type: string;
  text: string;
}

interface SeedNotebook {
  title: string;
  description: string;
  icon: string;
  kind: string;
  sources: SeedSource[];
}

const FEATURED: SeedNotebook[] = [
  {
    title: 'How Retrieval-Augmented Generation Works',
    description:
      'A guided tour of chunking, embeddings and vector search — the machinery behind every grounded answer.',
    icon: '🔍',
    kind: 'featured',
    sources: [
      {
        title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP',
        type: 'text',
        text: `Retrieval-Augmented Generation (RAG) combines a parametric model with a non-parametric retriever.

The retriever indexes documents by splitting them into chunks, embedding each chunk into a dense vector, and storing those vectors in a vector database. At query time the user's question is embedded with the same model and compared against the stored vectors, typically with cosine similarity. The top-k most similar chunks are concatenated into the model's context window.

This design addresses two problems with pure language models: knowledge cutoffs and hallucination. Because the retrieved passages are supplied in the prompt, the model can quote evidence that did not exist at training time, and each claim can be traced back to a specific passage.

Chunk sizing is a practical trade-off. Small chunks improve retrieval precision but lose context; large chunks preserve context but dilute similarity. A common target is 300 to 800 tokens with roughly 50 tokens of overlap, which keeps passages semantically coherent while preserving recall at chunk boundaries.

Citation enforcement is the final piece. A robust pipeline validates that every citation in a generated answer refers to a chunk that was actually retrieved, and regenerates the answer when an ungrounded response is produced. This turns a probabilistic model into a system whose claims can be audited.`,
      },
      {
        title: 'Evaluating Retrieval Quality',
        type: 'text',
        text: `Retrieval quality dominates answer quality in a grounded system. Common metrics include recall at k, which measures how many relevant passages appear in the top-k results, and mean reciprocal rank, which rewards systems that place relevant passages near the top.

Embedding dimension matters. Higher dimensional vectors can encode more nuance but cost more storage and slow nearest-neighbour search. Changing the embedding model invalidates every stored vector, because vectors from different models occupy different spaces and cannot be meaningfully compared.

Hybrid retrieval combines dense vector search with sparse keyword search. Dense methods excel at paraphrase and conceptual similarity; sparse methods excel at exact identifiers, names and numbers. Combining them usually improves recall on heterogeneous corpora.`,
      },
    ],
  },
  {
    title: 'Note-Taking That Sticks',
    description:
      'Evidence-based techniques for turning notes you actually read into knowledge you actually keep.',
    icon: '🧠',
    kind: 'featured',
    sources: [
      {
        title: 'Retrieval Practice and Spaced Repetition',
        type: 'text',
        text: `Testing yourself on material is substantially more effective than rereading it, even when the subjective feeling of fluency suggests otherwise. This is the testing effect: effortful retrieval creates durable memory, while fluent rereading creates the illusion of learning.

Spacing the reviews out over time strengthens memory further. Each successful retrieval after a delay flattens the forgetting curve, so the interval before the next review can grow. The practical rule is to review just before you would have forgotten the material.

Feedback matters. If you check an answer and it is wrong, you learn more than if you had simply recalled it correctly by chance. For flashcards, marking a card as missed and reviewing it again later is more useful than marking it correct by elimination.

Interleaving related topics also helps, even though it feels worse than blocked practice. Mixing problem types forces discrimination between them, which is the skill you need in real situations.`,
      },
      {
        title: 'Writing Summaries You Can Use',
        type: 'text',
        text: `A summary is useful only if it compresses without losing what matters. The most durable summaries do three things: they state the central claim, they name the mechanism that supports it, and they mark what remains uncertain.

Writing the summary yourself beats copying one. The act of compressing is itself a retrieval attempt, and the places where you struggle to compress are precisely the places where your understanding is thinnest.

Convert to questions. A statement you can turn into a question and answer correctly is a statement you have learned. Statements you cannot question are usually decoration.

Finally, connect. A fact attached to a causal explanation or a comparison survives far longer than a fact attached to nothing.`,
      },
    ],
  },
  {
    title: 'The Science of Learning',
    description:
      'Cognitive science findings you can apply to studying, teaching and writing.',
    icon: '🎓',
    kind: 'featured',
    sources: [
      {
        title: 'Cognitive Load and Instruction Design',
        type: 'text',
        text: `Working memory is severely limited — around four chunks of new information at a time. Instruction fails when it exceeds that budget.

Intrinsic load comes from the material itself: the number of interacting elements a concept requires. Extraneous load comes from how the material is presented: an unclear diagram, a dense paragraph, a cluttered slide. Good instruction reduces extraneous load and then, where possible, sequences material so that intrinsic load is built up gradually.

Splitting a worked example into steps reduces extraneous load but can increase intrinsic load by hiding the structure. Novices benefit from the full example; experts benefit from the completed steps and must be told to fill in the gaps. This is the expertise-reversal effect, and it is why one teaching format cannot serve every learner.

Dual coding — pairing spoken explanation with a diagram that shows the same structure — helps because it uses two independent channels rather than asking one to do two jobs.`,
      },
    ],
  },
  {
    title: 'Statistics Without the Jargon',
    description:
      'The statistical ideas that actually change decisions, explained without a maths degree.',
    icon: '📈',
    kind: 'featured',
    sources: [
      {
        title: 'Estimation, Uncertainty and the Base Rate',
        type: 'text',
        text: `A confidence interval is a range of plausible values for a quantity, not a probability that the true value sits inside it. The frequentist interpretation is subtler than the popular one, and the popular one leads to real mistakes in medicine and law.

Base rates dominate. A test that is 99% accurate for a condition affecting 1 in 10,000 people produces about one false positive for every true positive in the population. A rare condition with a sensitive test still needs the base rate taken into account before the result means anything.

Multiple comparisons inflate false discovery. When twenty analyses are run, one will reach significance by chance alone. Pre-registering the analysis, and correcting for the number of comparisons, are the two standard defences.

Regression to the mean means that an extreme measurement is usually followed by a less extreme one, whether or not any intervention occurred. This is why "the treatment worked" claims often disappear under careful replication.`,
      },
    ],
  },
  {
    title: 'Writing Clearly',
    description:
      'Plain language, tight structure and ruthless editing — for essays, docs and prompts.',
    icon: '✍️',
    kind: 'featured',
    sources: [
      {
        title: 'Plain Language Principles',
        type: 'text',
        text: `Clear writing is a form of respect for the reader's time. Put the main point first, then support it, then add the qualifications. Most readers will stop after the first paragraph, so burying the conclusion guarantees it is missed.

Use concrete nouns and strong verbs. Nominalisations turn actions into abstractions: "made a decision" becomes "the decision was made". Unpack them.

Prefer the shorter sentence. Length is not complexity — a long sentence can carry a simple idea, and a short one can carry a hard idea — but when you are unsure, split it.

Delete the words that repeat what the reader already knows. Cut the adverb. Remove the sentence that only introduces the sentence after it.

Finally: read it aloud. Your ear catches what your eye slides over.`,
      },
    ],
  },
  {
    title: 'Data Analysis with a Sandbox',
    description:
      'Ask questions of your spreadsheets and get real numbers, not a description of them.',
    icon: '📊',
    kind: 'featured',
    sources: [
      {
        title: 'Working with Tabular Data Safely',
        type: 'text',
        text: `A spreadsheet source in a notebook is more than text: it is a dataset you can compute over. When you ask a question of a table, the answer should be a number derived from the rows, not a paraphrase of a column header.

Always check the shape of the data first: row count, column types, null counts, and duplicate keys. Most "wrong answers" in data analysis are actually shape misunderstandings rather than arithmetic errors.

Write the analysis as explicit code so it can be audited and re-run. Include the row count in the result so a reader can tell whether the filter did what you expected.

Be careful with joins. An inner join that silently drops rows can change a total without any error being raised. Report the before and after row counts.`,
      },
    ],
  },
];

async function main(): Promise<void> {
  const client = new Client({ connectionString: env.FREELM_DATABASE_URL });
  await client.connect();

  // Real embeddings are used when a provider is configured. Without one the
  // chunks are still seeded, but they are marked as not-yet-searchable and
  // `npm run db:reembed` fills them in later.
  let embed: ((texts: string[]) => Promise<number[][]>) | null = null;
  let embeddingModel = '';
  try {
    const provider = getEmbeddingProvider();
    if (provider.info.embeddingDim > 0) {
      // Prove the provider actually works before committing to it.
      await provider.embed(['FreeLM seed check']);
      embed = (texts: string[]) => provider.embed(texts);
      embeddingModel = provider.info.embeddingModel;
    }
  } catch {
    embed = null;
  }

  if (embed) {
    console.log(`[seed] embedding with ${embeddingModel}`);
  } else {
    console.log(
      '[seed] no AI provider configured — chunks will be seeded without vectors.',
    );
    console.log('[seed] run "npm run db:reembed" once a key is set to enable search.');
  }

  const existing = await client.query(
    "SELECT count(*)::int AS n FROM notebooks WHERE is_featured = true",
  );
  if ((existing.rows[0]?.n ?? 0) > 0) {
    console.log('[seed] featured notebooks already exist — nothing to do.');
    await client.end();
    return;
  }

  for (const notebook of FEATURED) {
    const inserted = await client.query(
      `INSERT INTO notebooks (title, description, icon, kind, is_featured, is_public)
       VALUES ($1, $2, $3, $4, true, true)
       RETURNING id`,
      [notebook.title, notebook.description, notebook.icon, notebook.kind],
    );
    const notebookId = inserted.rows[0]?.id as string;

    await client.query(
      `INSERT INTO notebook_settings (notebook_id) VALUES ($1)`,
      [notebookId],
    );
    await client.query(
      `INSERT INTO threads (notebook_id, title) VALUES ($1, 'New chat')`,
      [notebookId],
    );

    for (const source of notebook.sources) {
      const sourceInserted = await client.query(
        `INSERT INTO sources
           (notebook_id, title, type, status, progress, extracted_text, metadata)
         VALUES ($1, $2, $3, 'ready', 100, $4, $5)
         RETURNING id`,
        [
          notebookId,
          source.title,
          source.type,
          source.text,
          JSON.stringify({
            preExtracted: true,
            wordCount: source.text.split(/\s+/).length,
            searchable: Boolean(embed),
            ...(embed
              ? {}
              : {
                  note: 'Seeded without embeddings. Run "npm run db:reembed" after configuring an AI provider to enable search.',
                }),
          }),
        ],
      );
      const sourceId = sourceInserted.rows[0]?.id as string;

      // Chunk the seeded text with the same rules the pipeline uses.
      const { chunkDocument } = await import('../src/lib/ai/chunking');
      const chunks = chunkDocument({ text: source.text });

      for (const chunk of chunks) {
        const chunkInserted = await client.query(
          `INSERT INTO chunks
             (source_id, chunk_index, section_title, text, token_count, char_start, char_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            sourceId,
            chunk.chunkIndex,
            chunk.sectionTitle,
            chunk.text,
            chunk.tokenCount,
            chunk.charStart,
            chunk.charEnd,
          ],
        );
        const chunkId = chunkInserted.rows[0]?.id as string;

        if (embed) {
          const [vector] = await embed([chunk.text]);
          if (vector) {
            await client.query(
              `INSERT INTO embeddings (chunk_id, vector, model_name)
               VALUES ($1, $2::vector, $3)
               ON CONFLICT (chunk_id) DO UPDATE
                 SET vector = EXCLUDED.vector, model_name = EXCLUDED.model_name`,
              [chunkId, `[${vector.join(',')}]`, embeddingModel],
            );
          }
        }
      }
    }

    console.log(`[seed] created "${notebook.title}"`);
  }

  await client.end();
  console.log('[seed] done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
