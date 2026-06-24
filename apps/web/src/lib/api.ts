const BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'http' | 'parse',
    public readonly status?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function friendlyMessage(kind: ApiError['kind'], status?: number): string {
  if (kind === 'network') return "Can't reach NeuroFeed right now. Check your connection and try again.";
  if (kind === 'parse') return 'Got an unexpected response from the server. Please try again.';
  if (status === 401 || status === 403) return 'You need to be signed in to load this.';
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status && status >= 500) return 'The server hit a snag. Please try again in a moment.';
  return 'Something went wrong loading this. Please try again.';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch (e) {
    // Browser fetch throws TypeError("Failed to fetch") on DNS, CORS, offline,
    // or server-down — every one of these should look the same to the UI.
    throw new ApiError(friendlyMessage('network'), 'network', undefined, url);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(
      text && text.length < 200 ? text : friendlyMessage('http', res.status),
      'http',
      res.status,
      url,
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(friendlyMessage('parse'), 'parse', res.status, url);
  }
}

/** Pretty user-facing message for any error returned by `api()` (or
 * thrown anywhere else). Never returns the raw "Failed to fetch" string. */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  if (/cannot (?:follow|friend|challenge) yourself/i.test(raw)) {
    return "Looks like you're targeting your own account — both browsers seem signed in as the same user. Open an incognito window and sign in as a different account.";
  }
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
      return friendlyMessage('network');
    }
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}
