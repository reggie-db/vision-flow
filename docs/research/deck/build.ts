#!/usr/bin/env bun
/**
 * Bundles the shared Info deck (packages/app/client/src/info) into dist/ and renders
 * slides/NN.png and vision-flow.pdf with headless Chrome.
 *
 *   bun docs/research/deck/build.ts
 */
import { $ } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { slides } from "../../../packages/app/client/src/info/InfoDeck.tsx";

const ROOT = import.meta.dir;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const html = `file://${join(ROOT, "index.html")}`;
const flags = [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--virtual-time-budget=6000",
];

await rm(join(ROOT, "dist"), { recursive: true, force: true });
const bundle = await Bun.build({
  entrypoints: [join(ROOT, "entry.tsx")],
  outdir: join(ROOT, "dist"),
  naming: "deck.[ext]",
  minify: true,
  target: "browser",
  format: "iife", // classic script: file:// pages can't load ES modules
  // zustand (inside React Flow) reads import.meta.env, which a classic script can't use.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env": JSON.stringify({ MODE: "production" }),
  },
});
if (!bundle.success) throw new AggregateError(bundle.logs, "deck bundle failed");

await rm(join(ROOT, "slides"), { recursive: true, force: true });
await mkdir(join(ROOT, "slides"));
for (let n = 1; n <= slides.length; n++) {
  const png = join(ROOT, "slides", `${String(n).padStart(2, "0")}.png`);
  await $`${CHROME} ${flags} --force-device-scale-factor=1 --window-size=1920,1080 --screenshot=${png} ${`${html}?slide=${n}&still`}`.quiet();
}
await $`${CHROME} ${flags} --no-pdf-header-footer --print-to-pdf=${join(ROOT, "vision-flow.pdf")} ${`${html}?print`}`.quiet();
console.log(`bundled dist/deck.js and rendered ${slides.length} slides and vision-flow.pdf`);
