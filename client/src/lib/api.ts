import { demoFetch } from '../demo/mockApi.js';

/**
 * Thin fetch wrapper. All mutations carry the CSRF header the server requires.
 * In the browser-only demo build (__DEMO__) requests are answered by the in-browser demo API instead.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let ok: boolean;
  let status: number;
  let json: unknown = null;
  if (__DEMO__) {
    const r = await demoFetch(method, path, body);
    ok = r.status >= 200 && r.status < 300; status = r.status; json = r.json;
  } else {
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(method !== 'GET' ? { 'X-Aurelia-Client': 'web' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'We couldn’t reach the server. Check your connection and try again.');
    }
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    ok = res.ok; status = res.status;
  }
  if (!ok) {
    const err = (json as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    throw new ApiError(status, err?.code ?? 'HTTP_' + status, err?.message ?? 'Something went wrong. Please try again.', err?.fields ?? {}, (err ?? {}) as Record<string, unknown>);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
