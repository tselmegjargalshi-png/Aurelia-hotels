#!/usr/bin/env node
/**
 * Browser-only demo build.
 *
 * Bundles the same React client with __DEMO__ = true, so every /api call is answered by
 * client/src/demo/mockApi.ts inside the page instead of the Node server. Output (demo-dist/):
 *
 *   page.html   the page as a fragment (no <html>/<head>/<body>), CSS and JS inlined. This is what is published.
 *   index.html  the same fragment wrapped in a full document, for opening locally.
 *   images/     the 480/800/1080 WebP renditions the page references.
 *
 *   node scripts/build-demo.mjs
 *
 * This is a demonstration of the interface and booking logic. Data lives in one browser;
 * it is not a reservation system. Use the Node server for the real (persistent) application.
 */
import * as esbuild from 'esbuild';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'demo-dist');

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'images'), { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, 'client/src/main.tsx')],
  bundle: true, write: false, outdir: path.join(out, '_tmp'), format: 'iife',
  target: ['es2022', 'chrome110', 'firefox110', 'safari16'], jsx: 'automatic', minify: true, legalComments: 'none',
  define: { __DEMO__: 'true', 'process.env.NODE_ENV': '"production"' }, logLevel: 'info',
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;

const fonts = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Manrope:wght@400;500;600;700&display=swap';
const fragment = `<title>Aurelia Hotels</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>
${css}
</style>
<div id="root"></div>
<noscript><p style="padding:2rem;font-family:Georgia,serif">Aurelia Hotels needs JavaScript. It is a fictional demonstration brand.</p></noscript>
<script>
${js}
</script>
`;
await writeFile(path.join(out, 'page.html'), fragment);
await writeFile(path.join(out, 'index.html'),
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${fragment}</body></html>\n`);

const imgDir = path.join(root, 'client/public/images');
let copied = 0;
for (const f of await readdir(imgDir)) {
  if (!/-(480|800|1080)\.webp$/.test(f)) continue;
  await cp(path.join(imgDir, f), path.join(out, 'images', f)); copied++;
}
console.log(`demo-dist/page.html ${(Buffer.byteLength(fragment) / 1024).toFixed(0)} kB, ${copied} images`);
