export type TransformNodeKind = 'operation' | 'literal' | 'implicit';

export interface ScalarAttribute {
  key: string;
  value: string;
}

export type JsonPath = (string | number)[];

/** An input of a block with nothing plugged in yet: empty, holding a plain value, or a list's next item. */
export interface OpenSlot {
  /** Input key on the canvas, such as `input`, `firstDate` or `values[+]`. */
  key: string;
  label: string;
  /** Plain value currently in the slot. */
  value?: string;
}

export interface TransformNodeModel {
  id: string;
  /** Location in its tree; absent for nodes that have no JSON of their own. */
  path?: JsonPath;
  /** Which tree the node belongs to: the connected transform, or a floating block's id. */
  tree?: string;
  /** Top block of a tree that is not connected to the transform output. */
  floating?: boolean;
  slots?: OpenSlot[];
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
  /** Null when no block is connected to the transform output. */
  rootId: string | null;
  nodes: TransformNodeModel[];
  edges: TransformEdgeModel[];
}

export type ParseResult =
  | { ok: true; graph: TransformGraph }
  | { ok: false; message: string };
