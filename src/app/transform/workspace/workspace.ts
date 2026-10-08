import { applyEdits, FormattingOptions, modify } from 'jsonc-parser';
import { JsonPath } from '../model/transform-graph';

export type TransformObject = Record<string, unknown>;

/** A block that is on the canvas but not wired into the transform yet. */
export interface FloatingBlock {
  id: string;
  value: TransformObject;
}

/**
 * Everything being edited: the connected transform, which is what the JSON editor shows, and the
 * blocks that float on the canvas. The text and the document always describe the same transform.
 */
export interface Workspace {
  /** JSON editor text; empty when there is no connected transform. */
  text: string;
  document: TransformObject | null;
  floating: FloatingBlock[];
  /** Name, id and flags of a transform whose root was unplugged, kept for the next root. */
  rootMeta?: TransformObject;
}

export const ROOT_TREE = 'root';

/** A value inside one tree: the connected transform ({@link ROOT_TREE}) or a floating block's id. */
export interface Address {
  tree: string;
  path: JsonPath;
}

/** An attribute of a block that receives a value. */
export interface SlotTarget {
  block: Address;
  key: string;
  /** Position in a list attribute: replace that item, or append when 'append'. */
  index?: number | 'append';
}

export type EditResult = { ok: true; workspace: Workspace } | { ok: false; message: string };

const ROOT_META_KEYS = ['name', 'id', 'internal', 'requiresPeriodicRefresh'];
const DEFAULT_NAME = 'New transform';
const FORMAT: FormattingOptions = { insertSpaces: true, tabSize: 2, eol: '\n' };

const uids = new WeakMap<object, string>();
let uidCounter = 0;
let floatingCounter = 0;

/** Stable identity of a block object. Edits copy it onto the objects they rebuild. */
export function uidOf(value: object): string {
  let uid = uids.get(value);
  if (!uid) {
    uidCounter += 1;
    uid = `b${uidCounter}`;
    uids.set(value, uid);
  }
  return uid;
}

