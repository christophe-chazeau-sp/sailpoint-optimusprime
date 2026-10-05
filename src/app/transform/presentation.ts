import { TransformGraph, TransformNodeModel } from './model/transform-graph';

export type CategoryTone = 'transform' | 'operation' | 'source' | 'neutral' | 'warning';

export interface NodePresentation {
  category: string;
  tone: CategoryTone;
  title: string;
  detail?: string;
}

export function presentNode(graph: TransformGraph, model: TransformNodeModel): NodePresentation {
  if (model.kind === 'implicit') {
    return { category: 'Input', tone: 'neutral', title: 'Implicit input', detail: model.summary };
  }
  if (model.kind === 'literal') {
    return { category: 'Literal', tone: 'neutral', title: `"${model.summary}"` };
  }

  const detail = (model.id === graph.rootId ? model.name : undefined) ?? model.summary;
  const base = { title: model.label, ...(detail ? { detail } : {}) };
  if (model.unknownType) {
    return { category: 'Unknown', tone: 'warning', ...base };
  }
  if (model.id === graph.rootId) {
    return { category: 'Transform', tone: 'transform', ...base };
  }
  const hasInputs = graph.edges.some((edge) => edge.targetId === model.id);
  return hasInputs
    ? { category: 'Operation', tone: 'operation', ...base }
    : { category: 'Source', tone: 'source', ...base };
}
