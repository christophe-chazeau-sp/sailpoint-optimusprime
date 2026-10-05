import { TransformGraph } from './model/transform-graph';

/** Later: read a transform from an Identity Security Cloud tenant. */
export interface TransformSource {
  read(id: string): Promise<unknown>;
}

/** Later: evaluate a transform against sample identity or account data. */
export interface TransformEvaluator {
  evaluate(graph: TransformGraph, context: Record<string, unknown>): Promise<unknown>;
}
