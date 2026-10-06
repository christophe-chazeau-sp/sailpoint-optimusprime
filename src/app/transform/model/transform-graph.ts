export type TransformNodeKind = 'operation' | 'literal' | 'implicit';

export interface ScalarAttribute {
  key: string;
  value: string;
}

export type JsonPath = (string | number)[];

export interface TransformNodeModel {
  id: string;
  /** Location in the source document; absent for nodes that have no JSON of their own. */
  path?: JsonPath;
  kind: TransformNodeKind;
  type: string;
  label: string;
  name?: string;
  summary: string;
  description?: string;
  attributes: ScalarAttribute[];
  unknownType: boolean;
  velocityTemplate?: string;
  /** The step is calculated with Velocity, whose local rendering may differ from the tenant's. */
  usesVelocity?: boolean;
}

export interface TransformEdgeModel {
  id: string;
  sourceId: string;
  targetId: string;
  inputKey: string;
  label: string;
  /** The target reads a variable declared by the source conditional. */
  reference?: boolean;
}

export interface TransformGraph {
  rootId: string;
  nodes: TransformNodeModel[];
  edges: TransformEdgeModel[];
}

export type ParseResult =
  | { ok: true; graph: TransformGraph }
  | { ok: false; message: string };
