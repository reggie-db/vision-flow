#!/usr/bin/env bun
/**
 * Builds the Vision Flow concept boards.
 *
 * Package 01 (Field Lines) was adopted as the brand: its board is written to
 * docs/branding and uses the live app assets in packages/app/client/public/brand.
 * Packages 02 and 03 stay here as research.
 *
 *   bun docs/branding-research/claude-v2/build.ts            # HTML + PNG
 *   bun docs/branding-research/claude-v2/build.ts --html     # HTML only
 */
import { $ } from 'bun';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = import.meta.dir;
const REPO = resolve(ROOT, '../../..');
const BRAND_ASSETS = join(REPO, 'packages/app/client/public');
const ADOPTED: Record<string, { out: string; files: Record<string, string> }> = {
  '01-field-lines': {
    out: join(REPO, 'docs/branding'),
    files: {
      'mark.svg': join(BRAND_ASSETS, 'brand/icon-light.svg'),
      'mark-reversed.svg': join(BRAND_ASSETS, 'brand/icon-dark.svg'),
      'mark-mono.svg': join(BRAND_ASSETS, 'brand/icon-mono.svg'),
      'favicon.svg': join(BRAND_ASSETS, 'favicon.svg'),
    },
  },
};
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1600;

type Field = { name: string; value: string; confidence: number };
type UseCase = { key: 'receipt' | 'shelf' | 'id'; title: string; schema: string; line: string; fields: Field[] };

const USE_CASES: UseCase[] = [
  {
    key: 'receipt',
    title: 'Lottery receipt scanning',
    schema: 'lottery_sales',
    line: 'Terminal receipts become sales rows by jurisdiction and draw.',
    fields: [
      { name: 'jurisdiction', value: 'TX', confidence: 0.99 },
      { name: 'quantity_sold', value: '5', confidence: 0.97 },
      { name: 'price', value: '$10.00', confidence: 0.98 },
      { name: 'transaction_date', value: '2026-11-14', confidence: 0.95 },
      { name: 'terminal_id', value: 'T-40418', confidence: 0.91 },
    ],
  },
  {
    key: 'shelf',
    title: 'Store layout auditing',
    schema: 'endcap_audit',
    line: 'Shelf photos become compliance findings against the planogram.',
    fields: [
      { name: 'endcap_id', value: 'A-3', confidence: 0.96 },
      { name: 'facings_expected', value: '12', confidence: 0.99 },
      { name: 'facings_found', value: '11', confidence: 0.88 },
      { name: 'price_sign_present', value: 'true', confidence: 0.93 },
      { name: 'out_of_stock', value: '["cola_12pk"]', confidence: 0.71 },
    ],
  },
  {
    key: 'id',
    title: 'ID verification',
    schema: 'drivers_license',
    line: 'Required ID fields are checked; uncertain scans go to review.',
    fields: [
      { name: 'document_type', value: 'driver_license', confidence: 0.99 },
      { name: 'issuing_state', value: 'CA', confidence: 0.98 },
      { name: 'holder_name', value: 'SAMPLE, ALEX', confidence: 0.94 },
      { name: 'expiration_date', value: '2030-05-02', confidence: 0.62 },
      { name: 'is_expired', value: 'false', confidence: 0.62 },
    ],
  },
];

type Swatch = { name: string; hex: string; use: string; dark?: boolean };
type Pkg = {
  dir: string;
  number: string;
  name: string;
  wordmark: string;
  descriptor: string;
  tagline: string;
  support: string;
  theme: 'light' | 'dark';
  css: Record<string, string>;
  swatches: Swatch[];
  voice: { say: string[]; avoid: string[] };
  tile: (u: UseCase) => string;
  ui: () => string;
};

// ---------- shared illustrations (simple, flat, 220x160 viewBox) ----------

