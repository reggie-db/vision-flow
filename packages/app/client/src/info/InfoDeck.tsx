/**
 * Vision Flow story deck: lottery receipt audit -> other documents -> two uses of AI ->
 * prompt-to-data flow -> Databricks components.
 *
 * Used by the Info tab (InfoPresentation.tsx) and bundled as a standalone page by
 * docs/research/deck/build.ts. Slides are authored at 1920x1080 and scaled to fit.
 * Colors come from the brand variables (branding/brand.json) with brand fallbacks.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FlowDiagram } from './FlowDiagram.tsx';
import './info-deck.css';

const W = 1920;
const H = 1080;

type Slide = { id: string; title: string; render: (still: boolean) => ReactNode };

function Receipt() {
  return (
    <svg
      viewBox="140 10 280 620"
      className="vf-receipt"
      role="img"
      aria-label="Lottery receipt with four fields highlighted"
    >
      <rect className="paper" x="150" y="20" width="260" height="600" rx="6" />
      <path
        className="paper"
        d="M150 600l13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14 13 14 13-14v-20H150z"
      />
      <g className="ink">
        <rect x="200" y="52" width="160" height="16" rx="3" />
        <rect x="226" y="78" width="108" height="8" rx="3" opacity=".45" />
        <rect x="180" y="120" width="50" height="9" rx="3" opacity=".5" />
        <rect x="300" y="120" width="80" height="9" rx="3" />
        <rect x="180" y="150" width="70" height="9" rx="3" opacity=".5" />
        <rect x="290" y="150" width="90" height="9" rx="3" />
        <rect x="180" y="200" width="200" height="2" opacity=".2" />
        {[226, 300].map((y) => (
          <g key={y}>
            <rect x="180" y={y} width="90" height="10" rx="3" />
            <rect x="330" y={y} width="50" height="10" rx="3" opacity=".6" />
            {[196, 226, 256, 286, 316].map((x) => (
              <rect key={x} x={x} y={y + 26} width="22" height="22" rx="11" opacity=".75" />
            ))}
          </g>
        ))}
        <rect x="180" y="380" width="200" height="2" opacity=".2" />
        <rect x="180" y="404" width="80" height="14" rx="3" />
        <rect x="316" y="404" width="64" height="14" rx="3" />
        <g opacity=".85">
          {[
            [190, 4],
            [200, 8],
            [214, 3],
            [222, 6],
            [234, 4],
            [244, 10],
            [260, 4],
            [270, 6],
            [282, 3],
            [290, 8],
            [304, 4],
            [314, 6],
            [326, 3],
            [334, 10],
            [350, 4],
            [360, 6],
          ].map(([x, w]) => (
            <rect key={x} x={x} y="460" width={w} height="70" />
          ))}
        </g>
      </g>
      <g className="highlight">
        <rect x="192" y="44" width="176" height="32" rx="5" />
        <rect x="290" y="112" width="100" height="25" rx="5" />
        <rect x="280" y="142" width="110" height="25" rx="5" />
        <rect x="306" y="396" width="84" height="30" rx="5" />
      </g>
    </svg>
  );
}

function SmallReceipt() {
  return (
    <svg viewBox="0 0 300 260" role="img" aria-label="Receipt">
      <rect className="paper" x="95" y="14" width="110" height="232" rx="4" />
      <g className="ink">
        <rect x="115" y="32" width="70" height="10" rx="2" />
        <rect x="110" y="60" width="40" height="6" rx="2" opacity=".5" />
        <rect x="160" y="60" width="30" height="6" rx="2" />
        <rect x="110" y="78" width="50" height="6" rx="2" opacity=".5" />
        <rect x="164" y="78" width="26" height="6" rx="2" />
        <rect x="110" y="110" width="80" height="2" opacity=".2" />
        <rect x="110" y="128" width="44" height="8" rx="2" />
        <rect x="164" y="128" width="26" height="8" rx="2" opacity=".6" />
        <rect x="110" y="150" width="44" height="8" rx="2" />
        <rect x="164" y="150" width="26" height="8" rx="2" opacity=".6" />
        <g opacity=".8">
          {[
            [112, 3],
            [119, 6],
            [129, 2],
            [135, 5],
            [144, 3],
            [151, 7],
            [162, 3],
            [169, 5],
            [178, 2],
            [184, 5],
          ].map(([x, w]) => (
            <rect key={x} x={x} y="190" width={w} height="36" />
          ))}
        </g>
      </g>
    </svg>
  );
}

function IdCard() {
  return (
    <svg viewBox="0 0 300 260" role="img" aria-label="ID card">
      <rect className="paper" x="20" y="52" width="260" height="160" rx="14" />
      <path className="ink-fill" d="M20 66a14 14 0 0 1 14-14h232a14 14 0 0 1 14 14v18H20z" />
      <rect className="paper" x="36" y="62" width="70" height="10" rx="2" opacity=".9" />
      <rect className="photo" x="36" y="100" width="70" height="88" rx="6" />
      <g className="ink" opacity=".3">
        <circle cx="71" cy="132" r="15" />
        <path d="M45 186c5-20 17-28 26-28s21 8 26 28z" />
      </g>
      <g className="ink">
        <rect x="124" y="104" width="40" height="5" rx="2" opacity=".45" />
        <rect x="124" y="114" width="120" height="9" rx="2" />
        <rect x="124" y="138" width="40" height="5" rx="2" opacity=".45" />
        <rect x="124" y="148" width="70" height="9" rx="2" />
        <rect x="124" y="170" width="40" height="5" rx="2" opacity=".45" />
        <rect x="124" y="180" width="84" height="9" rx="2" />
      </g>
    </svg>
  );
}

function SignedDocument() {
  return (
    <svg viewBox="0 0 300 260" role="img" aria-label="Signed document">
      <rect className="paper" x="70" y="14" width="160" height="232" rx="4" />
      <g className="ink">
        <rect x="90" y="34" width="90" height="10" rx="2" />
        {[
          [62, 120],
          [74, 110],
          [86, 120],
          [98, 80],
          [122, 120],
          [134, 96],
        ].map(([y, w]) => (
          <rect key={y} x="90" y={y} width={w} height="5" rx="2" opacity=".35" />
        ))}
        <rect x="90" y="196" width="70" height="2" opacity=".6" />
        <rect x="176" y="196" width="34" height="2" opacity=".6" />
        <rect x="90" y="204" width="30" height="4" rx="2" opacity=".4" />
        <rect x="176" y="204" width="20" height="4" rx="2" opacity=".4" />
      </g>
      <path className="signature" d="M94 190c8-14 14-16 16-8s-4 10 2 2 10-14 12-6 6 8 12 0 8-4 10 2" />
    </svg>
  );
}

const k = (text: string) => <span className="s">"{text}"</span>;
const v = (text: string) => <span className="v">{text}</span>;

export const slides: Slide[] = [
  {
    id: 'audit',
    title: 'Auditing daily lottery receipts',
    render: () => (
      <div className="vf-split">
        <div>
          <h2>Auditing daily lottery receipts</h2>
          <p className="vf-lead">
            A customer submits lottery sales to the state every day. Staff checked each receipt by hand before the
            submission, and manual entry introduced errors.
          </p>
          <p className="vf-ask">The request: audit every receipt before the daily submission and reduce human error.</p>
        </div>
        <figure>
          <div className="vf-frame">
            <Receipt />
          </div>
          <dl className="vf-extracted">
            <div>
              <dt>jurisdiction</dt>
              <dd>TX</dd>
            </div>
            <div>
              <dt>ticket_number</dt>
              <dd>0418-2209-7731</dd>
            </div>
            <div>
              <dt>purchase_date</dt>
              <dd>2026-11-14</dd>
            </div>
            <div>
              <dt>total_paid</dt>
              <dd>$10.00</dd>
            </div>
          </dl>
        </figure>
      </div>
    ),
  },
  {
    id: 'documents',
    title: 'Other documents with the same need',
    render: () => (
      <>
        <h2>Other documents with the same need</h2>
        <p className="vf-lead">
          The same customer asked whether this approach could also check ID cards and confirm that signed documents are
          complete.
        </p>
        <div className="vf-docs">
          {[
            ['Lottery receipt', 'Every play and total is captured before filing.', <SmallReceipt key="r" />],
            ['ID card', 'Required fields are present and the card isn’t expired.', <IdCard key="i" />],
            ['Signed document', 'Each signature and date line is filled in.', <SignedDocument key="s" />],
          ].map(([name, check, art]) => (
            <figure key={name as string} className="vf-doc">
              <div className="vf-frame">{art}</div>
              <figcaption>
                <b>{name}</b>
                <span>{check}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'uses',
    title: 'Two uses of AI in this demo',
    render: () => (
      <>
        <h2>Two uses of AI in this demo</h2>
        <div className="vf-jobs">
          <div className="vf-job">
            <h3>Read the image</h3>
            <p>A vision model turns each photo into a structured record with a confidence score per field.</p>
            <pre className="vf-code">
              <span className="k">{'{'}</span>
              {'\n  '}
              {k('jurisdiction')}: {'{ '}
              {k('value')}: {v('"TX"')},{'\n                    '}
              {k('confidence')}: {v('0.99')} {'},'}
              {'\n  '}
              {k('purchase_date')}: {'{ '}
              {k('value')}: {v('"2026-11-14"')},{'\n                     '}
              {k('confidence')}: {v('0.95')} {'},'}
              {'\n  '}
              {k('total_paid')}: {'{ '}
              {k('value')}: {v('10.00')},{'\n                  '}
              {k('confidence')}: {v('0.98')} {'}'}
              {'\n'}
              <span className="k">{'}'}</span>
            </pre>
          </div>
          <div className="vf-job emphasis">
            <h3>Generate the structure</h3>
            <p>
              From a one-sentence description, AI generates the schema to collect, a dashboard page for that schema,
              Genie context, and the extraction instructions the pipeline runs.
            </p>
            <ul className="vf-made">
              <li>
                <b>Schema</b>
                <span>fields, types, required checks</span>
              </li>
              <li>
                <b>Dashboard</b>
                <span>a page built from that schema</span>
              </li>
              <li>
                <b>Genie</b>
                <span>schema context for questions</span>
              </li>
              <li>
                <b>Extraction</b>
                <span>instructions the pipeline runs</span>
              </li>
            </ul>
          </div>
        </div>
        <p className="vf-note inline">Most of the demo covers the second use.</p>
      </>
    ),
  },
  {
    id: 'flow',
    title: 'From a prompt to ingested data',
    render: (still) => (
      <>
        <h2>From a prompt to ingested data</h2>
        <ul className="vf-legend" aria-label="Legend">
          <li className="generate">Generated once by AI</li>
          <li className="data">Data, continuously</li>
        </ul>
        <div
          className="vf-flow-area"
          role="img"
          aria-label="A prompt generates a schema. The schema generates a dashboard page, Genie context, and the extraction instructions for a Lakeflow pipeline. Photos go through the pipeline into a Delta table, which the dashboard and Genie query."
        >
          <FlowDiagram still={still} />
        </div>
        <p className="vf-note">
          One continuous Lakeflow pipeline handles every schema. Adding a document type adds a schema; the pipeline
          stays the same.
        </p>
      </>
    ),
  },
  {
    id: 'platform',
    title: 'Databricks components',
    render: () => (
      <>
        <h2>Databricks components</h2>
        <div className="vf-stack">
          {[
            ['Databricks App', 'Camera capture, a quick image check, and schema management'],
            ['Lakebase', 'Schema registry: versions, prompts, and search'],
            ['Lakeflow pipeline', 'Continuous extraction with a vision model, per-field confidence and evidence'],
            ['Delta table', 'One results table, each row tied to its schema fingerprint'],
            ['AI/BI and Genie', 'Generated dashboard pages and natural-language questions over the results'],
          ].map(([name, role]) => (
            <div key={name} className="vf-tier">
              <b>{name}</b>
              <span>{role}</span>
            </div>
          ))}
        </div>
        <p className="vf-closing">To add a document type, describe it in a sentence and scan an example.</p>
      </>
    ),
  },
];

function SlideFrame({ slide, still }: { slide: Slide; still: boolean }) {
  return (
    <article className="vf-slide" aria-label={slide.title}>
      {slide.render(still)}
    </article>
  );
}

export interface InfoDeckProps {
  /**
   * `print` stacks every slide at full size with no motion (PDF). `slide` renders one
   * slide at full size in its final animation state (PNG screenshots).
   */
  mode?: 'interactive' | 'print' | 'slide';
  initialSlide?: number;
  /** Listen for arrow keys on the window (standalone page) instead of only when focused. */
  globalKeys?: boolean;
  /** Render the final animation state without motion. */
  still?: boolean;
}

