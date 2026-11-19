/** React Flow diagrams used by the two flow slides in the Info tab. */
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

interface FlowNodeConfig {
  readonly body: ReactNode;
  readonly delay: number;
  readonly label: string;
  readonly title: string;
  readonly tone?: 'accent' | 'dark';
}

type FlowNodeData = FlowNodeConfig & { readonly still: boolean } & Record<string, unknown>;
type FlowNode = Node<FlowNodeData, 'flowNode'>;

function FlowNodeCard({ data }: NodeProps<FlowNode>) {
  const reducedMotion = useReducedMotion();
  const animate = !data.still && !reducedMotion;

  return (
    <motion.article
      className={`vf-flow-node${data.tone ? ` ${data.tone}` : ''}`}
      initial={animate ? { opacity: 0, scale: 0.96, y: 18 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: data.delay, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="vf-flow-node-label">{data.label}</span>
      <h3>{data.title}</h3>
      <div className="vf-flow-node-body">{data.body}</div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </motion.article>
  );
}

const nodeTypes = { flowNode: FlowNodeCard };

function node(id: string, x: number, y: number, width: number, data: FlowNodeConfig, still: boolean): FlowNode {
  return {
    id,
    type: 'flowNode',
    position: { x, y },
    style: { width },
    data: { ...data, still },
  };
}

function edge(id: string, source: string, target: string, still: boolean, accent = false): Edge {
  const color = accent ? '#ff3621' : '#1b3139';
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: !still,
    className: accent ? 'accent' : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, width: 22, height: 22, color },
  };
}

function FieldList() {
  return (
    <div className="vf-flow-field-list">
      <span>State</span>
      <span>Dates</span>
      <span>Line items</span>
      <span>Quantities and amounts</span>
    </div>
  );
}

function ReceiptPreview() {
  return (
    <div className="vf-flow-receipt" aria-hidden="true">
      <strong>LOTTERY</strong>
      <i />
      <i />
      <i />
      <b>$10.00</b>
    </div>
  );
}

function Diagram({ nodes, edges }: { nodes: FlowNode[]; edges: Edge[] }) {
  return (
    <ReactFlow<FlowNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.06, minZoom: 0.8, maxZoom: 1 }}
      minZoom={0.8}
      maxZoom={1}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
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

export function PromptFlowDiagram({ still = false }: { still?: boolean }) {
  const nodes: FlowNode[] = [
    node(
      'prompt',
      20,
      190,
      330,
      {
        label: 'Prompt',
        title: 'Describe the receipt',
        body: <p>Collect the state, dates, line items, quantities, and amounts.</p>,
        delay: 0,
      },
      still
    ),
    node(
      'fields',
      440,
      150,
      350,
      {
        label: 'Fields',
        title: 'Define what to collect',
        body: <FieldList />,
        delay: 0.18,
        tone: 'dark',
      },
      still
    ),
    node(
      'capture',
      880,
      190,
      320,
      {
        label: 'Capture flow',
        title: 'Check and extract',
        body: <p>The same flow handles the quick document match and the detailed read.</p>,
        delay: 0.36,
      },
      still
    ),
    node(
      'dashboard',
      1300,
      80,
      300,
      {
        label: 'View',
        title: 'Dashboard',
        body: <p>Show totals and receipts that need review.</p>,
        delay: 0.54,
        tone: 'accent',
      },
      still
    ),
    node(
      'genie',
      1300,
      370,
      300,
      {
        label: 'Ask',
        title: 'Genie',
        body: <p>Answer questions about the extracted receipts.</p>,
        delay: 0.62,
        tone: 'accent',
      },
      still
    ),
  ];

  const edges = [
    edge('prompt-fields', 'prompt', 'fields', still),
    edge('fields-capture', 'fields', 'capture', still),
    edge('capture-dashboard', 'capture', 'dashboard', still, true),
    edge('capture-genie', 'capture', 'genie', still, true),
  ];

  return <Diagram nodes={nodes} edges={edges} />;
}

export function ImageFlowDiagram({ still = false }: { still?: boolean }) {
  const nodes: FlowNode[] = [
    node(
      'image',
      20,
      180,
      270,
      {
        label: '1',
        title: 'Receipt image',
        body: <ReceiptPreview />,
        delay: 0,
      },
      still
    ),
    node(
      'match',
      380,
      180,
      300,
      {
        label: '2',
        title: 'Quick match',
        body: <p>Confirm that the image is a lottery receipt.</p>,
        delay: 0.18,
      },
      still
    ),
    node(
      'extract',
      780,
      160,
      350,
      {
        label: '3',
        title: 'Extract the receipt',
        body: <p>Read each requested field and return a confidence score.</p>,
        delay: 0.36,
        tone: 'dark',
      },
      still
    ),
    node(
      'dashboard',
      1260,
      70,
      330,
      {
        label: '4',
        title: 'Dashboard',
        body: <p>Review totals, trends, and exceptions.</p>,
        delay: 0.54,
        tone: 'accent',
      },
      still
    ),
    node(
      'genie',
      1260,
      370,
      330,
      {
        label: '4',
        title: 'Genie',
        body: <p>Ask questions about the same receipt data.</p>,
        delay: 0.62,
        tone: 'accent',
      },
      still
    ),
  ];

  const edges = [
    edge('image-match', 'image', 'match', still),
    edge('match-extract', 'match', 'extract', still),
    edge('extract-dashboard', 'extract', 'dashboard', still, true),
    edge('extract-genie', 'extract', 'genie', still, true),
  ];

  return <Diagram nodes={nodes} edges={edges} />;
}
