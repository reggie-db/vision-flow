/**
 * Slide 5: animated data flow, built with React Flow.
 *
 * Top row is generated once per document type (prompt -> schema -> dashboard page, and the
 * schema's extraction instructions for the pipeline). Bottom row is the data that keeps
 * flowing: photos -> Lakeflow pipeline -> Delta table -> dashboard.
 *
 * Bundled to flow.js by build.ts. Mounts into #flow; replays when slide 5 is shown
 * (deck.js dispatches `deck:slide`). `?print` or reduced motion renders the final state.
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const still =
  new URLSearchParams(location.search).has('print') || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Seconds into the sequence when each step appears. */
const T = { schema: 0.9, dashboard: 2.0, pipeline: 2.0, data: 3.2 };

type Card = { title: string; tag: string; body: ReactNode; delay?: number; dark?: boolean; handles: string[] };

function CardNode({ data }: NodeProps<Node<Card>>) {
  const style = { '--delay': `${data.delay ?? 0}s` } as CSSProperties;
  return (
    <div className={`card${data.dark ? ' dark' : ''}${data.delay ? ' appears' : ''}`} style={style}>
      {data.handles.map((h) => {
        const [type, side] = h.split(':') as ['source' | 'target', 'top' | 'right' | 'bottom' | 'left'];
        return <Handle key={h} id={h} type={type} position={side as Position} isConnectable={false} />;
      })}
      <div className="card-head">
        <b>{data.title}</b>
        <span>{data.tag}</span>
      </div>
      <div className="card-body">{data.body}</div>
    </div>
  );
}

function Count({ start, step, every }: { start: number; step: number; every: number }) {
  const [n, setN] = useState(start);
  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const wait = setTimeout(() => {
      timer = setInterval(() => setN((v) => v + step), every * 1000);
    }, (T.data + 2.4) * 1000);
    return () => {
      clearTimeout(wait);
      if (timer) clearInterval(timer);
    };
  }, [step, every]);
  return <>{n.toLocaleString('en-US')}</>;
}

type FlowEdgeData = {
  kind: 'generate' | 'data';
  label: string;
  delay: number;
  packets?: number;
  /** Keep the label off the line so packets stay visible. */
  labelAt?: 'above' | 'beside';
};