function receiptArt(paper: string, ink: string, overlay = ''): string {
  return `<svg viewBox="0 0 220 160" class="art" aria-hidden="true">
    <rect x="66" y="8" width="88" height="148" rx="3" fill="${paper}"/>
    <path d="M66 150l8 6 8-6 8 6 8-6 8 6 8-6 8 6 8-6 8 6 8-6 8 6v-6H66z" fill="${paper}"/>
    <g fill="${ink}">
      <rect x="84" y="20" width="52" height="7" rx="2"/>
      <rect x="78" y="38" width="30" height="4" rx="2" opacity=".55"/><rect x="120" y="38" width="22" height="4" rx="2" opacity=".55"/>
      <rect x="78" y="50" width="40" height="4" rx="2" opacity=".55"/><rect x="128" y="50" width="14" height="4" rx="2" opacity=".55"/>
      <rect x="78" y="62" width="26" height="4" rx="2" opacity=".55"/><rect x="124" y="62" width="18" height="4" rx="2" opacity=".55"/>
      <rect x="78" y="80" width="64" height="2" opacity=".25"/>
      <rect x="78" y="90" width="22" height="6" rx="2"/><rect x="118" y="90" width="24" height="6" rx="2"/>
      <rect x="78" y="108" width="44" height="4" rx="2" opacity=".55"/>
      <g opacity=".8"><rect x="80" y="122" width="2" height="18"/><rect x="85" y="122" width="4" height="18"/><rect x="92" y="122" width="1.5" height="18"/><rect x="96" y="122" width="3" height="18"/><rect x="102" y="122" width="2" height="18"/><rect x="107" y="122" width="5" height="18"/><rect x="115" y="122" width="2" height="18"/><rect x="120" y="122" width="3" height="18"/><rect x="126" y="122" width="1.5" height="18"/><rect x="130" y="122" width="4" height="18"/><rect x="137" y="122" width="2" height="18"/></g>
    </g>${overlay}
  </svg>`;
}

function shelfArt(frame: string, ink: string, colors: string[], overlay = ''): string {
  const row = (y: number, gap: number) =>
    Array.from({ length: 6 }, (_, i) =>
      i === gap
        ? ''
        : `<rect x="${30 + i * 27}" y="${y}" width="22" height="30" rx="2" fill="${colors[i % colors.length]}"/>`,
    ).join('');
  return `<svg viewBox="0 0 220 160" class="art" aria-hidden="true">
    <rect x="20" y="8" width="180" height="148" rx="3" fill="${frame}"/>
    <rect x="76" y="14" width="68" height="12" rx="2" fill="${ink}" opacity=".85"/>
    ${row(36, -1)}<rect x="24" y="68" width="172" height="4" fill="${ink}" opacity=".35"/>
    ${row(78, 3)}<rect x="24" y="110" width="172" height="4" fill="${ink}" opacity=".35"/>
    ${row(120, -1)}<rect x="24" y="152" width="172" height="3" fill="${ink}" opacity=".35"/>
    ${overlay}
  </svg>`;
}

