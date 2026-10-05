import { lookupOperation } from '../catalog/operations';
import {
  JsonPath,
  ParseResult,
  ScalarAttribute,
  TransformEdgeModel,
  TransformGraph,
  TransformNodeModel,
} from '../model/transform-graph';

const TEMPLATE_KEYS = ['value', 'expression', 'positiveCondition', 'negativeCondition'];

interface ChildLink {
  key: string;
  label: string;
  childId: string;
}

export function parseTransform(value: unknown): ParseResult {
  if (Array.isArray(value)) {
    return { ok: false, message: 'Expected a single transform object.' };
  }
  if (!isRecord(value)) {
    return { ok: false, message: 'A transform must be a JSON object.' };
  }
  if (typeof value['type'] !== 'string') {
    return { ok: false, message: 'The transform is missing a string type.' };
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'attributes') &&
    value['attributes'] !== undefined &&
    !isRecord(value['attributes'])
  ) {
    return { ok: false, message: 'The attributes property must be an object.' };
  }

  const builder = new GraphBuilder();
  const rootId = builder.walk(value, true);
  return { ok: true, graph: { rootId, nodes: builder.nodes, edges: builder.edges } };
}

class GraphBuilder {
  readonly nodes: TransformNodeModel[] = [];
  readonly edges: TransformEdgeModel[] = [];
  private readonly ids = new WeakMap<object, string>();
  private nodeCount = 0;
  private edgeCount = 0;

  walk(value: Record<string, unknown>, isRoot: boolean, path: JsonPath = []): string {
    const existing = this.ids.get(value);
    if (existing) {
      return existing;
    }

    const id = this.nextNodeId();
    this.ids.set(value, id);

    const type = value['type'] as string;
    const attributes = isRecord(value['attributes']) ? value['attributes'] : {};
    const children: ChildLink[] = [];
    const scalars: ScalarAttribute[] = [];

    for (const [key, attribute] of Object.entries(attributes)) {
      this.absorb(key, attribute, [...path, 'attributes', key], children, scalars);
    }

    this.appendRootMetadata(value, isRoot, scalars);

    const operation = lookupOperation(type);
    const hasExplicitInput = Object.prototype.hasOwnProperty.call(attributes, 'input');
    if (operation?.consumesInput && !hasExplicitInput) {
      children.unshift({
        key: 'implicit',
        label: 'Implicit input',
        childId: this.addImplicit(),
      });
    }

    const name = typeof value['name'] === 'string' ? value['name'] : undefined;
    this.nodes.push({
      id,
      path,
      kind: 'operation',
      type,
      label: operation?.label ?? humanize(type),
      ...(name ? { name } : {}),
      summary: buildSummary(scalars),
      ...(operation ? { description: operation.description } : {}),
      attributes: scalars,
      unknownType: !operation,
      ...velocityField(scalars),
    });

    for (const child of children) {
      this.edges.push({
        id: this.nextEdgeId(),
        sourceId: child.childId,
        targetId: id,
        inputKey: child.key,
        label: child.label,
      });
    }

    return id;
  }

  private absorb(
    key: string,
    attribute: unknown,
    path: JsonPath,
    children: ChildLink[],
    scalars: ScalarAttribute[],
  ): void {
    if (Array.isArray(attribute)) {
      if (attribute.length === 0) {
        scalars.push({ key, value: '[]' });
        return;
      }
      attribute.forEach((item, index) => {
        const label = `${key}[${index}]`;
        const itemPath = [...path, index];
        children.push({
          key: label,
          label,
          childId: isTransform(item)
            ? this.walk(item, false, itemPath)
            : this.addLiteral(item, itemPath),
        });
      });
      return;
    }

    if (isTransform(attribute)) {
      children.push({ key, label: key, childId: this.walk(attribute, false, path) });
      return;
    }

    scalars.push({ key, value: formatConfig(attribute) });
  }

  private appendRootMetadata(
    value: Record<string, unknown>,
    isRoot: boolean,
    scalars: ScalarAttribute[],
  ): void {
    if (!isRoot) {
      return;
    }
    if (typeof value['id'] === 'string') {
      scalars.unshift({ key: 'id', value: value['id'] });
    }
    if (typeof value['internal'] === 'boolean') {
      scalars.push({ key: 'internal', value: String(value['internal']) });
    }
    if (typeof value['requiresPeriodicRefresh'] === 'boolean') {
      scalars.push({
        key: 'requiresPeriodicRefresh',
        value: String(value['requiresPeriodicRefresh']),
      });
    }
  }

  private addLiteral(value: unknown, path: JsonPath): string {
    const id = this.nextNodeId();
    const text = formatConfig(value);
    this.nodes.push({
      id,
      path,
      kind: 'literal',
      type: 'literal',
      label: 'Literal',
      summary: truncate(text, 80),
      description: 'A fixed value used as an input.',
      attributes: [{ key: 'value', value: text }],
      unknownType: false,
    });
    return id;
  }

  private addImplicit(): string {
    const id = this.nextNodeId();
    this.nodes.push({
      id,
      kind: 'implicit',
      type: 'implicit',
      label: 'Implicit input',
      summary: 'Identity or account profile',
      description:
        'Value supplied by the identity profile or account profile when the transform does not name an input.',
      attributes: [],
      unknownType: false,
    });
    return id;
  }

  private nextNodeId(): string {
    this.nodeCount += 1;
    return `n${this.nodeCount}`;
  }

  private nextEdgeId(): string {
    this.edgeCount += 1;
    return `e${this.edgeCount}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTransform(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value['type'] === 'string';
}

function formatConfig(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value);
}

function buildSummary(scalars: ScalarAttribute[]): string {
  return scalars
    .slice(0, 3)
    .map((item) => `${item.key}: ${truncate(item.value, 36)}`)
    .join(' · ');
}

function velocityField(scalars: ScalarAttribute[]): { velocityTemplate?: string } {
  for (const key of TEMPLATE_KEYS) {
    const found = scalars.find((item) => item.key === key);
    if (found && (found.value.includes('$') || found.value.includes('#'))) {
      return { velocityTemplate: found.value };
    }
  }
  return {};
}

function humanize(type: string): string {
  const spaced = type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

export function graphNode(graph: TransformGraph, id: string): TransformNodeModel | undefined {
  return graph.nodes.find((node) => node.id === id);
}
