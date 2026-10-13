import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodTypeAny, infer as ZodInfer } from 'zod';

/** Minimal routing/HTTP toolkit built on node:http (no framework dependency). */

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  /** Parsed JSON body (only for requests with a body). */
  body: unknown;
  rawBody: Buffer | null;
  /** Populated by the auth layer. */
  user: import('../../../shared/types.js').PublicUser | null;
  sessionTokenHash: string | null;
}

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Route { method: Method; pattern: RegExp; keys: string[]; handler: Handler; raw: boolean }

export class Router {
  private routes: Route[] = [];

  add(method: Method, path: string, handler: Handler, opts: { raw?: boolean } = {}) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' + path.replace(/\/:([a-zA-Z]+)/g, (_, k: string) => { keys.push(k); return '/([^/]+)'; }) + '/?$',
    );
    this.routes.push({ method, pattern, keys, handler, raw: !!opts.raw });
  }
  get(p: string, h: Handler) { this.add('GET', p, h); }
  post(p: string, h: Handler, o?: { raw?: boolean }) { this.add('POST', p, h, o); }
  put(p: string, h: Handler) { this.add('PUT', p, h); }
  patch(p: string, h: Handler) { this.add('PATCH', p, h); }
  delete(p: string, h: Handler) { this.add('DELETE', p, h); }

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]!); });
      return { route, params };
    }
    return pathMatched ? 'method' : null;
  }
}

const MAX_BODY = 100 * 1024;

export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

/** Validate input with zod and convert issues to a field → message map. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): ZodInfer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, 'VALIDATION_ERROR', 'Some details need attention.', fields);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return out;
}

export function serializeCookie(name: string, value: string, opts: { maxAge?: number; secure: boolean }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}