function adopt(next: object, previous: object): void {
  const uid = uids.get(previous);
  if (uid) {
    uids.set(next, uid);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTransform(value: unknown): value is TransformObject {
  return isRecord(value) && typeof value['type'] === 'string';
}

export function emptyWorkspace(): Workspace {
  return { text: '', document: null, floating: [] };
}

/**
 * Reads the editor text. Blocks keep the identity of the previous document's block at the same
 * place with the same type, so typing in the JSON does not move boxes around.
 */
export function workspaceFromText(
  text: string,
  previous?: Workspace,
): { ok: true; workspace: Workspace } | { ok: false; message: string } {
  const floating = previous?.floating ?? [];
  if (!text.trim()) {
    return { ok: true, workspace: { text, document: null, floating, rootMeta: previous?.rootMeta } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The document is not valid JSON.' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, message: 'A transform must be a JSON object.' };
  }
  if (previous?.document) {
    inheritUids(parsed, previous.document);
  }
  return { ok: true, workspace: { text, document: parsed, floating } };
}

function inheritUids(next: unknown, previous: unknown): void {
  if (Array.isArray(next) && Array.isArray(previous)) {
    next.forEach((item, index) => inheritUids(item, previous[index]));
    return;
  }
  if (!isRecord(next) || !isRecord(previous)) {
    return;
  }
  if (isTransform(next) && isTransform(previous) && next['type'] === previous['type']) {
    adopt(next, previous);
  }
  for (const [key, value] of Object.entries(next)) {
    inheritUids(value, previous[key]);
  }
}

export function treeValue(workspace: Workspace, tree: string): TransformObject | null {
  if (tree === ROOT_TREE) {
    return workspace.document;
  }
  return workspace.floating.find((block) => block.id === tree)?.value ?? null;
}

export function valueAt(workspace: Workspace, address: Address): unknown {
  let value: unknown = treeValue(workspace, address.tree);
  for (const part of address.path) {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string | number, unknown>)[part];
  }
  return value;
}

/** Puts a new block on the canvas, not connected to anything. */
export function addFloating(workspace: Workspace, value: TransformObject): Workspace {
  floatingCounter += 1;
  return { ...workspace, floating: [...workspace.floating, { id: `f${floatingCounter}`, value }] };
}

/** Wires a block or value into a slot of another block. A value already there is unplugged. */
export function connect(workspace: Workspace, source: Address, target: SlotTarget): EditResult {
  const value = valueAt(workspace, source);
  if (value === undefined) {
    return { ok: false, message: 'That block no longer exists.' };
  }
  if (source.tree === target.block.tree && startsWith(target.block.path, source.path)) {
    return { ok: false, message: "A block can't feed into itself or into one of its own inputs." };
  }
  if (!isTransform(valueAt(workspace, target.block))) {
    return { ok: false, message: 'Values can only be connected to a block.' };
  }

  let next = detach(workspace, source);
  let placed = value;
  if (source.tree === ROOT_TREE && source.path.length === 0 && isTransform(value)) {
    const stripped = stripMeta(value);
    placed = stripped.value;
    next = { ...next, rootMeta: { ...next.rootMeta, ...stripped.meta } };
  }
  const block = adjustAfterRemoval(source, target.block);
  next = place(next, { ...target, block }, placed);
  return { ok: true, workspace: next };
}

/** Makes a block the transform's output. The previous output block floats on the canvas. */
export function setRoot(workspace: Workspace, source: Address): EditResult {
  if (source.tree === ROOT_TREE && source.path.length === 0) {
    return { ok: true, workspace };
  }
  const value = valueAt(workspace, source);
  if (!isTransform(value)) {
    return { ok: false, message: 'Only a block can be the transform output.' };
  }
  let next = detach(workspace, source);
  const previousRoot = next.document;
  let meta = next.rootMeta ?? {};
  if (previousRoot) {
    const stripped = stripMeta(previousRoot);
    meta = { ...meta, ...stripped.meta };
    next = addFloating({ ...next, document: null, text: '' }, stripped.value);
  }
  const { value: plain } = stripMeta(value);
  const named = typeof meta['name'] === 'string' ? meta : { ...meta, name: DEFAULT_NAME };
  const root: TransformObject = { ...pickMeta(named), ...plain };
  adopt(root, value);
  return {
    ok: true,
    workspace: { ...next, document: root, text: JSON.stringify(root, null, 2), rootMeta: undefined },
  };
}

/** Unplugs whatever sits in a slot. A block floats on the canvas; a plain value is removed. */
export function disconnect(workspace: Workspace, slot: Address): EditResult {
  const value = valueAt(workspace, slot);
  if (value === undefined) {
    return { ok: true, workspace };
  }
  let next = detach(workspace, slot);
  if (isTransform(value)) {
    next = addFloating(next, value);
  }
  return { ok: true, workspace: next };
}

/** Unplugs the transform's output block, leaving it on the canvas. */
export function unsetRoot(workspace: Workspace): EditResult {
  const root = workspace.document;
  if (!root) {
    return { ok: true, workspace };
  }
  const stripped = stripMeta(root);
  return {
    ok: true,
    workspace: addFloating(
      { ...workspace, document: null, text: '', rootMeta: { ...workspace.rootMeta, ...stripped.meta } },
      stripped.value,
    ),
  };
}

/** Removes a block. Blocks plugged into it stay on the canvas instead of disappearing with it. */
export function deleteAt(workspace: Workspace, address: Address): EditResult {
  const value = valueAt(workspace, address);
  if (value === undefined) {
    return { ok: true, workspace };
  }
  let next = detach(workspace, address);
  if (isTransform(value)) {
    if (address.tree === ROOT_TREE && address.path.length === 0) {
      next = { ...next, rootMeta: { ...next.rootMeta, ...stripMeta(value).meta } };
    }
    for (const child of childBlocks(value)) {
      next = addFloating(next, child);
    }
  }
  return { ok: true, workspace: next };
}

/**
 * Replaces a block's configuration. Only the attributes that changed are rewritten in the text,
 * so the rest of the document keeps its formatting.
 */
export function updateBlock(workspace: Workspace, address: Address, nextValue: TransformObject): EditResult {
  const current = valueAt(workspace, address);
  if (!isTransform(current)) {
    return { ok: false, message: 'That block no longer exists.' };
  }
  let next = workspace;
  for (const key of new Set([...Object.keys(current), ...Object.keys(nextValue)])) {
    if (key === 'attributes') {
      continue;
    }
    if (!sameJson(current[key], nextValue[key])) {
      next = applyEdit(next, address.tree, [...address.path, key], nextValue[key]);
    }
  }
  const before = isRecord(current['attributes']) ? current['attributes'] : {};
  const after = isRecord(nextValue['attributes']) ? nextValue['attributes'] : {};
  if (!isRecord(current['attributes']) && Object.keys(after).length > 0) {
    next = applyEdit(next, address.tree, [...address.path, 'attributes'], after);
  } else {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[key] !== after[key] && !sameJson(before[key], after[key])) {
        next = applyEdit(next, address.tree, [...address.path, 'attributes', key], after[key]);
      }
    }
  }
  return { ok: true, workspace: next };
}

/** Sets a plain value, such as a literal inside a list. */
export function setValue(workspace: Workspace, address: Address, value: unknown): EditResult {
  if (valueAt(workspace, address) === undefined) {
    return { ok: false, message: 'That value no longer exists.' };
  }
  return { ok: true, workspace: applyEdit(workspace, address.tree, address.path, value) };
}

