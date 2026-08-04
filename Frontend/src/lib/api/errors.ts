/**
 * The API's error envelope, mirrored on the client.
 *
 * The backend returns `{ code, message, details? }` for every expected
 * failure, with `message` already written in the product voice. The UI shows
 * that message verbatim rather than inventing its own copy — otherwise the
 * careful wording in the API ("You have 8 guests booked, so you cannot drop to
 * 6 seats…") gets replaced by "Request failed".
 */

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: {
    fields?: FieldError[];
    [key: string]: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.fields = payload.details?.fields ?? [];
  }

  /** The message is host-facing copy, safe to render as-is. */
  get displayMessage(): string {
    return this.message;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** Retrying will not help; the host has to change something. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  /** Field-level message for attaching to a specific input. */
  fieldError(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.message;
  }
}

/** Raised when the network failed, as distinct from the API refusing. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("We couldn't reach the studio. Check your connection and try again.");
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Please sign in to continue.',
  403: "You don't have access to that.",
  404: "We couldn't find that.",
  429: "That's a lot of requests — give it a moment.",
  500: 'Something went wrong on our side. Try again in a moment.',
  503: 'The studio is briefly unavailable. Try again shortly.',
};

/**
 * Build an ApiError from a response whose body may not be our envelope —
 * a proxy timeout or gateway error will return HTML, not JSON.
 */
export function fallbackError(status: number, raw?: unknown): ApiError {
  if (isApiErrorPayload(raw)) {
    return new ApiError(status, raw);
  }

  return new ApiError(status, {
    code: 'unexpected_error',
    message: FALLBACK_MESSAGES[status] ?? 'Something went wrong. Try again in a moment.',
  });
}

export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
