import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { BlockFormComponent } from './editor/block-form.component';
import { BlockPaletteComponent } from './editor/block-palette.component';
import { JsonEditorComponent } from './editor/json-editor.component';
import {
  BlockDrop,
  ConnectRequest,
  DisconnectRequest,
  Point,
  TransformCanvasComponent,
  TRANSFORM_INPUT_ID,
  TRANSFORM_OUTPUT_ID,
} from './editor/transform-canvas.component';
import { TooltipService } from './editor/tooltip.service';
import { GuideStep, GUIDE_STEPS } from './guide/guide-steps';
import { GuideTourComponent } from './guide/guide-tour.component';
import { QuickGuideComponent } from './guide/quick-guide.component';
import { IdentityPreviewComponent, PreviewContext } from './tenant/identity-preview.component';
import { TenantBrowserComponent } from './tenant/tenant-browser.component';
import { blockInfo } from './transform/catalog/blocks';
import {
  accountKey,
  Evaluation,
  EvaluationInputs,
  evaluateTransform,
  formatValue,
  IMPLICIT_KEY,
  RequiredInput,
  requiredInputs,
  StepResult,
  stepInputs,
} from './transform/evaluator/evaluator';
import { DEFAULT_EXAMPLE_ID, exampleText, TRANSFORM_EXAMPLES } from './transform/examples';
import { TransformGraph, TransformNodeModel } from './transform/model/transform-graph';
import { graphNode, parseWorkspace } from './transform/parser/transform-parser';
import { presentNode } from './transform/presentation';
import { nodeAtOffset, pathKey, SourceRange, sourceRanges } from './transform/source-range';
import { APP_VERSION } from './version';
import {
  addFloating,
  Address,
  connect,
  deleteAt,
  disconnect,
  EditResult,
  emptyWorkspace,
  isTransform,
  ROOT_TREE,
  setRoot,
  SlotTarget,
  TransformObject,
  treeValue,
  unsetRoot,
  updateBlock,
  valueAt,
  Workspace,
  workspaceFromText,
} from './transform/workspace/workspace';

const DEFAULT_LEFT_WIDTH = 380;
const MIN_LEFT_WIDTH = 260;
const MAX_LEFT_WIDTH = 800;
const UNDO_LIMIT = 100;
export const BLANK_EXAMPLE_ID = 'blank';

export const LEFT_PANE_WIDTH_KEY = 'sailpoint.optimusprime.leftWidth';
export const LEFT_PANE_OPEN_KEY = 'sailpoint.optimusprime.leftOpen';
export const PALETTE_OPEN_KEY = 'sailpoint.optimusprime.paletteOpen';

function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Unavailable in some test and private-browsing environments.
  }
}

function clampLeftWidth(width: number): number {
  let viewportCap = MAX_LEFT_WIDTH;
  try {
    if (typeof window !== 'undefined' && window.innerWidth > 0) {
      viewportCap = Math.floor(window.innerWidth * 0.6);
    }
  } catch {
    viewportCap = MAX_LEFT_WIDTH;
  }
  const max = Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, viewportCap));
  return Math.round(Math.min(max, Math.max(MIN_LEFT_WIDTH, width)));
}

function storedLeftWidth(): number {
  const raw = storageGet(LEFT_PANE_WIDTH_KEY);
  const parsed = raw == null ? DEFAULT_LEFT_WIDTH : Number(raw);
  return clampLeftWidth(Number.isFinite(parsed) ? parsed : DEFAULT_LEFT_WIDTH);
}

function inputId(input: Pick<RequiredInput, 'kind' | 'key'>): string {
  return `${input.kind}:${input.key}`;
}

function storedOpen(key: string, fallback = true): boolean {
  const raw = storageGet(key);
  return raw == null ? fallback : raw === '1';
}

/** Where a canvas input key such as `values[1]`, `values[+]` or `implicit` lands in the block. */
function slotTarget(block: Address, inputKey: string): SlotTarget {
  if (inputKey === 'implicit') {
    return { block, key: 'input' };
  }
  const list = /^(.*)\[(\d+|\+)\]$/.exec(inputKey);
  if (list) {
    return { block, key: list[1], index: list[2] === '+' ? 'append' : Number(list[2]) };
  }
  return { block, key: inputKey };
}