/** Blocks plugged directly into a block's attributes. */
export function childBlocks(value: TransformObject): TransformObject[] {
  const attributes = isRecord(value['attributes']) ? value['attributes'] : {};
  return Object.values(attributes).flatMap((attribute) =>
    Array.isArray(attribute) ? attribute.filter(isTransform) : isTransform(attribute) ? [attribute] : [],
  );
}

function detach(workspace: Workspace, address: Address): Workspace {
  if (address.path.length === 0) {
    if (address.tree === ROOT_TREE) {
      return { ...workspace, document: null, text: '' };
    }
    return { ...workspace, floating: workspace.floating.filter((block) => block.id !== address.tree) };
  }
  return applyEdit(workspace, address.tree, address.path, undefined);
}

function place(workspace: Workspace, target: SlotTarget, value: unknown): Workspace {
  const block = valueAt(workspace, target.block) as TransformObject;
  const attributes = isRecord(block['attributes']) ? block['attributes'] : undefined;
  const slotPath = [...target.block.path, 'attributes', target.key];
  const current = attributes?.[target.key];
  let next = workspace;

  if (target.index === undefined) {
    if (isTransform(current)) {
      next = addFloating(next, current);
    }
    return applyEdit(next, target.block.tree, slotPath, value);
  }
  if (!Array.isArray(current)) {
    return applyEdit(next, target.block.tree, slotPath, [value]);
  }
  if (target.index === 'append' || target.index >= current.length) {
    return applyEdit(next, target.block.tree, [...slotPath, current.length], value, true);
  }
  const occupant = current[target.index];
  if (isTransform(occupant)) {
    next = addFloating(next, occupant);
  }
  return applyEdit(next, target.block.tree, [...slotPath, target.index], value);
}

/** Where an address points once the value at `removed` has been taken out of the same tree. */
function adjustAfterRemoval(removed: Address, address: Address): Address {
  if (removed.tree !== address.tree || removed.path.length === 0) {
    return address;
  }
  const parent = removed.path.slice(0, -1);
  const index = removed.path[removed.path.length - 1];
  if (typeof index !== 'number' || !startsWith(address.path, parent) || address.path.length <= parent.length) {
    return address;
  }
  const step = address.path[parent.length];
  if (typeof step !== 'number' || step <= index) {
    return address;
  }
  const path = [...address.path];
  path[parent.length] = step - 1;
  return { ...address, path };
}

/** Sets (or removes, when `value` is undefined) one value in both the objects and the text. */
function applyEdit(
  workspace: Workspace,
  tree: string,
  path: JsonPath,
  value: unknown,
  insert = false,
): Workspace {
  if (tree === ROOT_TREE) {
    const document = workspace.document;
    if (path.length === 0 || !document) {
      const root = isRecord(value) ? value : null;
      return { ...workspace, document: root, text: root ? JSON.stringify(root, null, 2) : '' };
    }
    const next = setIn(document, path, value, insert) as TransformObject;
    const edits = modify(workspace.text, path, value, { formattingOptions: FORMAT, isArrayInsertion: insert });
    return { ...workspace, document: next, text: applyEdits(workspace.text, edits) };
  }
  return {
    ...workspace,
    floating: workspace.floating.map((block) =>
      block.id === tree ? { ...block, value: setIn(block.value, path, value, insert) as TransformObject } : block,
    ),
  };
}

function setIn(container: unknown, path: JsonPath, value: unknown, insert: boolean): unknown {
  if (path.length === 0) {
    return value;
  }
  const [head, ...rest] = path;
  if (Array.isArray(container) && typeof head === 'number') {
    const copy = container.slice();
    if (rest.length > 0) {
      copy[head] = setIn(copy[head], rest, value, insert);
    } else if (value === undefined) {
      copy.splice(head, 1);
    } else if (insert) {
      copy.splice(head, 0, value);
    } else {
      copy[head] = value;
    }
    return copy;
  }
  const record = isRecord(container) ? container : {};
  const copy: Record<string, unknown> = { ...record };
  adopt(copy, record);
  const key = String(head);
  if (rest.length > 0) {
    copy[key] = setIn(record[key], rest, value, insert);
  } else if (value === undefined) {
    delete copy[key];
  } else {
    copy[key] = value;
  }
  return copy;
}

function stripMeta(value: TransformObject): { value: TransformObject; meta: TransformObject } {
  const meta: TransformObject = {};
  const rest: TransformObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (ROOT_META_KEYS.includes(key)) {
      meta[key] = item;
    } else {
      rest[key] = item;
    }
  }
  adopt(rest, value);
  return { value: rest, meta };
}

function pickMeta(meta: TransformObject): TransformObject {
  return Object.fromEntries(ROOT_META_KEYS.filter((key) => key in meta).map((key) => [key, meta[key]]));
}

function startsWith(path: JsonPath, prefix: JsonPath): boolean {
  return prefix.length <= path.length && prefix.every((part, index) => path[index] === part);
}

function sameJson(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}
