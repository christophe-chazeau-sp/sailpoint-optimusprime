import type { SourceSection } from '../app';

/** A pane the tour opens before showing a step inside it. */
export type GuidePane = 'source' | 'palette' | 'inspector';

export interface GuideStep {
  /** CSS selector of the highlighted element. */
  target: string;
  title: string;
  text: string;
  pane?: GuidePane;
  /** A source-pane section the tour unfolds for this step. */
  section?: SourceSection;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    target: '[data-guide="source"]',
    pane: 'source',
    title: 'Source pane',
    text: 'Where the transform comes from and what it is tested with, in three numbered steps. Fold any section by its title. Drag the pane’s edge to resize it, or fold the whole pane with the arrow.',
  },
  {
    target: '[data-guide="tenant"]',
    pane: 'source',
    title: 'Tenant connection',
    text: 'Always shows whether you are connected. Click Connect to sign in with a JWT token or a client ID and secret. Once connected it turns green and counts down until the JWT expires.',
  },
  {
    target: '[data-guide="open"]',
    pane: 'source',
    section: 'open',
    title: '1 · Open a transform',
    text: 'Three ways in: search the connected tenant’s transforms, load a built-in example or start an empty one, or choose or drop a .json file.',
  },
  {
    target: '[data-guide="json"]',
    pane: 'source',
    section: 'json',
    title: '2 · JSON document',
    text: 'The transform itself. Edit it here and the diagram follows; edit the diagram and the JSON follows. Clicking in the JSON selects the matching step.',
  },
  {
    target: '[data-guide="test"]',
    pane: 'source',
    section: 'test',
    title: '3 · Test',
    text: 'Values: every value the transform reads, the implicit input and account and identity attributes; leave a field blank for null. Identity: when connected, pick a real identity to fill the values, and “Run on tenant” to compare with ISC’s own result.',
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
    text: 'Data flows from left to right into “out”. Blue arrows show what was calculated. Click a box to inspect it, double-click to edit it, drag between dots to connect blocks, drop a block on an arrow to insert it, and press Delete to remove a selected block or arrow.',
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
    text: 'The final result of the transform with the current test values, or the error that stopped it. Below it, “What it does” reads the whole transform in plain English.',
  },
  {
    target: '[data-guide="inspector"]',
    pane: 'inspector',
    title: 'Inspector',
    text: 'Details of the selected step: what it does in plain English, its output, variables, every input with the one it used highlighted, and its JSON. Edit, Delete and Unplug buttons are here too.',
  },
];
