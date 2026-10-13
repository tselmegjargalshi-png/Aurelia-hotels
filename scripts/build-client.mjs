#!/usr/bin/env node
/**
 * Client build (esbuild). Bundles client/src → client/dist/assets and copies
 * client/public. Vite was the preferred tool, but it could not be installed in
 * the offline build environment; esbuild gives the same ESM/TSX/CSS bundling.
 *
 *   node scripts/build-client.mjs          production build
 *   node scripts/build-client.mjs --watch  rebuild on change (used by npm run dev)
 */
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'client/dist');
const watch = process.argv.includes('--watch');

async function writeIndex() {
  const html = await readFile(path.join(root, 'client/index.html'), 'utf8');
  await writeFile(path.join(dist, 'index.html'), html.replaceAll('__BUILD__', Date.now().toString(36)));
}

const options = {
  entryPoints: { main: path.join(root, 'client/src/main.tsx') },
  bundle: true,
  outdir: path.join(dist, 'assets'),
  format: 'esm',
  target: ['es2022', 'chrome110', 'firefox110', 'safari16'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: true,
  legalComments: 'none',
  define: { __DEMO__: 'false', 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
  plugins: [{
    name: 'index-html',
    setup(build) { build.onEnd(async (r) => { if (!r.errors.length) await writeIndex(); }); },
  }],
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'client/public'), dist, { recursive: true });

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[client] watching for changes…');
} else {
  const result = await esbuild.build({ ...options, metafile: true });
  const out = Object.entries(result.metafile.outputs).filter(([f]) => !f.endsWith('.map'))
    .map(([f, o]) => `${path.relative(root, f)}  ${(o.bytes / 1024).toFixed(1)} kB`);
  console.log(out.join('\n'));
}
