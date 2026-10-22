/**
 * FreeLM — provider check.
 *
 * Tries every configured AI provider and reports what works, what is
 * misconfigured and what to do about it.
 *
 * Run with:  npm run check:providers --workspace=@freelm/web
 */

import { env } from '../src/lib/env';

interface Result {
  name: string;
  configured: boolean;
  working: boolean | null;
  detail: string;
}

async function checkOpenAi(): Promise<Result> {
  const configured = env.FREELM_OPENAI_API_KEY.length > 0;
  if (!configured) {
    return {
      name: 'OpenAI',
      configured: false,
      working: null,
      detail: 'no FREELM_OPENAI_API_KEY',
    };
  }
  try {
    const response = await fetch(`${env.FREELM_OPENAI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${env.FREELM_OPENAI_API_KEY}` },
    });
    return {
      name: 'OpenAI',
      configured: true,
      working: response.ok,
      detail: response.ok
        ? `${env.FREELM_OPENAI_CHAT_MODEL} ready`
        : `HTTP ${response.status} — check the key`,
    };
  } catch (error) {
    return {
      name: 'OpenAI',
      configured: true,
      working: false,
      detail: error instanceof Error ? error.message : 'network error',
    };
  }
}

async function checkGemini(): Promise<Result> {
  const configured = env.FREELM_GEMINI_API_KEY.length > 0;
  if (!configured) {
    return {
      name: 'Google Gemini',
      configured: false,
      working: null,
      detail: 'no FREELM_GEMINI_API_KEY',
    };
  }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.FREELM_GEMINI_CHAT_MODEL}:generateContent?key=${env.FREELM_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        }),
      },
    );
    if (response.ok) {
      return {
        name: 'Google Gemini',
        configured: true,
        working: true,
        detail: `${env.FREELM_GEMINI_CHAT_MODEL} ready (chat + TTS + embeddings)`,
      };
    }
    const body = await response.text();
    const project = /project (\d+)/.exec(body)?.[1];

    // "has not been used in project X before or it is disabled" and
    // "Requests to this API ... are blocked" both mean the same thing: the
    // Generative Language API has not been enabled for the project.
    if (
      body.includes('has not been used in project') ||
      body.includes('are blocked') ||
      body.includes('SERVICE_DISABLED')
    ) {
      const url = project
        ? `https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=${project}`
        : 'https://console.developers.google.com/apis/library/generativelanguage.googleapis.com';
      return {
        name: 'Google Gemini',
        configured: true,
        working: false,
        detail:
          'the Generative Language API is not enabled for this project. ' +
          `Enable it here: ${url} ` +
          '(one click, then wait ~1 minute and run this command again)',
      };
    }
    if (response.status === 400 || response.status === 403) {
      return {
        name: 'Google Gemini',
        configured: true,
        working: false,
        detail: `HTTP ${response.status} — ${body.slice(0, 180)}`,
      };
    }
    return {
      name: 'Google Gemini',
      configured: true,
      working: false,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name: 'Google Gemini',
      configured: true,
      working: false,
      detail: error instanceof Error ? error.message : 'network error',
    };
  }
}

async function checkCompatible(): Promise<Result> {
  const configured = env.FREELM_OPENAI_COMPATIBLE_BASE_URL.length > 0;
  if (!configured) {
    return {
      name: 'OpenAI-compatible',
      configured: false,
      working: null,
      detail: 'no FREELM_OPENAI_COMPATIBLE_BASE_URL',
    };
  }
  try {
    const response = await fetch(
      `${env.FREELM_OPENAI_COMPATIBLE_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.FREELM_OPENAI_COMPATIBLE_API_KEY
            ? { Authorization: `Bearer ${env.FREELM_OPENAI_COMPATIBLE_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({
          model: env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
        }),
      },
    );
    return {
      name: 'OpenAI-compatible',
      configured: true,
      working: response.ok,
      detail: response.ok
        ? `${env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model'} ready`
        : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name: 'OpenAI-compatible',
      configured: true,
      working: false,
      detail: error instanceof Error ? error.message : 'network error',
    };
  }
}

async function main(): Promise<void> {
  console.log('FreeLM — provider check\n');
  console.log(`AI_PROVIDER        : ${env.FREELM_AI_PROVIDER}`);
  console.log(`EMBEDDING_PROVIDER : ${env.FREELM_EMBEDDING_PROVIDER}`);
  console.log(`TTS_BACKEND        : ${env.FREELM_TTS_BACKEND}\n`);

  const results = await Promise.all([
    checkGemini(),
    checkOpenAi(),
    checkCompatible(),
  ]);

  for (const result of results) {
    const mark = result.working === null ? '·' : result.working ? '✓' : '✗';
    console.log(
      `${mark} ${result.name.padEnd(20)} ${result.configured ? '' : '(not configured) '}${result.detail}`,
    );
  }

  const working = results.filter((r) => r.working);
  console.log('');
  if (working.length === 0) {
    console.log(
      'No hosted provider works. FreeLM still runs: set FREELM_EMBEDDING_PROVIDER=local ' +
        'for offline retrieval and FREELM_TTS_BACKEND=edge for keyless audio overviews.',
    );
  } else {
    console.log(`Ready to use: ${working.map((r) => r.name).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
