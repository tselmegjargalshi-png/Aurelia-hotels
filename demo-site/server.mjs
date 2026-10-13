import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(root, p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Cache-Control': extname(f) === '.html' ? 'no-cache' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.end(b);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(process.env.PORT || 3000, '0.0.0.0');
