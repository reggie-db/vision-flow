/**
 * Animated data flow for the Info deck, built with React Flow.
 *
 * Navy edges are generated once per document type: prompt -> schema -> dashboard page,
 * Genie context, and the pipeline's extraction instructions. Lava edges carry data that
 * keeps flowing: photos -> Lakeflow pipeline -> Delta table -> dashboard and Genie.
 *
 * The reveal plays on mount; remount (change `key`) to replay. `still` renders the final
 * state without motion (print, screenshots, reduced motion).
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
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** Seconds into the reveal when each step appears. */
const T = { schema: 0.9, outputs: 2.0, data: 3.2 };
const PACKET_SECONDS = 2.4;

const StillContext = createContext(false);

type Card = { title: string; tag?: string; body: ReactNode; delay?: number; dark?: boolean; handles: string[] };

function CardNode({ data }: NodeProps<Node<Card>>) {
  const style = { '--delay': `${data.delay ?? 0}s` } as CSSProperties;
  return (
    <div className={`vf-card${data.dark ? ' dark' : ''}${data.delay ? ' appears' : ''}`} style={style}>
      {data.handles.map((handle) => {
        const [type, side] = handle.split(':') as ['source' | 'target', Position];
        return <Handle key={handle} id={handle} type={type} position={side} isConnectable={false} />;
      })}
      <div className="vf-card-head">
        <b>{data.title}</b>
        {data.tag ? <span>{data.tag}</span> : null}
      </div>
      <div className="vf-card-body">{data.body}</div>
    </div>
  );
}

/** Receipt count that ticks up once data starts arriving. */
function ReceiptCount() {
  const still = useContext(StillContext);
  const [count, setCount] = useState(1284);
  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(
      () => {
        timer = setInterval(() => setCount((value) => value + 1), 800);
      },
      (T.data + 0.8 + PACKET_SECONDS) * 1000
    );
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [still]);
  return <>{count.toLocaleString('en-US')}</>;
}

type FlowEdgeData = {
  kind: 'generate' | 'data';
  label?: string;
  delay: number;
  packets?: number;
  /** Keep the label off the line so packets stay visible. */
  labelAt?: 'above' | 'below' | 'beside';
};

