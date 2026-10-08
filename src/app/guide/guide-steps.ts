/** A pane the tour opens before showing a step inside it. */
export type GuidePane = 'source' | 'palette' | 'inspector';

export interface GuideStep {
  /** CSS selector of the highlighted element. */
  target: string;
  title: string;
  text: string;
  pane?: GuidePane;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    target: '[data-guide="source"]',
    pane: 'source',
    title: 'Source pane',
    text: 'Everything about where the transform comes from, and the values it is tested with. Drag its edge to resize it, or fold it with the arrow.',
  },
  {
    target: '[data-guide="tenant"] .tenant',
    pane: 'source',
    title: 'Connect to a tenant',
    text: 'Sign in with a JWT token or a client ID and secret. Once connected, the panel turns green, shows when a JWT expires, and lets you search the tenant’s transforms by name.',
  },
  {
    target: '[data-guide="examples"]',
    pane: 'source',
    title: 'Examples and new transforms',
    text: 'Load a built-in example, or pick “New empty transform” to build one from scratch. You can also choose or drop a .json file below.',
  },
  {
    target: '[data-guide="json"]',
    pane: 'source',
    title: 'JSON document',
    text: 'The transform itself. Edit it here and the diagram follows; edit the diagram and the JSON follows. Clicking in the JSON selects the matching step.',
  },
  {
    target: '[data-guide="preview"] .preview',
    pane: 'source',
    title: 'Preview with an identity',
    text: 'When connected, pick a real identity: its attributes and accounts fill the test values. “Run on tenant” asks ISC for its own result and tells you whether it matches.',
  },
  {
    target: '[data-guide="test"]',
    pane: 'source',
    title: 'Test values',
    text: 'Every value the transform reads: the implicit input, account and identity attributes. Type a value, or leave a field blank for null. Results update as you type.',
  },
  {
    target: '[data-guide="palette"]',
    pane: 'palette',
    title: 'Blocks',
    text: 'Every transform type, by section. Open a section, then drag a block onto the canvas or double-click it. Search finds blocks by name, type or description.',
  },
  {
    target: '[data-guide="canvas"]',
    title: 'Diagram',
    text: 'Data flows from left to right into “out”. Blue arrows show what was calculated. Click a box to inspect it, double-click to edit it, drag between dots to connect blocks, and press Delete to remove one.',
  },
  {
    target: '.canvas-tools',
    title: 'View tools',
    text: 'Show the minimap, reset the layout, the zoom, or both. The question mark opens this guide again.',
  },
  {
    target: '.edit-tools',
    title: 'Undo and redo',
    text: 'Every edit can be undone, from the canvas, the form or the JSON editor. Shortcuts: Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z.',
  },
  {
    target: '[data-testid="result"]',
    pane: 'inspector',
    title: 'Transform output',
    text: 'The final result of the transform with the current test values, or the error that stopped it.',
  },
  {
    target: '[data-guide="inspector"]',
    pane: 'inspector',
    title: 'Inspector',
    text: 'Details of the selected step: its output, variables, every input with the one it used highlighted, and its JSON. Edit, Delete and Unplug buttons are here too.',
  },
];