function idArt(card: string, ink: string, photo: string, overlay = ''): string {
  return `<svg viewBox="0 0 220 160" class="art" aria-hidden="true">
    <rect x="18" y="26" width="184" height="114" rx="10" fill="${card}"/>
    <rect x="18" y="26" width="184" height="22" rx="10" fill="${ink}" opacity=".9"/><rect x="18" y="38" width="184" height="10" fill="${ink}" opacity=".9"/>
    <rect x="30" y="32" width="54" height="8" rx="2" fill="${card}" opacity=".9"/>
    <rect x="30" y="58" width="50" height="62" rx="4" fill="${photo}"/>
    <circle cx="55" cy="80" r="11" fill="${ink}" opacity=".35"/><path d="M36 118c4-14 13-20 19-20s15 6 19 20z" fill="${ink}" opacity=".35"/>
    <g fill="${ink}">
      <rect x="94" y="60" width="26" height="3" rx="1.5" opacity=".45"/><rect x="94" y="67" width="78" height="6" rx="2"/>
      <rect x="94" y="82" width="26" height="3" rx="1.5" opacity=".45"/><rect x="94" y="89" width="46" height="6" rx="2"/>
      <rect x="150" y="82" width="26" height="3" rx="1.5" opacity=".45"/><rect x="150" y="89" width="40" height="6" rx="2"/>
      <rect x="94" y="104" width="26" height="3" rx="1.5" opacity=".45"/><rect x="94" y="111" width="54" height="6" rx="2"/>
    </g>${overlay}
  </svg>`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- package 01: Field Lines ----------

const fieldLines: Pkg = {
  dir: '01-field-lines',
  number: '01',
  name: 'Field Lines',
  wordmark: 'Vision Flow',
  descriptor: 'Structured data from any image',
  tagline: 'Every image is a form.',
  support:
    'Describe the fields once. Vision Flow writes the prompt, reads the image, and lands typed rows in Delta.',
  theme: 'light',
  css: {
    '--bg': '#F9F7F4',
    '--surface': '#FFFFFF',
    '--surface-2': '#EEEDE9',
    '--ink': '#1B3139',
    '--muted': '#5A6F77',
    '--line': '#DCDAD3',
    '--accent': '#FF3621',
    '--accent-ink': '#FFFFFF',
    '--ok': '#00875A',
    '--warn': '#8F5F00',
    '--dark': '#1B3139',
  },
  swatches: [
    { name: 'Lava', hex: '#FF3621', use: 'Mark, primary action, extracted field' },
    { name: 'Navy', hex: '#1B3139', use: 'Wordmark, text, camera chrome', dark: true },
    { name: 'Oat', hex: '#F9F7F4', use: 'Page background' },
    { name: 'Oat 2', hex: '#EEEDE9', use: 'Panels, image wells' },
    { name: 'Slate', hex: '#5A6F77', use: 'Secondary text', dark: true },
    { name: 'Green', hex: '#00875A', use: 'Stored / valid only', dark: true },
  ],
  voice: {
    say: ['Scan a receipt', 'Add a field', '5 fields extracted', 'Stored in vision_flow.scans'],
    avoid: ['Unlock insights', 'AI-powered magic', 'Revolutionize capture'],
  },
  tile: (u) => {
    const lava = '#FF3621';
    const pull = (y: number) =>
      `<path d="M150 ${y}H214" stroke="${lava}" stroke-width="3" stroke-linecap="round"/><circle cx="150" cy="${y}" r="4" fill="${lava}"/>`;
    const art =
      u.key === 'receipt'
        ? receiptArt('#FFFFFF', '#1B3139', `<rect x="76" y="86" width="68" height="14" rx="3" fill="none" stroke="${lava}" stroke-width="2.5"/>${pull(93)}`)
        : u.key === 'shelf'
          ? shelfArt('#FFFFFF', '#1B3139', ['#C9D3D6', '#8FA3AA', '#C9D3D6', '#8FA3AA'], `<rect x="107" y="76" width="26" height="34" rx="3" fill="none" stroke="${lava}" stroke-width="2.5" stroke-dasharray="5 4"/>`)
          : idArt('#FFFFFF', '#1B3139', '#C9D3D6', `<rect x="90" y="100" width="62" height="20" rx="3" fill="none" stroke="${lava}" stroke-width="2.5"/>${pull(110)}`);
    return `<article class="tile">
      <div class="well">${art}</div>
      <h3>${u.title}</h3><p class="muted">${u.line}</p>
      <dl class="kv">${u.fields
        .slice(0, 4)
        .map((f) => `<div><dt>${f.name}</dt><dd>${esc(f.value)}</dd></div>`)
        .join('')}</dl>
    </article>`;
  },
  ui: () => `<div class="ui ui-01">
    <div class="cam">
      <div class="cam-bar"><img src="mark-reversed.svg" alt="" class="m24"/><b>Vision Flow</b><span class="pill">lottery_sales</span><span class="sp"></span><span class="dot"></span></div>
      <div class="cam-view">${receiptArt('#FFFFFF', '#1B3139', '<g stroke="#FF3621" stroke-width="3" fill="none" stroke-linecap="round"><path d="M56 30V4h26"/><path d="M138 4h26v26"/><path d="M56 130v26h26"/><path d="M164 130v26h-26"/></g>')}</div>
      <div class="cam-foot"><span class="shutter"></span></div>
    </div>
    <div class="result">
      <div class="result-head"><b>Receipt 7F3A</b><span class="chip ok">Stored</span></div>
      <ol class="steps"><li class="done">Captured</li><li class="done">Matched</li><li class="done">Extracted</li><li class="done">Stored</li></ol>
      <dl class="kv big">${USE_CASES[0]!.fields.map((f) => `<div><dt>${f.name}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>
      <button class="btn">Scan another</button>
    </div>
  </div>`,
};

// ---------- package 02: Schema Aperture ----------

const schemaAperture: Pkg = {
  dir: '02-schema-aperture',
  number: '02',
  name: 'Schema Aperture',
  wordmark: 'VisionFlow',
  descriptor: 'Schema-driven vision ingestion',
  tagline: 'Change the schema, not the pipeline.',
  support:
    'One continuous pipeline handles every image type. Each schema generates its own extraction prompt, so a new use case is a new schema, not new code.',
  theme: 'dark',
  css: {
    '--bg': '#0B2026',
    '--surface': '#13292F',
    '--surface-2': '#1B3139',
    '--ink': '#F9F7F4',
    '--muted': '#9DB0B6',
    '--line': '#2A434B',
    '--accent': '#FF3621',
    '--accent-ink': '#FFFFFF',
    '--schema': '#6CB4EE',
    '--ok': '#3FD6A0',
    '--warn': '#FFC24D',
    '--dark': '#061418',
  },
  swatches: [
    { name: 'Navy 900', hex: '#0B2026', use: 'Default surface (dark first)', dark: true },
    { name: 'Navy 800', hex: '#1B3139', use: 'Panels, code blocks', dark: true },
    { name: 'Lava', hex: '#FF3621', use: 'Image / capture, primary action', dark: true },
    { name: 'Schema Blue', hex: '#6CB4EE', use: 'Schema names, field keys' },
    { name: 'Row Green', hex: '#3FD6A0', use: 'Typed output rows' },
    { name: 'Oat', hex: '#F9F7F4', use: 'Text on dark' },
  ],
  voice: {
    say: ['New schema: endcap_audit', 'Prompt generated from v3', 'Same pipeline, 4 schemas', 'schema_fingerprint 9c1e'],
    avoid: ['Train a custom model', 'Zero-shot magic', 'Intelligent document AI'],
  },
  tile: (u) => {
    const types: Record<string, string> = {
      jurisdiction: 'string', quantity_sold: 'integer', price: 'currency', transaction_date: 'date', terminal_id: 'string',
      endcap_id: 'string', facings_expected: 'integer', facings_found: 'integer', price_sign_present: 'boolean', out_of_stock: 'array',
      document_type: 'string', issuing_state: 'string', holder_name: 'string', expiration_date: 'date', is_expired: 'boolean',
    };
    const prompts: Record<UseCase['key'], string> = {
      receipt: 'Read the terminal receipt. Return jurisdiction as the two-letter state code in the header, quantity_sold as an integer…',
      shelf: 'Compare the endcap photo with planogram A-3. Count visible facings and list empty slots as out_of_stock…',
      id: 'Read the front of the license. Return expiration_date as ISO 8601. If a field is obscured, set value to null…',
    };
    const art =
      u.key === 'receipt'
        ? receiptArt('#F9F7F4', '#0B2026')
        : u.key === 'shelf'
          ? shelfArt('#1B3139', '#F9F7F4', ['#3B5A63', '#56767F', '#3B5A63', '#FF3621'])
          : idArt('#F9F7F4', '#0B2026', '#9DB0B6');
    return `<article class="tile">
      <div class="flow3">
        <div class="well small">${art}</div>
        <span class="arrow">→</span>
        <pre class="code"><span class="k">schema</span> <span class="s">${u.schema}</span> <span class="c">v3</span>
${u.fields
  .slice(0, 4)
  .map((f) => `  <span class="s">${f.name}</span> <span class="c">${types[f.name]}</span>`)
  .join('\n')}</pre>
      </div>
      <h3>${u.title}</h3>
      <p class="prompt"><span class="lbl">generated prompt</span>${prompts[u.key]}</p>
    </article>`;
  },
  ui: () => `<div class="ui ui-02">
    <div class="pane">
      <div class="pane-head"><img src="mark.svg" alt="" class="m24"/><b>VisionFlow</b><span class="sp"></span><span class="muted mono">4 schemas · 1 pipeline</span></div>
      <ul class="schemas">
        <li class="on"><span class="mono s">lottery_sales</span><span class="mono c">v3 · 5 fields</span></li>
        <li><span class="mono s">endcap_audit</span><span class="mono c">v1 · 5 fields</span></li>
        <li><span class="mono s">drivers_license</span><span class="mono c">v2 · 7 fields</span></li>
        <li><span class="mono s">signed_form</span><span class="mono c">v1 · 4 fields</span></li>
        <li class="add">+ New schema from a description</li>
      </ul>
    </div>
    <div class="pane wide">
      <div class="pane-head"><b class="mono">lottery_sales</b><span class="chip">v3</span><span class="sp"></span><span class="muted mono">fingerprint 9c1e4b</span></div>
      <table class="tbl">
        <thead><tr><th>field</th><th>type</th><th>required</th><th>instruction</th></tr></thead>
        <tbody>
          <tr><td class="s">jurisdiction</td><td>string</td><td>yes</td><td>Two-letter state code from the receipt header</td></tr>
          <tr><td class="s">quantity_sold</td><td>integer</td><td>yes</td><td>Total tickets on the transaction</td></tr>
          <tr><td class="s">price</td><td>currency</td><td>yes</td><td>Total charged, excluding change due</td></tr>
          <tr><td class="s">transaction_date</td><td>date</td><td>yes</td><td>Printed sale date, not draw date</td></tr>
          <tr><td class="s">terminal_id</td><td>string</td><td>no</td><td>Terminal or retailer ID when printed</td></tr>
        </tbody>
      </table>
      <div class="gen"><span class="lbl">generated prompt · preview</span>Extract the following fields from a lottery terminal receipt. For each field return value, confidence (0–1), and the printed text used as evidence. jurisdiction: two-letter state code from the receipt header…</div>
    </div>
  </div>`,
};

// ---------- package 03: Evidence Box ----------

const evidenceBox: Pkg = {
  dir: '03-evidence-box',
  number: '03',
  name: 'Evidence Box',
  wordmark: 'Vision Flow',
  descriptor: 'Reviewable image extraction',
  tagline: 'Every field shows its source.',
  support:
    'Each value carries a confidence score and the text it was read from. Low-confidence scans go to a reviewer before they reach a report.',
  theme: 'light',
  css: {
    '--bg': '#FFFFFF',
    '--surface': '#FFFFFF',
    '--surface-2': '#F9F7F4',
    '--ink': '#1B3139',
    '--muted': '#5A6F77',
    '--line': '#E0E3E5',
    '--accent': '#FF3621',
    '--accent-ink': '#FFFFFF',
    '--ok': '#00875A',
    '--warn': '#8F5F00',
    '--bad': '#98102A',
    '--dark': '#1B3139',
  },
  swatches: [
    { name: 'Navy', hex: '#1B3139', use: 'Text, box outlines', dark: true },
    { name: 'Lava', hex: '#FF3621', use: 'Region labels, primary action' },
    { name: 'Oat', hex: '#F9F7F4', use: 'Image wells, review queue' },
    { name: 'Verified', hex: '#00875A', use: 'Accepted values only', dark: true },
    { name: 'Review', hex: '#FFAB00', use: 'Needs review only' },
    { name: 'Rejected', hex: '#98102A', use: 'Mismatch / failed only', dark: true },
  ],
  voice: {
    say: ['Needs review: expiration_date 0.62', 'Read from "EXP 05/02/2030"', 'Approve', '3 scans waiting'],
    avoid: ['100% accurate', 'Fully automated verification', 'Trust our AI'],
  },
  tile: (u) => {
    const L = '#FF3621';
    const box = (x: number, y: number, w: number, h: number, label: string, color = L) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="none" stroke="${color}" stroke-width="2"/><rect x="${x - 1}" y="${y - 12}" width="${label.length * 5.6 + 8}" height="12" rx="2" fill="${color}"/><text x="${x + 3}" y="${y - 3}" font-family="DM Mono, monospace" font-size="8.5" fill="#fff">${label}</text>`;
    const art =
      u.key === 'receipt'
        ? receiptArt('#FFFFFF', '#1B3139', box(80, 22, 60, 14, 'jurisdiction') + box(116, 86, 30, 14, 'price'))
        : u.key === 'shelf'
          ? shelfArt('#FFFFFF', '#1B3139', ['#C9D3D6', '#8FA3AA', '#C9D3D6', '#8FA3AA'], box(74, 12, 72, 16, 'price_sign') + box(108, 77, 24, 32, 'oos', '#B57800'))
          : idArt('#FFFFFF', '#1B3139', '#C9D3D6', box(92, 65, 82, 10, 'holder_name') + box(92, 102, 60, 18, 'expiration', '#B57800'));
    const review = u.fields.some((f) => f.confidence < 0.8);
    return `<article class="tile">
      <div class="well">${art}</div>
      <div class="tile-head"><h3>${u.title}</h3>${review ? '<span class="chip warn">Needs review</span>' : '<span class="chip ok">Verified</span>'}</div>
      <p class="muted">${u.line}</p>
      <ul class="conf">${u.fields
        .slice(1, 5)
        .map(
          (f) =>
            `<li class="${f.confidence < 0.8 ? 'low' : ''}"><span class="mono">${f.name}</span><span class="bar"><i style="width:${Math.round(f.confidence * 100)}%"></i></span><span class="mono n">${f.confidence.toFixed(2)}</span></li>`,
        )
        .join('')}</ul>
    </article>`;
  },
  ui: () => `<div class="ui ui-03">
    <div class="queue">
      <div class="q-head"><img src="mark.svg" alt="" class="m24"/><b>Review</b><span class="sp"></span><span class="chip warn">3</span></div>
      <ul>
        <li class="on"><b>drivers_license</b><span class="muted">expiration_date 0.62</span></li>
        <li><b>endcap_audit</b><span class="muted">out_of_stock 0.71</span></li>
        <li><b>lottery_sales</b><span class="muted">schema mismatch</span></li>
      </ul>
    </div>
    <div class="viewer">${idArt('#FFFFFF', '#1B3139', '#C9D3D6', '<rect x="92" y="102" width="60" height="18" rx="2" fill="#FFAB00" fill-opacity=".14" stroke="#B57800" stroke-width="2"/>')}</div>
    <div class="detail">
      <div class="d-head"><b class="mono">expiration_date</b><span class="chip warn">0.62</span></div>
      <label>Value</label><div class="input mono">2030-05-02</div>
      <label>Evidence</label><div class="evidence mono">"EXP 05/02/203_" (last digit obscured by glare)</div>
      <div class="actions"><button class="btn">Approve</button><button class="btn ghost">Edit value</button><button class="btn ghost bad">Reject scan</button></div>
    </div>
  </div>`,
};