function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const still = useContext(StillContext);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 18,
    offset: 28,
  });
  const kind = data?.kind ?? 'data';
  const delay = data?.delay ?? 0;
  const packets = kind === 'data' && !still ? (data?.packets ?? 3) : 0;
  return (
    <>
      <BaseEdge
        path={path}
        className={`vf-edge ${kind}`}
        style={{ '--delay': `${delay}s` } as CSSProperties}
        {...({ pathLength: 1 } as object)}
      />
      {Array.from({ length: packets }, (_, index) => (
        <rect
          key={index}
          className="vf-packet"
          width="20"
          height="26"
          rx="3"
          x="-10"
          y="-13"
          style={
            {
              offsetPath: `path('${path}')`,
              animationDuration: `${PACKET_SECONDS}s`,
              animationDelay: `${delay + (index * PACKET_SECONDS) / packets}s`,
            } as CSSProperties
          }
        />
      ))}
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className={`vf-edge-label ${kind}`}
            style={
              {
                transform: {
                  beside: `translate(14px, -50%) translate(${labelX}px, ${labelY}px)`,
                  below: `translate(-50%, 0) translate(${labelX}px, ${labelY + 8}px)`,
                  above: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 8}px)`,
                }[data.labelAt ?? 'above'],
                '--delay': `${delay}s`,
              } as CSSProperties
            }
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const fields: [string, string][] = [
  ['jurisdiction', 'string'],
  ['ticket_number', 'string'],
  ['purchase_date', 'date'],
  ['plays[ ]', 'array'],
  ['total_paid', 'currency'],
];

const TOP = 60;
const BOTTOM = 440;
const COL = [0, 441, 882, 1324];

const nodes: Node<Card>[] = [
  {
    id: 'prompt',
    type: 'card',
    position: { x: COL[0]!, y: TOP },
    data: {
      title: 'Prompt',
      tag: 'written once',
      handles: ['source:right'],
      body: (
        <p className="vf-quote">
          “Lottery receipt with jurisdiction, ticket number, purchase date, played numbers, wagers, and total paid.”
        </p>
      ),
    },
  },
  {
    id: 'schema',
    type: 'card',
    position: { x: COL[1]!, y: TOP },
    data: {
      title: 'Schema',
      tag: 'v1',
      delay: T.schema,
      handles: ['target:left', 'source:right', 'source:top', 'source:bottom'],
      body: (
        <ul className="vf-fields">
          {fields.map(([name, type]) => (
            <li key={name}>
              <code>{name}</code>
              <i>{type}</i>
            </li>
          ))}
        </ul>
      ),
    },
  },
  {
    id: 'dashboard',
    type: 'card',
    position: { x: COL[2]!, y: TOP },
    data: {
      title: 'Dashboard',
      tag: 'AI/BI',
      delay: T.outputs,
      handles: ['target:left', 'target:bottom'],
      body: (
        <div className="vf-kpis">
          <div>
            <b>
              <ReceiptCount />
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
    id: 'genie',
    type: 'card',
    position: { x: COL[3]!, y: TOP },
    data: {
      title: 'Genie',
      tag: 'AI/BI',
      delay: T.outputs,
      handles: ['target:top', 'target:bottom'],
      body: (
        <div className="vf-chat">
          <p className="q">Which receipts need review today?</p>
          <p className="a">17 receipts have a field below the confidence threshold.</p>
        </div>
      ),
    },
  },
  {
    id: 'photos',
    type: 'card',
    position: { x: COL[0]!, y: BOTTOM },
    data: {
      title: 'Photos',
      tag: 'camera or upload',
      delay: T.data - 0.4,
      handles: ['source:right'],
      body: (
        <div className="vf-thumbs" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} />
          ))}
        </div>
      ),
    },
  },
  {
    id: 'pipeline',
    type: 'card',
    position: { x: COL[1]!, y: BOTTOM },
    data: {
      title: 'Lakeflow pipeline',
      dark: true,
      delay: T.outputs,
      handles: ['target:top', 'target:left', 'source:right'],
      body: <p>Runs continuously and applies each schema’s extraction instructions with a vision model.</p>,
    },
  },
  {
    id: 'delta',
    type: 'card',
    position: { x: 1103, y: BOTTOM },
    data: {
      title: 'Delta table',
      tag: 'results',
      delay: T.data - 0.4,
      handles: ['target:left', 'source:top'],
      body: (
        <dl className="vf-row">
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

const edge = (
  id: string,
  source: string,
  sourceSide: string,
  target: string,
  targetSide: string,
  data: FlowEdgeData
): Edge<FlowEdgeData> => ({
  id,
  source,
  sourceHandle: `source:${sourceSide}`,
  target,
  targetHandle: `target:${targetSide}`,
  type: 'flow',
  data,
});

const edges: Edge<FlowEdgeData>[] = [
  edge('prompt-schema', 'prompt', 'right', 'schema', 'left', { kind: 'generate', delay: 0.2 }),
  edge('schema-dashboard', 'schema', 'right', 'dashboard', 'left', { kind: 'generate', delay: T.schema + 0.4 }),
  edge('schema-genie', 'schema', 'top', 'genie', 'top', {
    kind: 'generate',
    label: 'schema context',
    delay: T.schema + 0.4,
  }),
  edge('schema-pipeline', 'schema', 'bottom', 'pipeline', 'top', {
    kind: 'generate',
    label: 'extraction instructions',
    delay: T.schema + 0.4,
    labelAt: 'beside',
  }),
  edge('photos-pipeline', 'photos', 'right', 'pipeline', 'left', { kind: 'data', label: 'images', delay: T.data }),
  edge('pipeline-delta', 'pipeline', 'right', 'delta', 'left', {
    kind: 'data',
    label: 'typed rows',
    delay: T.data + 0.8,
  }),
  edge('delta-dashboard', 'delta', 'top', 'dashboard', 'bottom', {
    kind: 'data',
    label: 'queries',
    delay: T.data + 1.6,
    packets: 2,
    labelAt: 'below',
  }),
  edge('delta-genie', 'delta', 'top', 'genie', 'bottom', {
    kind: 'data',
    label: 'questions',
    delay: T.data + 1.6,
    packets: 2,
    labelAt: 'below',
  }),
];

const nodeTypes = { card: CardNode };
const edgeTypes = { flow: FlowEdge };

export function FlowDiagram({ still = false }: { still?: boolean }) {
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isStill = still || reducedMotion;
  return (
    <StillContext.Provider value={isStill}>
      <div className={`vf-flow${isStill ? ' still' : ''}`}>
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
      </div>
    </StillContext.Provider>
  );
}
