import { parseWorkspace } from '../parser/transform-parser';
import {
  addFloating,
  connect,
  deleteAt,
  disconnect,
  ROOT_TREE,
  setRoot,
  uidOf,
  unsetRoot,
  updateBlock,
  Workspace,
  workspaceFromText,
} from './workspace';

const CONCAT = `{
  "name": "Full name",
  "type": "concat",
  "attributes": {
    "values": [
      { "type": "identityAttribute", "attributes": { "name": "firstname" } },
      " ",
      { "type": "identityAttribute", "attributes": { "name": "lastname" } }
    ]
  }
}`;

function read(text: string): Workspace {
  const result = workspaceFromText(text);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.workspace;
}

function ok(result: ReturnType<typeof connect>): Workspace {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.workspace;
}

/** The text must always describe the same transform as the objects. */
function expectInSync(workspace: Workspace): void {
  if (workspace.document) {
    expect(JSON.parse(workspace.text)).toEqual(workspace.document);
  } else {
    expect(workspace.text).toBe('');
  }
}

describe('workspace', () => {
  it('reads an empty editor as no transform', () => {
    const workspace = read('  ');
    expect(workspace.document).toBeNull();
    const graph = parseWorkspace(workspace);
    expect(graph.ok && graph.graph.rootId).toBeNull();
  });

  it('keeps block identities while the JSON is retyped', () => {
    const first = read(CONCAT);
    const before = uidOf((first.document!['attributes'] as { values: object[] }).values[0]);
    const again = workspaceFromText(CONCAT.replace('"Full name"', '"Name"'), first);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(uidOf((again.workspace.document!['attributes'] as { values: object[] }).values[0])).toBe(before);
    }
  });

  it('appends a floating block to a list and keeps the rest of the text', () => {
    let workspace = addFloating(read(CONCAT), { type: 'static', attributes: { value: '!' } });
    const id = workspace.floating[0].id;
    workspace = ok(
      connect(workspace, { tree: id, path: [] }, { block: { tree: ROOT_TREE, path: [] }, key: 'values', index: 'append' }),
    );
    expect(workspace.floating).toEqual([]);
    const values = (workspace.document!['attributes'] as { values: unknown[] }).values;
    expect(values).toHaveLength(4);
    expect(values[3]).toEqual({ type: 'static', attributes: { value: '!' } });
    expect(workspace.text.startsWith('{\n  "name": "Full name",')).toBe(true);
    expectInSync(workspace);
  });

  it('moves a block from one input to another, floating what it displaces', () => {
    let workspace = read(`{
  "name": "Lower",
  "type": "lower",
  "attributes": { "input": { "type": "identityAttribute", "attributes": { "name": "email" } } }
}`);
    workspace = addFloating(workspace, { type: 'upper', attributes: {} });
    const upper = workspace.floating[0].id;
    workspace = ok(
      connect(
        workspace,
        { tree: ROOT_TREE, path: ['attributes', 'input'] },
        { block: { tree: upper, path: [] }, key: 'input' },
      ),
    );
    expect(workspace.document!['attributes']).toEqual({});
    expect(workspace.floating[0].value).toEqual({
      type: 'upper',
      attributes: { input: { type: 'identityAttribute', attributes: { name: 'email' } } },
    });
    expectInSync(workspace);
  });

  it('refuses to plug a block into its own input', () => {
    const workspace = read(CONCAT);
    const result = connect(
      workspace,
      { tree: ROOT_TREE, path: [] },
      { block: { tree: ROOT_TREE, path: ['attributes', 'values', 0] }, key: 'input' },
    );
    expect(result.ok).toBe(false);
  });

  it('removes a list item and shifts the target index after it', () => {
    let workspace = read(CONCAT);
    workspace = ok(
      connect(
        workspace,
        { tree: ROOT_TREE, path: ['attributes', 'values', 0] },
        { block: { tree: ROOT_TREE, path: ['attributes', 'values', 2] }, key: 'input' },
      ),
    );
    const values = (workspace.document!['attributes'] as { values: Record<string, unknown>[] }).values;
    expect(values).toHaveLength(2);
    expect(values[1]['attributes']).toEqual({
      name: 'lastname',
      input: { type: 'identityAttribute', attributes: { name: 'firstname' } },
    });
    expectInSync(workspace);
  });

  it('unplugs a block so it floats, and drops a plain value', () => {
    let workspace = ok(disconnect(read(CONCAT), { tree: ROOT_TREE, path: ['attributes', 'values', 0] }));
    expect(workspace.floating.map((block) => block.value['type'])).toEqual(['identityAttribute']);
    workspace = ok(disconnect(workspace, { tree: ROOT_TREE, path: ['attributes', 'values', 0] }));
    expect(workspace.floating).toHaveLength(1);
    expect((workspace.document!['attributes'] as { values: unknown[] }).values).toHaveLength(1);
    expectInSync(workspace);
  });

  it('swaps the output block and carries the transform name over', () => {
    let workspace = addFloating(read(CONCAT), { type: 'upper', attributes: {} });
    workspace = ok(setRoot(workspace, { tree: workspace.floating[0].id, path: [] }));
    expect(workspace.document).toEqual({ name: 'Full name', type: 'upper', attributes: {} });
    expect(workspace.floating[0].value['name']).toBeUndefined();
    expect(workspace.floating[0].value['type']).toBe('concat');
    expectInSync(workspace);
  });

  it('remembers the name when the output is unplugged and plugged again', () => {
    let workspace = ok(unsetRoot(read(CONCAT)));
    expect(workspace.document).toBeNull();
    expect(workspace.text).toBe('');
    workspace = ok(setRoot(workspace, { tree: workspace.floating[0].id, path: [] }));
    expect(workspace.document!['name']).toBe('Full name');
  });

  it('names a first output block', () => {
    let workspace = addFloating(read(''), { type: 'uuid', attributes: {} });
    workspace = ok(setRoot(workspace, { tree: workspace.floating[0].id, path: [] }));
    expect(workspace.document).toEqual({ name: 'New transform', type: 'uuid', attributes: {} });
    expectInSync(workspace);
  });

  it('keeps the inputs of a deleted block on the canvas', () => {
    const workspace = ok(deleteAt(read(CONCAT), { tree: ROOT_TREE, path: [] }));
    expect(workspace.document).toBeNull();
    expect(workspace.floating).toHaveLength(2);
  });

  it('rewrites only the attributes that changed', () => {
    const text = CONCAT.replace('"name": "firstname"', '"name": "firstname", "extra": 1');
    const workspace = read(text);
    const path = ['attributes', 'values', 0];
    const result = ok(
      updateBlock(workspace, { tree: ROOT_TREE, path }, {
        type: 'identityAttribute',
        attributes: { name: 'givenName', extra: 1 },
      }),
    );
    expect(result.text).toContain('"name": "givenName", "extra": 1');
    expectInSync(result);
  });

  it('lists open inputs for the parser', () => {
    let workspace = addFloating(read(''), { type: 'dateCompare', attributes: { firstDate: 'now', operator: 'LT' } });
    workspace = addFloating(workspace, { type: 'concat', attributes: {} });
    const parsed = parseWorkspace(workspace);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const [compare, concat] = parsed.graph.nodes;
    expect(compare.floating).toBe(true);
    expect(compare.slots).toEqual([
      { key: 'firstDate', label: 'firstDate', value: 'now' },
      { key: 'secondDate', label: 'secondDate' },
    ]);
    expect(concat.slots).toEqual([{ key: 'values[+]', label: 'values +' }]);
  });
});
