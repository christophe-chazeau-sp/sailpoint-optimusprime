import { blockInfo, knownAttributes } from '../catalog/blocks';
import { lookupOperation, usesImplicitInput } from '../catalog/operations';
import {
  JsonPath,
  OpenSlot,
  ParseResult,
  ScalarAttribute,
  TransformEdgeModel,
  TransformGraph,
  TransformNodeModel,
} from '../model/transform-graph';
import { ROOT_TREE, uidOf, Workspace } from '../workspace/workspace';

const TEMPLATE_KEYS = ['value', 'expression', 'positiveCondition', 'negativeCondition'];

interface ChildLink {
  key: string;
  label: string;
  childId: string;
}

/** A variable declared by a conditional, visible inside that conditional's branches. */
interface VariableBinding {
  name: string;
  sourceId: string;
}

const RESERVED_CONDITIONAL_KEYS = new Set(['expression', 'positiveCondition', 'negativeCondition']);
const VARIABLE_PATTERN = /\$!?\{?([A-Za-z_][\w-]*)\}?/g;

function validateRoot(value: unknown): string | null {
  if (Array.isArray(value)) {
    return 'Expected a single transform object.';
  }
  if (!isRecord(value)) {
    return 'A transform must be a JSON object.';
  }
  if (typeof value['type'] !== 'string') {
    return 'The transform is missing a string type.';
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'attributes') &&
    value['attributes'] !== undefined &&
    !isRecord(value['attributes'])
  ) {
    return 'The attributes property must be an object.';
  }
  return null;
}

export function parseTransform(value: unknown): ParseResult {
  const problem = validateRoot(value);
  if (problem) {
    return { ok: false, message: problem };
  }
  const builder = new GraphBuilder();
  const rootId = builder.walk(value as Record<string, unknown>, true);
  return { ok: true, graph: { rootId, nodes: builder.nodes, edges: builder.edges } };
}

/** The connected transform plus every floating block, in one graph. */
export function parseWorkspace(workspace: Workspace): ParseResult {
  const builder = new GraphBuilder();
  let rootId: string | null = null;
  if (workspace.document) {
    const problem = validateRoot(workspace.document);
    if (problem) {
      return { ok: false, message: problem };
    }
    rootId = builder.walk(workspace.document, true, [], [], ROOT_TREE);
  }
  for (const block of workspace.floating) {
    const id = builder.walk(block.value, false, [], [], block.id);
    const node = builder.nodes.find((item) => item.id === id);
    if (node) {
      node.floating = true;
    }
  }
  return { ok: true, graph: { rootId, nodes: builder.nodes, edges: builder.edges } };
}

class GraphBuilder {
  readonly nodes: TransformNodeModel[] = [];
  readonly edges: TransformEdgeModel[] = [];
  private readonly added = new Set<string>();
  private tree = ROOT_TREE;

  walk(
    value: Record<string, unknown>,
    isRoot: boolean,
    path: JsonPath = [],
    scope: VariableBinding[] = [],
    tree?: string,
  ): string {
    if (tree) {
      this.tree = tree;
    }
    const id = uidOf(value);
    if (this.added.has(id)) {
      return id;
    }
    this.added.add(id);

    const type = value['type'] as string;
    const attributes = isRecord(value['attributes']) ? value['attributes'] : {};
    const children: ChildLink[] = [];
    const scalars: ScalarAttribute[] = [];
    const branchScope =
      type === 'conditional' ? [...scope, ...this.conditionalBindings(id, attributes)] : scope;

    for (const [key, attribute] of Object.entries(attributes)) {
      const inBranch =
        type === 'conditional' && (key === 'positiveCondition' || key === 'negativeCondition');
      this.absorb(
        id,
        type,
        key,
        attribute,
        [...path, 'attributes', key],
        children,
        scalars,
        inBranch ? branchScope : scope,
      );
    }

    this.appendRootMetadata(value, isRoot, scalars);

    const operation = lookupOperation(type);
    if (usesImplicitInput(type, attributes)) {
      children.unshift({
        key: 'implicit',
        label: 'Implicit input',
        childId: this.addImplicit(id),
      });
    }

    const name = typeof value['name'] === 'string' ? value['name'] : undefined;
    const slots = openSlots(type, attributes, children);
    this.nodes.push({
      id,
      path,
      tree: this.tree,
      ...(slots.length ? { slots } : {}),
      kind: 'operation',
      type,
      label: operation?.label ?? humanize(type),
      ...(name ? { name } : {}),
      summary: buildSummary(scalars),
      ...(operation ? { description: operation.description } : {}),
      attributes: scalars,
      unknownType: !operation,
      ...velocityField(scalars),
      ...(usesVelocity(type, attributes) ? { usesVelocity: true } : {}),
    });

    for (const child of children) {
      this.edges.push({
        id: `${child.childId}>${id}:${child.key}`,
        sourceId: child.childId,
        targetId: id,
        inputKey: child.key,
        label: child.label,
      });
    }
    this.linkReferences(id, scalars, branchScope);

    return id;
  }