function slotPath(target: SlotTarget): Address {
  const path = [...target.block.path, 'attributes', target.key];
  return { tree: target.block.tree, path: typeof target.index === 'number' ? [...path, target.index] : path };
}

/** A block being added or edited in the form popup. */
interface FormRequest {
  type: string;
  value: TransformObject | null;
  isRoot: boolean;
  /** Edited block; absent when adding. */
  address?: Address;
  /** Where to put a new block; null for the middle of the view. */
  position?: Point | null;
}

@Component({
  selector: 'app-root',
  imports: [
    TransformCanvasComponent,
    JsonEditorComponent,
    TenantBrowserComponent,
    IdentityPreviewComponent,
    QuickGuideComponent,
    GuideTourComponent,
    BlockPaletteComponent,
    BlockFormComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class App {
  private readonly canvas = viewChild(TransformCanvasComponent);

  protected readonly version = APP_VERSION;
  protected readonly tooltip = inject(TooltipService);
  protected readonly examples = TRANSFORM_EXAMPLES;
  protected readonly blankExampleId = BLANK_EXAMPLE_ID;
  protected readonly exampleId = signal(DEFAULT_EXAMPLE_ID);
  protected readonly errorMessage = signal<string | null>(null);
  /** Why the last canvas edit was refused; shown briefly over the canvas. */
  protected readonly notice = signal<string | null>(null);
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly workspace = signal<Workspace>(this.initialWorkspace());
  protected readonly jsonText = signal(this.workspace().text);
  protected readonly graph = signal<TransformGraph>(this.parse(this.workspace()));
  protected readonly layoutKey = signal(0);
  protected readonly form = signal<FormRequest | null>(null);

  private undoStack: Workspace[] = [];
  private redoStack: Workspace[] = [];
  /** Consecutive keystrokes in the JSON editor make a single undo step. */
  private typing = false;
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);

  private readonly document = computed(() => this.workspace().document);

  /** What the user typed for each required input, keyed by {@link inputId}. Blank means null. */
  private readonly testValues = signal<Record<string, string>>({});
  /** The identity picked for a preview; its data fills every input the user has not typed. */
  private readonly previewContext = signal<PreviewContext | null>(null);
  private readonly previewValues = computed(() => {
    const context = this.previewContext();
    const values: Record<string, string> = {};
    if (!context) {
      return values;
    }
    const accountValue = (source: string, attribute: string) =>
      context.accounts.find((account) => account.sourceName === source && attribute in account.attributes)
        ?.attributes[attribute] ?? null;
    for (const input of this.requirements()) {
      let value: string | null = null;
      if (input.kind === 'implicit') {
        value = context.implicit ? accountValue(context.implicit.sourceName, context.implicit.attributeName) : null;
      } else if (input.kind === 'identity') {
        value = context.identity.attributes[input.key] ?? null;
      } else {
        for (const account of context.accounts) {
          for (const attribute of Object.keys(account.attributes)) {
            if (accountKey(account.sourceName, attribute) === input.key) {
              value ??= account.attributes[attribute];
            }
          }
        }
      }
      values[inputId(input)] = value ?? '';
    }
    return values;
  });
  private readonly effectiveValues = computed(() => ({ ...this.previewValues(), ...this.testValues() }));
  protected readonly connectedDocument = computed(() => {
    const document = this.document();
    return isTransform(document) ? document : null;
  });
  protected readonly needsImplicit = computed(() => this.requirements().some((input) => input.kind === 'implicit'));
  protected readonly requirements = computed(() => {
    const workspace = this.workspace();
    const found = new Map<string, RequiredInput>();
    for (const tree of [workspace.document, ...workspace.floating.map((block) => block.value)]) {
      for (const input of tree ? requiredInputs(tree) : []) {
        found.set(inputId(input), input);
      }
    }
    const order: RequiredInput['kind'][] = ['implicit', 'account', 'identity'];
    return [...found.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  });
  private readonly inputs = computed<EvaluationInputs>(() => {
    const values = this.effectiveValues();
    const pick = (kind: RequiredInput['kind']) => {
      const picked: Record<string, string | null> = {};
      for (const input of this.requirements().filter((item) => item.kind === kind)) {
        picked[input.key] = values[inputId(input)] || null;
      }
      return picked;
    };
    return {
      implicitInput: values[inputId({ kind: 'implicit', key: IMPLICIT_KEY })] || null,
      accountAttributes: pick('account'),
      identityAttributes: pick('identity'),
    };
  });
  /** One evaluation per tree: the connected transform, and each floating block on its own. */
  private readonly evaluations = computed(() => {
    const workspace = this.workspace();
    const inputs = this.inputs();
    const evaluations = new Map<string, Evaluation>();
    if (workspace.document) {
      evaluations.set(ROOT_TREE, evaluateTransform(workspace.document, inputs));
    }
    for (const block of workspace.floating) {
      evaluations.set(block.id, evaluateTransform(block.value, inputs));
    }
    return evaluations;
  });
  protected readonly evaluation = computed<{ result: StepResult }>(
    () =>
      this.evaluations().get(ROOT_TREE) ?? {
        result: { ok: false, error: 'No block is connected to the transform output yet.' },
      },
  );
  protected readonly nodeResults = computed(() => {
    const evaluations = this.evaluations();
    const implicit = this.inputs().implicitInput;
    const results = new Map<string, StepResult>();
    for (const node of this.graph().nodes) {
      const result =
        node.kind === 'implicit'
          ? ({ ok: true, value: implicit } as StepResult)
          : evaluations.get(node.tree ?? ROOT_TREE)?.steps.get(pathKey(node.path) ?? '');
      if (result) {
        results.set(node.id, result);
      }
    }
    return results;
  });
  protected readonly selectedResult = computed(() => {
    const node = this.selected();
    return node ? (this.nodeResults().get(node.id) ?? null) : null;
  });
  protected readonly selectedInputs = computed(() => {
    const node = this.selected();
    if (node?.kind !== 'operation' || !node.path) {
      return [];
    }
    const tree = node.tree ?? ROOT_TREE;
    const evaluation = this.evaluations().get(tree);
    if (!evaluation) {
      return [];
    }
    return stepInputs(treeValue(this.workspace(), tree), node.path, evaluation, this.inputs().implicitInput);
  });
  protected readonly formatValue = formatValue;
  protected readonly selected = signal<TransformNodeModel | null>(this.rootNode());
  protected readonly selectedView = computed(() => {
    const node = this.selected();
    return node ? presentNode(this.graph(), node) : null;
  });
  /** Input keys of the selected block that have something plugged in, which can be unplugged. */
  protected readonly selectedPlugged = computed(() => {
    const node = this.selected();
    if (!node) {
      return new Set<string>();
    }
    return new Set(
      this.graph()
        .edges.filter((edge) => edge.targetId === node.id && !edge.reference && edge.inputKey !== 'implicit')
        .map((edge) => edge.label),
    );
  });
  protected readonly inspectorOpen = signal(true);
  protected readonly minLeftWidth = MIN_LEFT_WIDTH;
  protected readonly maxLeftWidth = MAX_LEFT_WIDTH;
  protected readonly leftWidth = signal(storedLeftWidth());
  protected readonly leftOpen = signal(storedOpen(LEFT_PANE_OPEN_KEY));
  /** Folded until the user first opens it. */
  protected readonly paletteOpen = signal(storedOpen(PALETTE_OPEN_KEY, false));
  protected readonly resizing = signal(false);
  protected readonly shellColumns = computed(() => {
    const left = this.leftOpen() ? `${this.leftWidth()}px` : '0px';
    const palette = this.paletteOpen() ? '220px' : '0px';
    return `${left} ${palette} minmax(0, 1fr) auto`;
  });

  /** Ranges are only meaningful while the text still matches the rendered graph. */
  private readonly ranges = computed(() =>
    this.errorMessage() ? new Map<string, SourceRange>() : sourceRanges(this.jsonText(), this.graph()),
  );

  protected readonly highlight = computed<SourceRange | null>(() => {
    const node = this.selected();
    if (!node?.path) {
      return null;
    }
    return this.ranges().get(node.id) ?? null;
  });

  /** The selected block's own JSON, re-indented on its own. */
  protected readonly selectedJson = computed(() => {
    const node = this.selected();
    if (!node?.path) {
      return null;
    }
    const value = valueAt(this.workspace(), { tree: node.tree ?? ROOT_TREE, path: node.path });
    return value === undefined ? null : JSON.stringify(value, null, 2);
  });

  protected readonly selectedJsonHeight = computed(() => {
    const lines = this.selectedJson()?.split('\n').length ?? 0;
    return `${Math.min(420, lines * 19 + 14)}px`;
  });

  /** The help popup, then the guided tour it can start. */
  protected readonly guide = signal<'closed' | 'intro' | 'tour'>('closed');
  protected readonly guideSteps = GUIDE_STEPS;

  protected onGuideStep(step: GuideStep): void {
    if (step.pane === 'source' && !this.leftOpen()) {
      this.toggleLeft();
    } else if (step.pane === 'palette' && !this.paletteOpen()) {
      this.togglePalette();
    } else if (step.pane === 'inspector' && !this.inspectorOpen()) {
      this.toggleInspector();
    }
  }

  protected toggleInspector(): void {
    this.inspectorOpen.update((open) => !open);
  }

  protected toggleLeft(): void {
    this.leftOpen.update((open) => !open);
    this.persistLayout();
  }

  protected togglePalette(): void {
    this.paletteOpen.update((open) => !open);
    storageSet(PALETTE_OPEN_KEY, this.paletteOpen() ? '1' : '0');
  }

  protected onSplitterPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some test environments.
    }
    this.resizing.set(true);
  }

  protected onSplitterPointerMove(event: PointerEvent): void {
    if (!this.resizing()) {
      return;
    }
    const shell = (event.currentTarget as HTMLElement).closest('.shell');
    const origin = shell?.getBoundingClientRect().left ?? 0;
    this.leftWidth.set(clampLeftWidth(event.clientX - origin));
  }

  protected onSplitterPointerUp(event: PointerEvent): void {
    if (!this.resizing()) {
      return;
    }
    const handle = event.currentTarget as HTMLElement;
    try {
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is unavailable in some test environments.
    }
    this.resizing.set(false);
    this.persistLayout();
  }

  protected resetLeftWidth(): void {
    this.leftWidth.set(clampLeftWidth(DEFAULT_LEFT_WIDTH));
    this.persistLayout();
  }

  private persistLayout(): void {
    storageSet(LEFT_PANE_WIDTH_KEY, String(this.leftWidth()));
    storageSet(LEFT_PANE_OPEN_KEY, this.leftOpen() ? '1' : '0');
  }

  protected onEditorChange(text: string): void {
    this.exampleId.set('');
    this.jsonText.set(text);
    const read = workspaceFromText(text, this.workspace());
    if (!read.ok) {
      this.errorMessage.set(read.message);
      return;
    }
    const parsed = parseWorkspace(read.workspace);
    if (!parsed.ok) {
      this.errorMessage.set(parsed.message);
      return;
    }
    if (!this.typing) {
      this.pushUndo();
      this.typing = true;
    }
    this.errorMessage.set(null);
    this.workspace.set(read.workspace);
    this.graph.set(parsed.graph);
    this.reselect(parsed.graph, this.selected()?.id ?? null);
  }

  protected onEditorCursor(offset: number): void {
    const id = nodeAtOffset(this.ranges(), offset);
    const graph = this.graph();
    this.selected.set((id ? graphNode(graph, id) : undefined) ?? graphNode(graph, graph.rootId) ?? null);
  }

  protected onTenantTransform(text: string): void {
    this.exampleId.set('');
    this.openDocument(text);
  }

  protected loadExample(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) {
      return;
    }
    this.exampleId.set(id);
    this.openDocument(id === BLANK_EXAMPLE_ID ? '' : exampleText(id));
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    void file.text().then((text) => {
      this.exampleId.set('');
      this.openDocument(text);
    });
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (!file) {
      return;
    }
    void file.text().then((text) => {
      this.exampleId.set('');
      this.openDocument(text);
    });
  }

  protected onSelected(node: TransformNodeModel | null): void {
    this.selected.set(node);
  }

  protected testValue(input: RequiredInput): string {
    return this.effectiveValues()[inputId(input)] ?? '';
  }

  protected onPreviewContext(context: PreviewContext | null): void {
    const previous = this.previewContext();
    if (previous?.identity.id !== context?.identity.id) {
      this.testValues.set({});
    } else if (
      previous?.implicit?.sourceName !== context?.implicit?.sourceName ||
      previous?.implicit?.attributeName !== context?.implicit?.attributeName
    ) {
      const implicit = inputId({ kind: 'implicit', key: IMPLICIT_KEY });
      this.testValues.update(({ [implicit]: _dropped, ...rest }) => rest);
    }
    this.previewContext.set(context);
  }

  protected onTestValue(input: RequiredInput, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.testValues.update((values) => ({ ...values, [inputId(input)]: value }));
  }

  protected resultText(result: StepResult): string {
    return result.ok ? formatValue(result.value) : result.error;
  }

  // Editing

  protected onPaletteAdd(type: string): void {
    this.openAddForm(type, null);
  }

  protected onBlockDropped(drop: BlockDrop): void {
    this.openAddForm(drop.type, drop.position);
  }

  private openAddForm(type: string, position: Point | null): void {
    if (!blockInfo(type)) {
      return;
    }
    this.form.set({ type, value: null, isRoot: false, position });
  }

  protected onNodeEdit(node: TransformNodeModel): void {
    const address = this.addressOf(node);
    if (!address) {
      return;
    }
    const value = valueAt(this.workspace(), address);
    if (node.kind === 'literal' || !isTransform(value)) {
      return;
    }
    this.form.set({
      type: String(value['type']),
      value,
      isRoot: address.tree === ROOT_TREE && address.path.length === 0,
      address,
    });
  }

  protected editSelected(): void {
    const node = this.selected();
    if (node) {
      this.onNodeEdit(node);
    }
  }

  protected onFormSave(value: TransformObject): void {
    const request = this.form();
    this.form.set(null);
    if (!request) {
      return;
    }
    if (request.address) {
      this.apply(updateBlock(this.workspace(), request.address, value));
      return;
    }
    this.canvas()?.placeNextBlock(request.position ?? null);
    const next = addFloating(this.workspace(), value);
    const added = next.floating[next.floating.length - 1];
    this.commit(next, added.id);
  }

  protected onFormCancel(): void {
    this.form.set(null);
  }

  protected onConnectRequest(request: ConnectRequest): void {
    const graph = this.graph();
    const target = graphNode(graph, request.targetId);
    if (request.sourceId === TRANSFORM_INPUT_ID) {
      // Plugging the transform input in means reading the implicit input again.
      if (target) {
        this.onDisconnectRequest({ targetId: target.id, inputKey: request.inputKey });
      }
      return;
    }
    const source = graphNode(graph, request.sourceId);
    const from = source ? this.addressOf(source) : null;
    if (!from) {
      this.refuse('That block cannot be connected.');
      return;
    }
    if (request.targetId === TRANSFORM_OUTPUT_ID) {
      this.apply(setRoot(this.workspace(), from), source?.id);
      return;
    }
    const to = target ? this.addressOf(target) : null;
    if (!to || target?.kind !== 'operation') {
      this.refuse('Connect to an input of a block.');
      return;
    }
    this.apply(connect(this.workspace(), from, slotTarget(to, request.inputKey)), source?.id);
  }

  protected onDisconnectRequest(request: DisconnectRequest): void {
    if (request.targetId === TRANSFORM_OUTPUT_ID) {
      this.apply(unsetRoot(this.workspace()));
      return;
    }
    const target = graphNode(this.graph(), request.targetId);
    const block = target ? this.addressOf(target) : null;
    if (!block || request.inputKey === 'implicit' || request.inputKey.endsWith('[+]')) {
      this.canvas()?.refresh();
      return;
    }
    this.apply(disconnect(this.workspace(), slotPath(slotTarget(block, request.inputKey))));
  }

  /** Unplugs one input of the selected block, from the inspector. */
  protected unplugInput(key: string): void {
    const node = this.selected();
    if (node) {
      this.onDisconnectRequest({ targetId: node.id, inputKey: key });
    }
  }

  protected deleteSelected(): void {
    const node = this.selected();
    const address = node ? this.addressOf(node) : null;
    if (!address) {
      return;
    }
    this.apply(deleteAt(this.workspace(), address));
  }

  protected undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) {
      return;
    }
    this.redoStack.push(this.workspace());
    this.restore(previous);
  }

  protected redo(): void {
    const next = this.redoStack.pop();
    if (!next) {
      return;
    }
    this.undoStack.push(this.workspace());
    this.restore(next);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.form() || this.guide() !== 'closed' || this.isTextTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if (mod && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.redo();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && this.selected()) {
      event.preventDefault();
      this.deleteSelected();
    }
  }

  private isTextTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input, textarea, select, .cm-editor, [contenteditable="true"]') !== null)
    );
  }

  /** Where a graph node's JSON sits in the workspace; null for nodes that have none. */
  private addressOf(node: TransformNodeModel): Address | null {
    if (!node.path || node.kind === 'implicit') {
      return null;
    }
    return { tree: node.tree ?? ROOT_TREE, path: node.path };
  }

  private apply(result: EditResult, selectId?: string | null): void {
    if (!result.ok) {
      this.refuse(result.message);
      return;
    }
    if (result.workspace === this.workspace()) {
      this.canvas()?.refresh();
      return;
    }
    this.commit(result.workspace, selectId);
  }

  /** Records an edit made on the canvas, in the form or in the inspector. */
  private commit(next: Workspace, selectId?: string | null): void {
    const parsed = parseWorkspace(next);
    if (!parsed.ok) {
      this.refuse(parsed.message);
      return;
    }
    this.pushUndo();
    this.typing = false;
    this.show(next, parsed.graph, selectId);
  }

  private restore(workspace: Workspace): void {
    const parsed = parseWorkspace(workspace);
    if (!parsed.ok) {
      return;
    }
    this.typing = false;
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.show(workspace, parsed.graph);
  }

  private show(workspace: Workspace, graph: TransformGraph, selectId?: string | null): void {
    this.exampleId.set('');
    this.errorMessage.set(null);
    this.workspace.set(workspace);
    this.jsonText.set(workspace.text);
    this.graph.set(graph);
    this.reselect(graph, selectId ?? this.selected()?.id ?? null);
  }

  private pushUndo(): void {
    this.undoStack.push(this.workspace());
    if (this.undoStack.length > UNDO_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.canUndo.set(true);
    this.canRedo.set(false);
  }

  /** Keeps the same block selected across an edit; a new floating block is picked by its tree. */
  private reselect(graph: TransformGraph, id: string | null): void {
    const match =
      (id ? graphNode(graph, id) : undefined) ??
      (id ? graph.nodes.find((node) => node.floating && node.tree === id) : undefined);
    this.selected.set(match ?? graphNode(graph, graph.rootId) ?? null);
  }

  private refuse(message: string): void {
    this.canvas()?.refresh();
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 4000);
  }

  /** Replaces everything with a new document: boxes are laid out afresh and history starts over. */
  private openDocument(text: string): void {
    this.jsonText.set(text);
    const read = workspaceFromText(text);
    if (!read.ok) {
      this.errorMessage.set(read.message);
      return;
    }
    const parsed = parseWorkspace(read.workspace);
    if (!parsed.ok) {
      this.errorMessage.set(parsed.message);
      return;
    }
    this.errorMessage.set(null);
    this.undoStack = [];
    this.redoStack = [];
    this.typing = false;
    this.canUndo.set(false);
    this.canRedo.set(false);
    this.workspace.set(read.workspace);
    this.graph.set(parsed.graph);
    this.layoutKey.update((key) => key + 1);
    this.selected.set(graphNode(parsed.graph, parsed.graph.rootId) ?? null);
  }

  private initialWorkspace(): Workspace {
    const read = workspaceFromText(exampleText(DEFAULT_EXAMPLE_ID));
    return read.ok ? read.workspace : emptyWorkspace();
  }

  private parse(workspace: Workspace): TransformGraph {
    const result = parseWorkspace(workspace);
    if (!result.ok) {
      throw new Error(result.message);
    }
    return result.graph;
  }

  private rootNode(): TransformNodeModel | null {
    const graph = this.graph();
    return graph ? (graphNode(graph, graph.rootId) ?? null) : null;
  }
}