export function InfoDeck({ mode = 'interactive', initialSlide = 0, globalKeys = false, still = false }: InfoDeckProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialSlide, 0), slides.length - 1));
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const show = (next: number) => setIndex(Math.min(Math.max(next, 0), slides.length - 1));
  const step = (key: string) =>
    (({ ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }) as Record<string, number>)[key];

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fit = () => setScale(Math.min(viewport.clientWidth / W, viewport.clientHeight / H));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!globalKeys) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      const delta = step(event.key);
      if (delta) {
        event.preventDefault();
        setIndex((current) => Math.min(Math.max(current + delta, 0), slides.length - 1));
      }
      if (event.key === 'Home') show(0);
      if (event.key === 'End') show(slides.length - 1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [globalKeys]);

  if (mode === 'slide') {
    return (
      <div className="vf-deck print">
        <SlideFrame slide={slides[index]!} still />
      </div>
    );
  }

  if (mode === 'print') {
    return (
      <div className="vf-deck print">
        {slides.map((slide) => (
          <SlideFrame key={slide.id} slide={slide} still />
        ))}
      </div>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (globalKeys) return;
    const delta = step(event.key);
    if (delta) {
      event.preventDefault();
      show(index + delta);
    }
    if (event.key === 'Home') show(0);
    if (event.key === 'End') show(slides.length - 1);
  };

  const slide = slides[index]!;
  return (
    <section
      className="vf-deck"
      aria-roledescription="carousel"
      aria-label="Vision Flow story"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="vf-viewport" ref={viewportRef}>
        <div
          className="vf-stage"
          style={{ width: W * scale, height: H * scale }}
          aria-live="polite"
          aria-label={`Slide ${index + 1} of ${slides.length}`}
        >
          <div className="vf-scaler" style={{ transform: `scale(${scale})` }}>
            {/* key remounts the slide so the flow animation replays each time it is shown */}
            <SlideFrame key={slide.id} slide={slide} still={still} />
          </div>
        </div>
      </div>
      <nav className="vf-controls" aria-label="Slides">
        <button type="button" onClick={() => show(index - 1)} disabled={index === 0}>
          Previous
        </button>
        <div className="vf-dots">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === index ? 'active' : ''}
              aria-label={`Slide ${i + 1}: ${item.title}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => show(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => show(index + 1)}
          disabled={index === slides.length - 1}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
