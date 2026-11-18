import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function label(title: string, detail: string) {
  return (
    <div className="flow-node-content">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

const nodes: Node[] = [
  {
    id: 'mobile',
    type: 'input',
    position: { x: 0, y: 170 },
    data: { label: label('Mobile capture', 'Schema-selected image and focus guide') },
    className: 'flow-node capture',
  },
  {
    id: 'app',
    position: { x: 260, y: 170 },
    data: { label: label('Vision Flow app', 'OBO access with service-principal fallback') },
    className: 'flow-node app',
  },
  {
    id: 'postgres',
    position: { x: 260, y: 360 },
    data: { label: label('Lakebase Postgres', 'Schemas, prompts, Mastra memory, activity bus') },
    className: 'flow-node state',
  },
  {
    id: 'quick-model',
    position: { x: 545, y: 40 },
    data: { label: label('Vision model', 'Fast image and required-field validation') },
    className: 'flow-node model',
  },
  {
    id: 'volume',
    position: { x: 545, y: 170 },
    data: { label: label('Unity Catalog volume', 'Accepted source images') },
    className: 'flow-node storage',
  },
  {
    id: 'pipeline',
    position: { x: 820, y: 170 },
    data: { label: label('Lakeflow pipeline', 'Continuous image processing') },
    className: 'flow-node pipeline',
  },
  {
    id: 'strong-model',
    position: { x: 820, y: 40 },
    data: { label: label('Extraction model', 'Schema-constrained structured output') },
    className: 'flow-node model',
  },
  {
    id: 'delta',
    position: { x: 1090, y: 170 },
    data: { label: label('Delta table', 'Governed results, confidence, review status') },
    className: 'flow-node storage',
  },
  {
    id: 'dashboard',
    type: 'output',
    position: { x: 1360, y: 80 },
    data: { label: label('AI/BI dashboard', 'Schema-specific analysis pages') },
    className: 'flow-node output',
  },
  {
    id: 'assistant',
    type: 'output',
    position: { x: 1360, y: 260 },
    data: { label: label('Mastra + Genie', 'Natural-language analysis with SQL evidence') },
    className: 'flow-node output',
  },
];

const arrow = { type: MarkerType.ArrowClosed };

const edges: Edge[] = [
  { id: 'mobile-app', source: 'mobile', target: 'app', label: 'image + schema', markerEnd: arrow },
  { id: 'postgres-app', source: 'postgres', target: 'app', label: 'active contract', markerEnd: arrow },
  { id: 'app-postgres', source: 'app', target: 'postgres', label: 'prompts + events', markerEnd: arrow },
  { id: 'app-quick', source: 'app', target: 'quick-model', label: 'validate', markerEnd: arrow },
  { id: 'quick-volume', source: 'quick-model', target: 'volume', label: 'accepted image', markerEnd: arrow },
  { id: 'volume-pipeline', source: 'volume', target: 'pipeline', label: 'new file', markerEnd: arrow },
  { id: 'postgres-pipeline', source: 'postgres', target: 'pipeline', label: 'schema registry', markerEnd: arrow },
  { id: 'pipeline-model', source: 'pipeline', target: 'strong-model', label: 'image + contract', markerEnd: arrow },
  { id: 'model-delta', source: 'strong-model', target: 'delta', label: 'typed payload', markerEnd: arrow },
  { id: 'delta-dashboard', source: 'delta', target: 'dashboard', label: 'SQL', markerEnd: arrow },
  { id: 'delta-assistant', source: 'delta', target: 'assistant', label: 'Genie queries', markerEnd: arrow },
  { id: 'postgres-assistant', source: 'postgres', target: 'assistant', label: 'threads + context', markerEnd: arrow },
];

export function SystemFlow() {
  return (
    <div className="system-flow" aria-label="Vision Flow system architecture">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.45}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
