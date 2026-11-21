export class ApiError extends Error {
  /** API error code (`session_required`, `quota_exceeded`, …) or a client code: `network`, `timeout`, `bad_response`. */
  readonly code: string;
  /** HTTP status, or 0 when no response arrived. */
  readonly status: number;
  /** Seconds from the `Retry-After` header on 429, when the browser can read it. */
  readonly retryAfter: number | null;
  /** Invalid field names on 422 `validation_error`. */
  readonly fields: string[];

  constructor(
    code: string,
    message: string,
    opts: { status?: number; retryAfter?: number | null; fields?: string[]; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = opts.status ?? 0;
    this.retryAfter = opts.retryAfter ?? null;
    this.fields = opts.fields ?? [];
  }
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}