  private absorb(
    ownerId: string,
    parentType: string,
    key: string,
    attribute: unknown,
    path: JsonPath,
    children: ChildLink[],
    scalars: ScalarAttribute[],
    scope: VariableBinding[],
  ): void {
    if (
      parentType === 'conditional' &&
      (key === 'positiveCondition' || key === 'negativeCondition') &&
      !isTransform(attribute)
    ) {
      const childId = this.addLiteral(attribute, path, `${ownerId}:${key}`);
      children.push({ key, label: key, childId });
      this.linkReferences(childId, [{ key: 'value', value: formatConfig(attribute) }], scope);
      return;
    }

    if (Array.isArray(attribute)) {
      if (attribute.length === 0) {
        scalars.push({ key, value: '[]' });
        return;
      }
      attribute.forEach((item, index) => {
        const label = `${key}[${index}]`;
        const itemPath = [...path, index];
        const childId = isTransform(item)
          ? this.walk(item, false, itemPath, scope)
          : this.addLiteral(item, itemPath, `${ownerId}:${label}`);
        if (!isTransform(item)) {
          this.linkReferences(childId, [{ key: 'value', value: formatConfig(item) }], scope);
        }
        children.push({ key: label, label, childId });
      });
      return;
    }

    if (isTransform(attribute)) {
      children.push({ key, label: key, childId: this.walk(attribute, false, path, scope) });
      return;
    }

    scalars.push({ key, value: formatConfig(attribute) });
  }

  /** Extra conditional attributes are variables. Their names are in scope inside the branches. */
  private conditionalBindings(
    sourceId: string,
    attributes: Record<string, unknown>,
  ): VariableBinding[] {
    return Object.keys(attributes)
      .filter((key) => !RESERVED_CONDITIONAL_KEYS.has(key))
      .map((name) => ({ name, sourceId }));
  }

  /** Draws `$name` back to the conditional that declared it. A node does not point at itself. */
  private linkReferences(targetId: string, scalars: ScalarAttribute[], scope: VariableBinding[]): void {
    const seen = new Set<string>();
    for (const scalar of scalars) {
      for (const name of variableNames(scalar.value)) {
        if (seen.has(name)) {
          continue;
        }
        const binding = [...scope].reverse().find((item) => item.name === name);
        if (!binding || binding.sourceId === targetId) {
          continue;
        }
        seen.add(name);
        this.edges.push({
          id: `${binding.sourceId}>${targetId}:$${name}`,
          sourceId: binding.sourceId,
          targetId,
          inputKey: `$${name}`,
          label: `$${name}`,
          reference: true,
        });
      }
    }
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

  private addLiteral(value: unknown, path: JsonPath, id: string): string {
    const text = formatConfig(value);
    this.nodes.push({
      id,
      path,
      tree: this.tree,
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

  private addImplicit(ownerId: string): string {
    const id = `${ownerId}:implicit`;
    this.nodes.push({
      id,
      tree: this.tree,
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
}

/** Inputs a user can still plug a block into: empty slots, slots holding a plain value, and list ends. */
function openSlots(type: string, attributes: Record<string, unknown>, children: ChildLink[]): OpenSlot[] {
  const info = blockInfo(type);
  if (!info) {
    return [];
  }
  const taken = new Set(children.map((child) => child.key));
  const slots: OpenSlot[] = [];
  const single = (key: string, value: unknown) => {
    if (taken.has(key) || (key === 'input' && taken.has('implicit')) || isTransform(value)) {
      return;
    }
    slots.push({ key, label: key, ...(value === undefined ? {} : { value: formatConfig(value) }) });
  };
  for (const slot of info.slots) {
    if (slot.multiple) {
      slots.push({ key: `${slot.key}[+]`, label: `${slot.key} +` });
    } else {
      single(slot.key, attributes[slot.key]);
    }
  }
  if (info.variables) {
    const known = knownAttributes(info);
    for (const [key, value] of Object.entries(attributes)) {
      if (!known.has(key)) {
        single(key, value);
      }
    }
  }
  return slots;
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

const VELOCITY_TYPES = new Set(['static', 'conditional', 'usernameGenerator']);

/** Velocity-rendered types, or a step with a $reference or #set / #if in one of its own text values. */
function usesVelocity(type: string, attributes: Record<string, unknown>): boolean {
  if (VELOCITY_TYPES.has(type)) {
    return true;
  }
  const texts = Object.values(attributes).flatMap((value) => (Array.isArray(value) ? value : [value]));
  return texts.some(
    (text) => typeof text === 'string' && (/\$!?\{?[A-Za-z_]/.test(text) || /#\{?(?:set|if|foreach)\b/.test(text)),
  );
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

function variableNames(text: string): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1]);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

export function graphNode(graph: TransformGraph, id: string | null): TransformNodeModel | undefined {
  return graph.nodes.find((node) => node.id === id);
}
