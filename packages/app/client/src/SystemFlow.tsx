import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function label(title: string, detail: string) {
  return (
    <div className="flow-node-content">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

const initialNodes: Node[] = [
  {
    id: 'mobile',
    type: 'input',
    position: { x: 0, y: 170 },
    data: { label: label('Mobile capture', 'Image capture') },
    className: 'flow-node capture',
  },
  {
    id: 'app',
    position: { x: 260, y: 170 },
    data: { label: label('Databricks App', 'Vision Flow capture and orchestration') },
    className: 'flow-node app',
  },
  {
    id: 'postgres',
    position: { x: 260, y: 360 },
    data: { label: label('Lakebase Postgres', 'Schemas, prompts, and activity') },
    className: 'flow-node state',
  },
  {
    id: 'quick-model',
    position: { x: 545, y: 40 },
    data: { label: label('Validation endpoint', 'Databricks Model Serving') },
    className: 'flow-node model',
  },
  {
    id: 'volume',
    position: { x: 545, y: 170 },
    data: { label: label('Unity Catalog volume', 'Source images') },
    className: 'flow-node storage',
  },
  {
    id: 'pipeline',
    position: { x: 820, y: 170 },
    data: { label: label('Lakeflow pipeline', 'Continuous processing') },
    className: 'flow-node pipeline',
  },
  {
    id: 'strong-model',
    position: { x: 820, y: 40 },
    data: { label: label('Extraction endpoint', 'Databricks Model Serving') },
    className: 'flow-node model',
  },
  {
    id: 'delta',
    position: { x: 1090, y: 170 },
    data: { label: label('Delta table', 'Structured results') },
    className: 'flow-node storage',
  },
  {
    id: 'dashboard',
    type: 'output',
    position: { x: 1360, y: 80 },
    data: { label: label('AI/BI dashboard', 'Analytics') },
    className: 'flow-node output',
  },
  {
    id: 'genie',
    type: 'output',
    position: { x: 1360, y: 260 },
    data: { label: label('Genie', 'Natural-language analysis') },
    className: 'flow-node output',
  },
];

const arrow = { type: MarkerType.ArrowClosed };

const edges: Edge[] = [
  { id: 'mobile-app', source: 'mobile', target: 'app', label: 'image', markerEnd: arrow, animated: true },
  { id: 'postgres-app', source: 'postgres', target: 'app', label: 'schema', markerEnd: arrow, animated: true },
  {
    id: 'app-postgres',
    source: 'app',
    target: 'postgres',
    label: 'activity',
    markerEnd: arrow,
    animated: true,
  },
  { id: 'app-quick', source: 'app', target: 'quick-model', label: 'validation', markerEnd: arrow, animated: true },
  {
    id: 'quick-volume',
    source: 'quick-model',
    target: 'volume',
    label: 'accepted',
    markerEnd: arrow,
    animated: true,
  },
  { id: 'volume-pipeline', source: 'volume', target: 'pipeline', label: 'images', markerEnd: arrow, animated: true },
  {
    id: 'postgres-pipeline',
    source: 'postgres',
    target: 'pipeline',
    label: 'schemas',
    markerEnd: arrow,
    animated: true,
  },
  {
    id: 'pipeline-model',
    source: 'pipeline',
    target: 'strong-model',
    label: 'extraction',
    markerEnd: arrow,
    animated: true,
  },
  {
    id: 'model-delta',
    source: 'strong-model',
    target: 'delta',
    label: 'results',
    markerEnd: arrow,
    animated: true,
  },
  { id: 'delta-dashboard', source: 'delta', target: 'dashboard', label: 'analytics', markerEnd: arrow, animated: true },
  {
    id: 'delta-genie',
    source: 'delta',
    target: 'genie',
    label: 'questions',
    markerEnd: arrow,
    animated: true,
  },
  {
    id: 'postgres-genie',
    source: 'postgres',
    target: 'genie',
    label: 'context',
    markerEnd: arrow,
    animated: true,
  },
];

export function SystemFlow() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="system-flow" aria-label="Vision Flow system architecture">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.45}
        maxZoom={1.5}
        onNodesChange={onNodesChange}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
