import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { HttpError, Router, readBody, sendJson, type Ctx } from './lib/http.js';
import { loadUser } from './lib/auth.js';
import { publicRoutes } from './routes/public.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { paymentRoutes } from './routes/payments.js';
import { metaFor, renderHead } from './seo.js';
import type { AppDeps } from './routes/context.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(res: ServerResponse, secure: boolean) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function createApp(deps: AppDeps) {
  const router = new Router();
  publicRoutes(router, deps);
  accountRoutes(router, deps);
  adminRoutes(router, deps);
  paymentRoutes(router, deps);

  let indexTemplate: string | null = null;
  const loadIndex = () => {
    const file = path.join(deps.env.clientDist, 'index.html');
    if (!existsSync(file)) return null;
    if (!indexTemplate || !deps.env.isProduction) indexTemplate = readFileSync(file, 'utf8');
    return indexTemplate;
  };

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
    const ctx: Ctx = {
      req, res, url, params: {}, query: url.searchParams, body: undefined, rawBody: null, user: null, sessionTokenHash: null,
      ip: (deps.env.trustProxy && typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]!.trim() : req.socket.remoteAddress) ?? 'unknown',
    };
    try {
      const method = req.method ?? 'GET';
      const match = router.match(method, url.pathname);
      if (match === null) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
      if (match === 'method') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      ctx.params = match.params;

      if (method !== 'GET') {
        if (!match.route.raw) {
          // CSRF defence: a custom header can't be set cross-site without a CORS preflight, which we never grant.
          if (req.headers['x-aurelia-client'] !== 'web') throw new HttpError(403, 'CSRF', 'Request blocked.');
          const origin = req.headers.origin;
          if (origin && origin !== deps.env.appOrigin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
            throw new HttpError(403, 'CSRF', 'Request blocked.');
          }
        }
        const raw = await readBody(req);
        ctx.rawBody = raw;
        if (!match.route.raw && raw.length) {
          if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA', 'Expected JSON.');
          try { ctx.body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'BAD_JSON', 'Malformed JSON body.'); }
        }
      }

      loadUser(deps.db, ctx);
      const data = await match.route.handler(ctx);
      sendJson(res, res.statusCode || 200, data ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 429 && err.extra?.retryAfter) res.setHeader('Retry-After', String(err.extra.retryAfter));
        sendJson(res, err.status, { error: { code: err.code, message: err.message, fields: err.fields, ...err.extra } });
      } else {
        // Never leak internals to the client.
        console.error('[api] unhandled error', err);
        sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
      }
    }
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
    const root = deps.env.clientDist;
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { pathname = '/'; }
    const file = path.normalize(path.join(root, pathname));
    if (file.startsWith(root + path.sep) && existsSync(file) && statSync(file).isFile()) {
      const ext = path.extname(file);
      const immutable = pathname.startsWith('/assets/') || pathname.startsWith('/images/');
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': immutable && deps.env.isProduction ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
      return;
    }
    if (path.extname(pathname)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const index = loadIndex();
    if (!index) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Client bundle not built. Run `npm run build:client` (or `npm run dev`).');
      return;
    }
    const html = index.replace('<!--SEO_HEAD-->', renderHead(metaFor(url.pathname, deps.db, deps.env), url.pathname, deps.env));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  }

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    securityHeaders(res, deps.env.cookieSecure);
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, url);
  };
}
