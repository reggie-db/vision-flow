#!/usr/bin/env bun
/**
 * Bundles flow.tsx (React Flow) to flow.js/flow.css, then renders the deck to
 * slides/NN.png and vision-flow.pdf with headless Chrome (final animation state).
 *
 *   cd docs/research/deck && bun install && bun build.ts
 */
import { $ } from 'bun';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const html = `file://${join(ROOT, 'index.html')}`;
const slideCount = ((await Bun.file(join(ROOT, 'index.html')).text()).match(/<section class="slide/g) ?? []).length;
const flags = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=6000'];

const bundle = await Bun.build({
  entrypoints: [join(ROOT, 'flow.tsx')],
  outdir: ROOT,
  naming: 'flow.[ext]',
  minify: true,
  target: 'browser',
  format: 'iife', // classic script: file:// pages can't load ES modules
  // zustand (inside React Flow) reads import.meta.env, which a classic script can't use.
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env': JSON.stringify({ MODE: 'production' }) },
});
if (!bundle.success) throw new AggregateError(bundle.logs, 'flow.tsx bundle failed');

await mkdir(join(ROOT, 'slides'), { recursive: true });
for (let n = 1; n <= slideCount; n++) {
  const png = join(ROOT, 'slides', `${String(n).padStart(2, '0')}.png`);
  await $`${CHROME} ${flags} --force-device-scale-factor=1 --window-size=1920,1080 --screenshot=${png} ${`${html}?slide=${n}&print`}`.quiet();
}
await $`${CHROME} ${flags} --no-pdf-header-footer --print-to-pdf=${join(ROOT, 'vision-flow.pdf')} ${`${html}?print`}`.quiet();
console.log(`rendered ${slideCount} slides and vision-flow.pdf`);
