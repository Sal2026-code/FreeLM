/**
 * FreeLM — upstream error handling.
 *
 * Every call to an AI provider can fail for reasons the user cannot fix
 * themselves (no credits, rate limits, network problems, safety filters).
 * These errors are surfaced as a dismissible banner in the UI with a plain
 * English explanation and a Retry action, rather than as a blank panel.
 */

export type UpstreamErrorCode =
  | 'NO_PROVIDER'
  | 'INSUFFICIENT_FUNDS'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'SAFETY_BLOCKED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'BAD_RESPONSE'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

export class UpstreamError extends Error {
  readonly code: UpstreamErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly provider: string;
  readonly details: unknown;

  constructor(params: {
    code: UpstreamErrorCode;
    message: string;
    status?: number;
    retryable?: boolean;
    provider: string;
    details?: unknown;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'UpstreamError';
    this.code = params.code;
    this.status = params.status ?? 502;
    this.retryable = params.retryable ?? true;
    this.provider = params.provider;
    this.details = params.details;
    if (params.cause !== undefined) {
      (this as { cause?: unknown }).cause = params.cause;
    }
  }

  /** A short, human sentence for the error banner. */
  get userMessage(): string {
    switch (this.code) {
      case 'NO_PROVIDER':
        return 'No AI provider is configured. Add an API key to .env.local to enable answers.';
      case 'INSUFFICIENT_FUNDS':
        return 'Your AI provider rejected the request because the account has insufficient funds. Top up the provider account or switch to a different provider in Settings.';
      case 'RATE_LIMITED':
        return 'The AI provider is rate limiting requests right now. Wait a moment and try again.';
      case 'AUTH_FAILED':
        return 'The AI provider rejected the API key. Check the key in .env.local.';
      case 'SAFETY_BLOCKED':
        return 'This request was blocked by the provider safety filter. Try rephrasing it.';
      case 'NETWORK':
        return 'Could not reach the AI provider. Check your connection and try again.';
      case 'TIMEOUT':
        return 'The AI provider took too long to respond. Try again.';
      case 'MODEL_UNAVAILABLE':
        return 'The configured model is not available for this key. Pick another model in Settings.';
      case 'BAD_RESPONSE':
        return 'The AI provider returned a response FreeLM could not read. Try again.';
      default:
        return this.message;
    }
  }

  toJSON() {
    return {
      error: this.userMessage,
      code: this.code,
      details: this.details ?? { provider: this.provider, status: this.status },
    };
  }
}

/**
 * Pull the human-readable message out of a provider error payload.
 *
 * Handles the common shapes: `{ error: { message } }`, `{ error: "text" }`
 * and `{ message }`.
 */
export function extractProviderMessage(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    /* not JSON — use the raw text */
  }
  return body.slice(0, 300).trim();
}

/**
 * Map a provider HTTP response onto an `UpstreamError`.
 *
 * The message sniffing below is deliberately generous: every major provider
 * words "out of credit" differently and we want the banner to say the
 * useful thing regardless.
 */
export async function toUpstreamError(
  response: Response,
  provider: string,
  fallbackBody = '',
): Promise<UpstreamError> {
  let body = fallbackBody;
  try {
    body = await response.text();
  } catch {
    /* body already consumed or unreadable */
  }

  const haystack = body.toLowerCase();
  const code = response.status;

  // Some providers answer 200 with an error payload (rate limits, credit
  // problems and empty completions all look like this). Surface the real
  // message rather than a bare status code.
  if (code >= 200 && code < 300) {
    const message = extractProviderMessage(body);
    const lower = message.toLowerCase();
    if (
      lower.includes('insufficient') ||
      lower.includes('credit') ||
      lower.includes('billing') ||
      lower.includes('quota')
    ) {
      return new UpstreamError({
        code: 'INSUFFICIENT_FUNDS',
        message: message || 'Provider reported insufficient funds.',
        status: 402,
        provider,
      });
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return new UpstreamError({
        code: 'RATE_LIMITED',
        message: message || 'Provider rate limit reached.',
        status: 429,
        provider,
      });
    }
    return new UpstreamError({
      code: 'BAD_RESPONSE',
      message: message || 'The provider returned an error response.',
      status: 502,
      provider,
    });
  }

  if (code === 401 || code === 403) {
    const isPermission =
      haystack.includes('insufficient') || haystack.includes('quota');
    return new UpstreamError({
      code: isPermission ? 'INSUFFICIENT_FUNDS' : 'AUTH_FAILED',
      message: `Provider returned ${code}.`,
      status: code,
      provider,
    });
  }

  if (code === 402 || haystack.includes('insufficient funds') || haystack.includes('insufficient_quota') || haystack.includes('billing')) {
    return new UpstreamError({
      code: 'INSUFFICIENT_FUNDS',
      message: 'Provider reported insufficient funds.',
      status: code || 402,
      provider,
    });
  }

  if (code === 429) {
    return new UpstreamError({
      code: 'RATE_LIMITED',
      message: 'Provider rate limit reached.',
      status: 429,
      provider,
    });
  }

  if (code === 404) {
    return new UpstreamError({
      code: 'MODEL_UNAVAILABLE',
      message: 'Provider does not know this model.',
      status: 404,
      provider,
    });
  }

  if (code === 400 && (haystack.includes('safety') || haystack.includes('blocked'))) {
    return new UpstreamError({
      code: 'SAFETY_BLOCKED',
      message: 'Provider safety filter blocked the request.',
      status: 400,
      provider,
    });
  }

  if (code >= 500) {
    return new UpstreamError({
      code: 'UNKNOWN',
      message: `Provider error ${code}.`,
      status: code,
      provider,
    });
  }

  return new UpstreamError({
    code: 'UNKNOWN',
    message: `Provider error ${code}.`,
    status: code,
    provider,
  });
}

/** Wrap a network-level failure (DNS, TLS, socket) into an UpstreamError. */
export function networkError(provider: string, cause: unknown): UpstreamError {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.toLowerCase().includes('abort')) {
    return new UpstreamError({
      code: 'TIMEOUT',
      message: 'Request aborted.',
      status: 504,
      provider,
      cause,
    });
  }
  return new UpstreamError({
    code: 'NETWORK',
    message: `Could not reach ${provider}: ${message}`,
    status: 502,
    provider,
    cause,
  });
}
