#!/usr/bin/env node
/**
 * Image pipeline for Aurelia Hotels.
 *
 * Reads the user-supplied photographs in assets/source/, removes visible
 * real-world business signage (so fictional demo hotels are never shown
 * under a real hotel's name), and writes responsive WebP variants plus one
 * JPEG (used for Open Graph previews) to client/public/images/.
 *
 * Usage: npm run images
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'assets/source');
const outDir = path.join(root, 'client/public/images');
const WIDTHS = [480, 800, 1080];

/** source file -> output basename, category, optional signage redaction boxes (in source pixels) */
export const MANIFEST = [
  { src: '48905.jpg', name: 'winelands-estate-exterior', category: 'exterior' },
  { src: '48908.jpg', name: 'suite-turquoise-bedroom', category: 'suite' },
  { src: '48911.jpg', name: 'lucerne-cliff-infinity-pool', category: 'pool' },
  { src: '48914.jpg', name: 'restaurant-ornate-dining-room', category: 'restaurant' },
  { src: '48917.jpg', name: 'room-valley-view-king', category: 'room' },
  {
    src: '48920.jpg', name: 'dolomites-lodge-exterior', category: 'exterior',
    redact: [{ left: 505, top: 455, width: 160, height: 75 }, { left: 800, top: 385, width: 125, height: 70 }],
  },
  { src: '48923.jpg', name: 'tyrol-infinity-pool-cabana', category: 'pool' },
  { src: '48926.jpg', name: 'restaurant-classic-dining-room', category: 'restaurant' },
  { src: '48929.jpg', name: 'room-loft-grey-headboard', category: 'room' },
  { src: '48932.jpg', name: 'room-garden-glasshouse', category: 'room' },
  {
    src: '48935.jpg', name: 'aosta-chalet-exterior', category: 'exterior',
    redact: [{ left: 370, top: 548, width: 250, height: 50 }],
  },
  { src: '48938.jpg', name: 'kyushu-terrace-infinity-pool', category: 'pool' },
];

async function redactedBuffer(file, boxes = []) {
  let img = sharp(file);
  if (!boxes.length) return img.toBuffer();
  const meta = await img.metadata();
  const overlays = [];
  const PAD = 24; // feathered margin so the redaction blends into the photo
  for (const b of boxes) {
    const left = Math.max(0, b.left - PAD), top = Math.max(0, b.top - PAD);
    const width = Math.min(b.width + PAD * 2, meta.width - left);
    const height = Math.min(b.height + PAD * 2, meta.height - top);
    const blurred = await sharp(file).extract({ left, top, width, height }).blur(16).raw().ensureAlpha().toBuffer();
    // Soft-edged alpha mask: opaque in the middle, fading to transparent at the padding.
    const mask = await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><filter id="f"><feGaussianBlur stdDeviation="${PAD / 2.5}"/></filter>` +
      `<rect x="${PAD * 0.6}" y="${PAD * 0.6}" width="${width - PAD * 1.2}" height="${height - PAD * 1.2}" fill="white" filter="url(#f)"/></svg>`,
    )).resize(width, height).ensureAlpha().extractChannel(3).raw().toBuffer();
    for (let i = 0; i < width * height; i++) blurred[i * 4 + 3] = mask[i];
    const patch = await sharp(blurred, { raw: { width, height, channels: 4 } }).png().toBuffer();
    overlays.push({ input: patch, left, top });
  }
  return img.composite(overlays).toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const report = [];
  for (const item of MANIFEST) {
    const file = path.join(srcDir, item.src);
    if (!existsSync(file)) {
      report.push({ ...item, status: 'missing' });
      console.warn(`! missing ${item.src} — the UI will show its placeholder fallback`);
      continue;
    }
    const base = await redactedBuffer(file, item.redact);
    const meta = await sharp(base).metadata();
    const outputs = [];
    for (const w of WIDTHS) {
      const width = Math.min(w, meta.width);
      const out = path.join(outDir, `${item.name}-${w}.webp`);
      await sharp(base).resize({ width }).webp({ quality: w === 480 ? 72 : 78 }).toFile(out);
      outputs.push(path.basename(out));
    }
    const og = path.join(outDir, `${item.name}.jpg`);
    await sharp(base).resize({ width: 1080 }).jpeg({ quality: 80, mozjpeg: true }).toFile(og);
    outputs.push(path.basename(og));
    report.push({ ...item, status: 'ok', width: meta.width, height: meta.height, outputs });
    console.log(`✓ ${item.name} (${meta.width}×${meta.height})${item.redact ? ' — signage blurred' : ''}`);
  }
  await writeFile(path.join(root, 'assets/image-manifest.json'), JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
