import { ApiError, NetworkError, fallbackError } from './errors';

/**
 * Typed fetch wrapper for the Maison Abeer API.
 *
 * Deliberately small: it attaches the bearer token, normalises errors into
 * `ApiError`, and does nothing else. Caching and retries belong to TanStack
 * Query, which already handles them properly.
 */

export type TokenProvider = () => string | null | Promise<string | null>;

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: TokenProvider;
  /** Fires on 401 so the app can send the host back to sign in. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  /** Aborts a request that hangs, so the UI never spins forever. */
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | null | undefined>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: TokenProvider | undefined;
  private readonly onUnauthorized: (() => void) | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getToken = options.getToken;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      // Omit rather than sending "undefined" as a literal string.
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const token = await this.getToken?.();

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    // Compose the caller's signal with our timeout so either can abort.
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let response: Response;

    try {
      response = await this.fetchImpl(this.buildUrl(path, options?.query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        // Never let a shared cache hold guest contact or allergy data.
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (cause) {
      // A caller-initiated abort is not an error worth surfacing.
      if (options?.signal?.aborted) throw cause;
      throw new NetworkError(cause);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await this.readBody(response);

    if (!response.ok) {
      const error = fallbackError(response.status, payload);
      if (error.isAuthError) this.onUnauthorized?.();
      throw error;
    }

    return payload as T;
  }

  private async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      // A gateway timeout returns HTML; don't try to parse it as our envelope.
      return undefined;
    }

    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}

export { ApiError, NetworkError };
