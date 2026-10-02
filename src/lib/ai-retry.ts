const MAX_RETRIES = 2;
const BACKOFF_MS = [200, 400] as const;

export class AiProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, retryable: boolean, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiProviderError";
    this.retryable = retryable;
    this.status = status;
  }
}

export function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 425 || status >= 500;
}

export function parseModelJson(text: string, message: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new SyntaxError(message, { cause });
  }
}

function isRetryableFailure(error: unknown): boolean {
  if (error instanceof AiProviderError) return error.retryable;
  if (error instanceof SyntaxError) return true;
  return error instanceof Error && error.name === "ZodError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withAiRetries<T>(
  timeoutMs: number,
  operation: (attemptTimeoutMs: number) => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    const error = new Error("AI request timed out");
    error.name = "AbortError";
    throw error;
  }

  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const remainingMs = deadline - Date.now();
    const reservedBackoffMs = BACKOFF_MS.slice(attempt).reduce((sum, ms) => sum + ms, 0);
    const attemptTimeoutMs = Math.floor(
      (remainingMs - reservedBackoffMs) / (MAX_RETRIES + 1 - attempt),
    );
    if (attemptTimeoutMs <= 0) break;

    try {
      return await operation(attemptTimeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isRetryableFailure(error)) throw error;

      const delayMs = BACKOFF_MS[attempt];
      if (deadline - Date.now() <= delayMs) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[lume-ai] attempt ${attempt + 1}/${MAX_RETRIES + 1} failed; retrying in ${delayMs}ms: ${reason}`,
      );
      await sleep(delayMs);
    }
  }

  if (lastError !== undefined) throw lastError;
  const error = new Error("AI request timed out");
  error.name = "AbortError";
  throw error;
}
