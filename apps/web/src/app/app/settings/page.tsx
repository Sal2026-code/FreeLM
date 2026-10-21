'use client';

import { useEffect, useState } from 'react';

import { TopNav } from '@/components/shell/TopNav';
import { Button, cn, useToast } from '@/components/ui/primitives';

interface Capability {
  aiProvider: boolean;
  googleAuth: boolean;
}

export default function SettingsPage() {
  const toast = useToast();
  const [capabilities, setCapabilities] = useState<Capability | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [retrievalK, setRetrievalK] = useState(12);

  useEffect(() => {
    (async () => {
      const response = await fetch('/api/session');
      if (response.ok) {
        const data = (await response.json()) as {
          capabilities: Capability;
        };
        setCapabilities(data.capabilities);
      }
    })();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('freelm.theme');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
    const storedK = window.localStorage.getItem('freelm.retrievalK');
    if (storedK) setRetrievalK(Number(storedK));
  }, []);

  function applyTheme(next: 'dark' | 'light') {
    setTheme(next);
    window.localStorage.setItem('freelm.theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav variant="list" />

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          Settings
        </h1>
        <p className="mt-1 text-[13px] text-neutral-500">
          FreeLM is free and open source. There is nothing to upgrade and
          nothing is locked.
        </p>

        <div className="mt-6 space-y-4">
          {/* Appearance */}
          <section className="rounded-panel border border-hairline bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-neutral-50">
              Appearance
            </h2>
            <div className="mt-3">
              <p className="mb-1.5 text-[13px] text-neutral-300">Theme</p>
              <div className="flex gap-1.5">
                {(['dark', 'light'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => applyTheme(option)}
                    className={cn(
                      'rounded-pill border px-3.5 py-1.5 text-[13px] capitalize transition',
                      theme === option
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Retrieval */}
          <section className="rounded-panel border border-hairline bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-neutral-50">
              Retrieval
            </h2>
            <p className="mt-1 text-[12.5px] text-neutral-500">
              How many source passages to consider for each question. Higher is
              more thorough but slower.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={4}
                max={40}
                value={retrievalK}
                onChange={(event) => setRetrievalK(Number(event.target.value))}
                onMouseUp={() =>
                  window.localStorage.setItem(
                    'freelm.retrievalK',
                    String(retrievalK),
                  )
                }
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent"
              />
              <span className="w-8 text-right text-[13px] text-neutral-300">
                {retrievalK}
              </span>
            </div>
          </section>

          {/* Connections */}
          <section className="rounded-panel border border-hairline bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-neutral-50">
              Connections
            </h2>
            <ul className="mt-3 space-y-2">
              <ConnectionRow
                label="AI provider"
                description="Powers chat, citations and every Studio tool."
                enabled={capabilities?.aiProvider ?? false}
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      toast.push({
                        tone: 'info',
                        title: 'Configure in .env.local',
                        description:
                          'Set FREELM_OPENAI_API_KEY (or a Gemini / Anthropic / OpenAI-compatible key) and restart the server.',
                      });
                    }}
                  >
                    Configure
                  </Button>
                }
              />
              <ConnectionRow
                label="Google sign-in"
                description="Sync notebooks across devices and share them with other people."
                enabled={capabilities?.googleAuth ?? false}
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = '/api/auth/signin/google';
                    }}
                  >
                    Connect
                  </Button>
                }
              />
              <ConnectionRow
                label="Google Drive"
                description="Import files from Drive and search Drive for sources."
                enabled={false}
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      toast.push({
                        tone: 'info',
                        title: 'Configure in .env.local',
                        description:
                          'Set FREELM_GOOGLE_DRIVE_CLIENT_ID and FREELM_GOOGLE_DRIVE_CLIENT_SECRET, then restart the server.',
                      });
                    }}
                  >
                    Configure
                  </Button>
                }
              />
              <ConnectionRow
                label="Web search"
                description="Fast Research and Deep Research. Works keyless out of the box."
                enabled
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      toast.push({
                        tone: 'info',
                        title: 'Optional upgrade',
                        description:
                          'Set BRAVE_API_KEY or TAVILY_API_KEY for faster, higher quality results.',
                      });
                    }}
                  >
                    Upgrade
                  </Button>
                }
              />
            </ul>
          </section>

          {/* Data */}
          <section className="rounded-panel border border-hairline bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-neutral-50">Data</h2>
            <p className="mt-1 text-[12.5px] text-neutral-500">
              Your data stays on your own machine. FreeLM never trains on what
              you upload.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                icon="download"
                onClick={() => {
                  window.location.href = '/api/notebooks?scope=all';
                }}
              >
                Export notebooks
              </Button>
            </div>
          </section>

          {/* About */}
          <section className="rounded-panel border border-hairline bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-neutral-50">About</h2>
            <p className="mt-1 text-[12.5px] leading-6 text-neutral-500">
              FreeLM is an open-source, unrestricted clone of Google&apos;s
              Gemini Notebook (formerly NotebookLM). Every feature is
              available to every user — there are no premium tiers, no
              paywalls and no locked tools.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function ConnectionRow({
  label,
  description,
  enabled,
  action,
}: {
  label: string;
  description: string;
  enabled: boolean;
  action: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-neutral-100">{label}</p>
        <p className="mt-0.5 text-[12px] text-neutral-500">{description}</p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-pill border px-2 py-0.5 text-[11px]',
          enabled
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-hairline text-neutral-500',
        )}
      >
        {enabled ? 'Connected' : 'Not set'}
      </span>
      {action}
    </li>
  );
}