const PACKAGES = [fieldLines, schemaAperture, evidenceBox];

// ---------- page ----------

function page(p: Pkg): string {
  const vars = Object.entries(p.css)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Vision Flow · ${p.number} ${p.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=block" rel="stylesheet"/>
<link rel="stylesheet" href="../assets/board.css"/>
<style>:root{${vars}}</style>
</head>
<body class="theme-${p.theme} pkg-${p.number}">
<main class="board">
  <header class="top">
    <div class="lockup"><img src="${p.theme === 'dark' ? 'mark-reversed.svg' : 'mark.svg'}" alt="" class="m72"/><div><div class="wordmark">${p.wordmark}</div><div class="descriptor">${p.descriptor}</div></div></div>
    <div class="variants">
      <div class="var dark"><img src="mark-reversed.svg" alt="" class="m40"/><span class="wordmark sm">${p.wordmark}</span></div>
      <div class="var single"><img src="mark-mono.svg" alt="" class="m40 mono-img"/><span class="wordmark sm">${p.wordmark}</span></div>
      <div class="var fav"><img src="favicon.svg" alt="" width="32" height="32"/><img src="favicon.svg" alt="" width="16" height="16"/></div>
    </div>
    <div class="tag">Package ${p.number} · ${p.name}</div>
  </header>

  <section class="intro"><h1>${p.tagline}</h1><p>${p.support}</p></section>

  <section class="cols3">
    <div class="block"><h4>Color</h4><div class="swatches">${p.swatches
      .map(
        (s) =>
          `<div class="sw"><div class="chipc" style="background:${s.hex}"></div><div><b>${s.name}</b> <span class="mono">${s.hex}</span><div class="muted">${s.use}</div></div></div>`,
      )
      .join('')}</div></div>
    <div class="block"><h4>Type</h4>
      <div class="spec-h">DM Sans Bold</div><div class="spec-b">DM Sans 400 for product copy. 14 to 16 px, sentence case.</div>
      <div class="spec-m">DM Mono · field_name · 2026-11-14 · 0.97</div>
      <p class="muted small">DM Sans and DM Mono are Databricks' brand families and are free on Google Fonts. Mono is reserved for schema keys, values, and IDs.</p>
    </div>
    <div class="block"><h4>Voice</h4>
      <div class="say"><span class="lbl">Write</span>${p.voice.say.map((s) => `<div>${esc(s)}</div>`).join('')}</div>
      <div class="avoid"><span class="lbl">Avoid</span>${p.voice.avoid.map((s) => `<div>${esc(s)}</div>`).join('')}</div>
    </div>
  </section>

  <section><h4 class="sec">Use cases</h4><div class="cols3 tiles">${USE_CASES.map(p.tile).join('')}</div></section>

  <section><h4 class="sec">In the app</h4>${p.ui()}</section>
</main>
</body></html>`;
}

const htmlOnly = process.argv.includes('--html');
for (const p of PACKAGES) {
  const adopted = ADOPTED[p.dir];
  const outDir = adopted?.out ?? join(ROOT, p.dir);
  const htmlPath = join(outDir, 'board.html');
  let html = page(p).replace('href="../assets/board.css"', `href="${relative(outDir, join(ROOT, 'assets/board.css'))}"`);
  for (const [name, file] of Object.entries(adopted?.files ?? {})) {
    html = html.replaceAll(`src="${name}"`, `src="${relative(dirname(htmlPath), file)}"`);
  }
  await Bun.write(htmlPath, html);
  if (htmlOnly) continue;
  const png = join(outDir, 'board.png');
  await $`${CHROME} --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 --window-size=${WIDTH},2000 --screenshot=${png} file://${htmlPath}`.quiet();
  // Crop the empty space below the board (screenshot height is fixed).
  const box = (await $`magick ${png} -format %@ info:`.text()).trim(); // e.g. 1472x1650+64+56
  const m = box.match(/^\d+x(\d+)\+\d+\+(\d+)$/);
  if (m) await $`magick ${png} -crop ${WIDTH}x${Number(m[1]) + Number(m[2]) + 64}+0+0 +repage ${png}`.quiet();
  console.log(`wrote ${relative(REPO, outDir)}/board.html and board.png`);
}