function FlowEdge(props: EdgeProps<Edge<FlowEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 18,
  });
  const kind = data?.kind ?? 'data';
  const delay = data?.delay ?? 0;
  const packets = kind === 'data' ? (data?.packets ?? 3) : 0;
  const duration = 2.4;
  return (
    <>
      <BaseEdge
        path={path}
        className={`edge ${kind}`}
        style={{ '--delay': `${delay}s` } as CSSProperties}
        {...({ pathLength: 1 } as object)}
      />
      {Array.from({ length: still ? 0 : packets }, (_, i) => (
        <rect
          key={i}
          className="packet"
          width="22"
          height="28"
          rx="3"
          x="-11"
          y="-14"
          style={
            {
              offsetPath: `path('${path}')`,
              animationDuration: `${duration}s`,
              animationDelay: `${delay + (i * duration) / packets}s`,
            } as CSSProperties
          }
        />
      ))}
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${kind}`}
          style={
            {
              transform:
                data?.labelAt === 'beside'
                  ? `translate(16px, -50%) translate(${labelX}px, ${labelY}px)`
                  : `translate(-50%, -100%) translate(${labelX}px, ${labelY - 10}px)`,
              '--delay': `${delay}s`,
            } as CSSProperties
          }
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const fields: [string, string, boolean][] = [
  ['jurisdiction', 'string', true],
  ['ticket_number', 'string', true],
  ['purchase_date', 'date', true],
  ['plays[ ]', 'array', true],
  ['total_paid', 'currency', true],
];

const nodes: Node<Card>[] = [
  {
    id: 'prompt',
    type: 'card',
    position: { x: 0, y: 0 },
    data: {
      title: 'Prompt',
      tag: 'written once',
      handles: ['source:right'],
      body: (
        <p className="quote">
          “Lottery receipt with jurisdiction, ticket number, purchase date, played numbers, wagers, and total
          paid.”
        </p>
      ),
    },
  },
  {
    id: 'schema',
    type: 'card',
    position: { x: 622, y: 0 },
    data: {
      title: 'Schema',
      tag: 'lottery_receipt v1',
      delay: T.schema,
      handles: ['target:left', 'source:right', 'source:bottom'],
      body: (
        <ul className="fields">
          {fields.map(([name, type, req]) => (
            <li key={name}>
              <code>{name}</code>
              <i>{type}</i>
              <em>{req ? 'required' : ''}</em>
            </li>
          ))}
        </ul>
      ),
    },
  },
  {
    id: 'dashboard',
    type: 'card',
    position: { x: 1244, y: 0 },
    data: {
      title: 'Dashboard page',
      tag: 'AI/BI',
      delay: T.dashboard,
      handles: ['target:left', 'target:bottom'],
      body: (
        <div className="dash">
          <div>
            <b>
              <Count start={1284} step={1} every={0.8} />
            </b>
            <span>receipts</span>
          </div>
          <div>
            <b>17</b>
            <span>need review</span>
          </div>
        </div>
      ),
    },
  },
  {
    id: 'photos',
    type: 'card',
    position: { x: 0, y: 390 },
    data: {
      title: 'Photos',
      tag: 'camera or upload',
      delay: T.data - 0.4,
      handles: ['source:right'],
      body: (
        <div className="thumbs" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} />
          ))}
        </div>
      ),
    },
  },
  {
    id: 'pipeline',
    type: 'card',
    position: { x: 622, y: 390 },
    data: {
      title: 'Lakeflow pipeline',
      tag: '',
      dark: true,
      delay: T.pipeline,
      handles: ['target:top', 'target:left', 'source:right'],
      body: <p>Runs continuously and applies each schema’s extraction instructions with a vision model.</p>,
    },
  },
  {
    id: 'delta',
    type: 'card',
    position: { x: 1244, y: 390 },
    data: {
      title: 'Delta table',
      tag: 'results',
      delay: T.data - 0.4,
      handles: ['target:left', 'source:top'],
      body: (
        <dl className="row">
          <div>
            <dt>total_paid</dt>
            <dd>
              10.00 <i>0.98</i>
            </dd>
          </div>
          <div>
            <dt>needs_review</dt>
            <dd>false</dd>
          </div>
        </dl>
      ),
    },
  },
];

const edges: Edge<FlowEdgeData>[] = [
  { id: 'p-s', source: 'prompt', sourceHandle: 'source:right', target: 'schema', targetHandle: 'target:left', type: 'flow', data: { kind: 'generate', label: 'AI generates', delay: 0.2 } },
  { id: 's-d', source: 'schema', sourceHandle: 'source:right', target: 'dashboard', targetHandle: 'target:left', type: 'flow', data: { kind: 'generate', label: 'AI generates', delay: T.schema + 0.4 } },
  { id: 's-p', source: 'schema', sourceHandle: 'source:bottom', target: 'pipeline', targetHandle: 'target:top', type: 'flow', data: { kind: 'generate', label: 'extraction instructions', delay: T.schema + 0.4, labelAt: 'beside' } },
  { id: 'ph-p', source: 'photos', sourceHandle: 'source:right', target: 'pipeline', targetHandle: 'target:left', type: 'flow', data: { kind: 'data', label: 'images', delay: T.data } },
  { id: 'p-dl', source: 'pipeline', sourceHandle: 'source:right', target: 'delta', targetHandle: 'target:left', type: 'flow', data: { kind: 'data', label: 'typed rows', delay: T.data + 0.8 } },
  { id: 'dl-d', source: 'delta', sourceHandle: 'source:top', target: 'dashboard', targetHandle: 'target:bottom', type: 'flow', data: { kind: 'data', label: 'queries', delay: T.data + 1.6, packets: 2, labelAt: 'beside' } },
];

const nodeTypes = { card: CardNode };
const edgeTypes = { flow: FlowEdge };

function Flow() {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
    />
  );
}

function Player() {
  const [run, setRun] = useState(0);
  useEffect(() => {
    const replay = (event: Event) => {
      if ((event as CustomEvent<{ id: string }>).detail.id === 'flow') setRun((r) => r + 1);
    };
    addEventListener('deck:slide', replay);
    return () => removeEventListener('deck:slide', replay);
  }, []);
  return (
    <div className={`flow-canvas${still ? ' still' : ''}`} key={run}>
      <Flow />
    </div>
  );
}

createRoot(document.getElementById('flow')!).render(<Player />);
