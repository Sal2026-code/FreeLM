/**
 * FreeLM — automatic provider failover.
 *
 * With `FREELM_AI_PROVIDER=auto` FreeLM tries the providers it has keys for,
 * in order, and moves to the next one when a call fails. That matters in
 * practice: a key can be present while the API behind it is not enabled for
 * the project, and the app should keep working rather than failing every
 * request.
 */

import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  TTSOptions,
} from './provider';

export class FallbackProvider implements AiProvider {
  private index = 0;

  constructor(private readonly providers: AiProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackProvider needs at least one provider.');
    }
  }

  get info(): ProviderInfo {
    return this.providers[this.index]?.info ?? this.providers[0]!.info;
  }

  /** The providers this wrapper can fall back to. */
  get candidates(): AiProvider[] {
    return this.providers;
  }

  private advance(): void {
    if (this.index < this.providers.length - 1) {
      this.index += 1;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.providers.length; attempt += 1) {
      const provider = this.providers[this.index]!;
      try {
        return await provider.chat(messages, options);
      } catch (error) {
        lastError = error;
        // Only fall over to another provider when there is one.
        if (this.index < this.providers.length - 1) {
          this.advance();
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async embed(texts: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.providers.length; attempt += 1) {
      const provider = this.providers[this.index]!;
      try {
        return await provider.embed(texts);
      } catch (error) {
        lastError = error;
        if (this.index < this.providers.length - 1) {
          this.advance();
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async tts(text: string, options: TTSOptions): Promise<Buffer> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.providers.length; attempt += 1) {
      const provider = this.providers[this.index]!;
      try {
        return await provider.tts(text, options);
      } catch (error) {
        lastError = error;
        if (this.index < this.providers.length - 1) {
          this.advance();
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }
}
