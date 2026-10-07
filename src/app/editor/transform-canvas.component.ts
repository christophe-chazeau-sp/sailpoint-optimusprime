import {
  AfterViewInit,
  Component,
  ElementRef,
  Injector,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ClassicPreset, GetSchemes, NodeEditor } from 'rete';
import { AngularArea2D, AngularPlugin, Presets } from 'rete-angular-plugin/22';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { AutoArrangePlugin, Preset as ArrangePreset } from 'rete-auto-arrange-plugin';
import { ConnectionPlugin } from 'rete-connection-plugin';
import { MinimapExtra, MinimapPlugin } from 'rete-minimap-plugin';
import { getDOMSocketPosition } from 'rete-render-utils';
import { formatValue, StepResult } from '../transform/evaluator/evaluator';
import { TransformGraph, TransformNodeModel } from '../transform/model/transform-graph';
import { presentNode } from '../transform/presentation';
import { AnchorSocketComponent } from './anchor-socket.component';
import { EditFlow, EditFlowHandlers } from './edit-flow';
import {
  capsuleSize,
  CapsuleRole,
  EditorNode,
  FlowConnection,
  FlowNode,
  inputAnchorRatio,
  NodeInputValue,
  NodeRect,
  NODE_WIDTH,
  nodeHeight,
  variableHeight,
  valueSocket,
} from './flow-node';
import { TransformConnectionComponent } from './transform-connection.component';
import { TransformNodeComponent } from './transform-node.component';

function endpointCaption(role: 'input' | 'output', result: StepResult | undefined): string {
  const text = !result
    ? 'null'
    : result.ok
      ? formatValue(result.value)
      : result.upstream
        ? 'Input failed'
        : result.error;
  return `${role === 'input' ? 'in' : 'out'} ${text}`;
}

function sameInputs(current: NodeInputValue[], next: NodeInputValue[]): boolean {
  return (
    current.length === next.length &&
    current.every((item, index) => item.key === next[index].key && item.text === next[index].text)
  );
}

type Schemes = GetSchemes<EditorNode, FlowConnection>;
type AreaExtra = AngularArea2D<Schemes> | MinimapExtra;

export const TRANSFORM_INPUT_ID = 'transform-input';
export const TRANSFORM_OUTPUT_ID = 'transform-output';
/** Drag data type of a palette entry; the payload is the block type. */
export const BLOCK_MIME = 'application/x-transform-block';

export interface Point {
  x: number;
  y: number;
}

/** Plug the source step into an input of the target. Ids are graph node ids. */
export interface ConnectRequest {
  sourceId: string;
  targetId: string;
  inputKey: string;
}

export interface DisconnectRequest {
  targetId: string;
  inputKey: string;
}

/** A palette block dropped at a point of the canvas content. */
export interface BlockDrop {
  type: string;
  position: Point;
}

const PORT_SIZE = 2;
const FIT_SCALE = 0.85;
const MAX_FIT_ZOOM = 1.4;
const PLACE_GAP = 80;
const DOUBLE_PICK_MS = 400;

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '48',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
} as const;

const leftToRightPorts: ArrangePreset = () => ({
  port(data) {
    if (data.side === 'input') {
      return {
        x: -PORT_SIZE,
        y: data.height * inputAnchorRatio(data.index, data.ports) - PORT_SIZE / 2,
        width: PORT_SIZE,
        height: PORT_SIZE,
        side: 'WEST',
      };
    }
    return {
      x: data.width,
      y: data.height / 2 - PORT_SIZE / 2,
      width: PORT_SIZE,
      height: PORT_SIZE,
      side: 'EAST',
    };
  },
});

@Component({
  selector: 'app-transform-canvas',
  imports: [],
  templateUrl: './transform-canvas.component.html',
  styleUrl: './transform-canvas.component.scss',
})
export class TransformCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  @Input() graph: TransformGraph | null = null;
  @Input() selectedId: string | null = null;
  /** Calculated value of each step, keyed by graph node id. */
  @Input() results: Map<string, StepResult> | null = null;
  /** Changing it re-arranges every box and fits the view on the next draw, as for a new document. */
  @Input() layoutKey = 0;

  readonly nodeSelected = output<TransformNodeModel | null>();
  readonly nodeEdit = output<TransformNodeModel>();
  readonly connectRequest = output<ConnectRequest>();
  readonly disconnectRequest = output<DisconnectRequest>();
  readonly blockDropped = output<BlockDrop>();
  protected readonly mountError = signal<string | null>(null);
  protected readonly minimapOpen = signal(false);

  private editor?: NodeEditor<Schemes>;
  private minimap?: MinimapPlugin<Schemes>;
  private area?: AreaPlugin<Schemes, AreaExtra>;
  private arrange?: AutoArrangePlugin<Schemes, AreaExtra>;
  private selection?: ReturnType<typeof AreaExtensions.selectableNodes>;
  private renderVersion = 0;
  private renderChain: Promise<void> = Promise.resolve();
  private ready = false;
  /** Where each box was, by graph node id, so edits redraw without moving anything. */
  private readonly positions = new Map<string, Point>();
  private appliedLayoutKey: number | null = null;
  /** Spot for the next block added to the canvas. */
  private pendingPlacement: Point | null = null;

  constructor(private readonly injector: Injector) {}

  ngAfterViewInit(): void {
    this.mount();
    this.scheduleRender();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.ready) {
      return;
    }
    if (changes['graph'] || changes['layoutKey']) {
      this.scheduleRender();
      return;
    }
    if (changes['selectedId']) {
      void this.syncSelection();
    }
    if (changes['results']) {
      this.applyResults();
    }
  }

  private nodeHeightFor(node: EditorNode, result = node.result): number {
    const inputs = node.inputValues.length;
    const extra =
      variableHeight(result?.variables?.length ?? 0) + (inputs > 0 ? 6 + inputs * 16 : 0);
    return nodeHeight(node.view, Object.keys(node.inputs).length, extra);
  }

  private applyResults(): void {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    for (const node of editor.getNodes()) {
      if (node.capsule === 'input' || node.capsule === 'output') {
        this.refreshEndpoint(node);
        continue;
      }
      node.result = this.results?.get(node.model.id);
    }
    for (const node of editor.getNodes()) {
      if (node.capsule === 'input' || node.capsule === 'output') {
        continue;
      }
      if (node.capsule === 'literal') {
        void area.update('node', node.id);
        continue;
      }
      const inputValues = this.inputValues(node);
      const inputsChanged = !sameInputs(node.inputValues, inputValues);
      node.inputValues = inputValues;
      const height = this.nodeHeightFor(node, node.result);
      if (height !== node.height || inputsChanged) {
        node.height = height;
        void area.update('node', node.id);
      } else {
        void area.update('node', node.id);
      }
    }
    for (const connection of editor.getConnections()) {
      const active = this.connectionActive(connection);
      const valueText = connection.reference
        ? this.carriedText(connection, editor.getNode(connection.source)?.result, undefined)
        : '';
      if (connection.active !== active || connection.valueText !== valueText) {
        connection.active = active;
        connection.valueText = valueText;
        void area.update('connection', connection.id);
      }
    }
  }

  /** Value carried into this node by each incoming arrow, then the inputs still open. */
  private inputValues(node: EditorNode): NodeInputValue[] {
    const editor = this.editor;
    if (!editor) {
      return [];
    }
    const carried = editor
      .getConnections()
      .filter((connection) => connection.target === node.id)
      .map((connection) => {
        const source = editor.getNode(connection.source);
        const result = source?.result;
        const literal = source?.model.kind === 'literal' ? source.model.attributes[0]?.value : undefined;
        const index = node.inputs[connection.targetInput]?.index ?? 0;
        return {
          index,
          key: connection.label || 'input',
          text: this.carriedText(connection, result, literal),
        };
      })
      .filter((item) => item.text !== '');
    const open = (node.model.slots ?? [])
      .filter((slot) => node.inputs[slot.key])
      .map((slot) => ({
        index: node.inputs[slot.key]?.index ?? 0,
        key: slot.key.endsWith('[+]') ? slot.key.slice(0, -3) : slot.key,
        text: slot.value ?? (slot.key.endsWith('[+]') ? '+ add' : 'empty'),
        open: true,
      }));
    return [...carried, ...open]
      .sort((left, right) => left.index - right.index)
      .map(({ index: _index, ...item }) => item);
  }

  /** A variable arrow carries the declared value, not the conditional's own output. */
  private carriedText(
    connection: FlowConnection,
    result: StepResult | undefined,
    literal: string | undefined,
  ): string {
    if (connection.reference) {
      const name = connection.label.startsWith('$') ? connection.label.slice(1) : connection.label;
      const variable = result?.variables?.find((item) => item.name === name);
      return variable ? formatValue(variable.value) : '';
    }
    if (result?.ok) {
      return formatValue(result.value);
    }
    return literal === undefined ? '' : formatValue(literal);
  }

  /** An arrow is active when its source step was calculated. Implicit input follows its target. */
  private connectionActive(connection: FlowConnection): boolean {
    if (connection.reference) {
      return false;
    }
    const source = this.editor?.getNode(connection.source);
    const target = this.editor?.getNode(connection.target);
    if (!source || !target) {
      return false;
    }
    if (source.model.kind === 'implicit' || source.capsule === 'input') {
      return target.result != null;
    }
    return source.result != null;
  }

  private fitCapsule(node: EditorNode, role: CapsuleRole, caption: string): void {
    const size = capsuleSize(caption);
    node.capsule = role;
    node.caption = caption;
    node.width = size.width;
    node.height = size.height;
  }

  private createEndpoint(role: 'input' | 'output'): EditorNode {
    const model: TransformNodeModel = {
      id: role === 'input' ? TRANSFORM_INPUT_ID : TRANSFORM_OUTPUT_ID,
      kind: role === 'input' ? 'implicit' : 'literal',
      type: role,
      label: role === 'input' ? 'Input' : 'Output',
      summary: role === 'input' ? 'Transform input' : 'Transform output',
      description:
        role === 'input'
          ? 'Value supplied to the whole transform.'
          : 'Value produced by the whole transform.',
      attributes: [],
      unknownType: false,
      ...(role === 'output' && !this.graph?.rootId ? { slots: [{ key: 'value', label: 'Output' }] } : {}),
    };
    const node = new FlowNode(model, {
      category: role === 'input' ? 'Input' : 'Output',
      tone: 'neutral',
      title: model.label,
    });
    const result = role === 'input' ? this.implicitResult() : this.rootResult();
    node.result = result;
    this.fitCapsule(node, role, endpointCaption(role, result));
    if (role === 'output') {
      const input = new ClassicPreset.Input(valueSocket, 'Output');
      input.index = 0;
      node.addInput('value', input);
    } else {
      node.addOutput('out', new ClassicPreset.Output(valueSocket, 'Output'));
    }
    return node;
  }

  /** Keeps an endpoint pill wrapped around the current value, growing the input pill leftward. */
  private refreshEndpoint(node: EditorNode): void {
    const role = node.capsule === 'output' ? 'output' : 'input';
    const result = role === 'input' ? this.implicitResult() : this.rootResult();
    const caption = endpointCaption(role, result);
    const size = capsuleSize(caption);
    const area = this.area;
    const view = area?.nodeViews.get(node.id);
    const widthChanged = size.width !== node.width;
    if (caption === node.caption && !widthChanged && size.height === node.height && result === node.result) {
      return;
    }
    const shiftLeft = role === 'input' && widthChanged && view ? size.width - node.width : 0;
    node.caption = caption;
    node.width = size.width;
    node.height = size.height;
    node.result = result;
    if (shiftLeft && view && area) {
      void area.translate(node.id, { x: view.position.x - shiftLeft, y: view.position.y });
    }
    void area?.update('node', node.id);
  }

  private implicitResult(): StepResult | undefined {
    const implicit = this.graph?.nodes.find((node) => node.kind === 'implicit');
    return implicit ? this.results?.get(implicit.id) : undefined;
  }

  private rootResult(): StepResult | undefined {
    const rootId = this.graph?.rootId;
    return rootId ? this.results?.get(rootId) : undefined;
  }

  protected async resetLayout(): Promise<void> {
    await this.layoutNodes();
  }

  protected async resetZoom(): Promise<void> {
    await this.fit();
  }

  /** Puts the next block added at `position` (canvas content coordinates), or mid-view when null. */
  placeNextBlock(position: Point | null): void {
    this.pendingPlacement = position ?? this.viewportCenter();
  }

  /** Redraws from the current graph, for instance after a gesture the document rejected. */
  refresh(): void {
    this.scheduleRender();
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(BLOCK_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(event: DragEvent): void {
    const type = event.dataTransfer?.getData(BLOCK_MIME);
    if (!type) {
      return;
    }
    event.preventDefault();
    this.blockDropped.emit({ type, position: this.contentPoint(event.clientX, event.clientY) });
  }

  private contentPoint(clientX: number, clientY: number): Point {
    const host = this.host().nativeElement;
    const rect = host.getBoundingClientRect();
    const transform = this.area?.area.transform ?? { x: 0, y: 0, k: 1 };
    return {
      x: (clientX - rect.left - transform.x) / transform.k,
      y: (clientY - rect.top - transform.y) / transform.k,
    };
  }

  private viewportCenter(): Point {
    const rect = this.host().nativeElement.getBoundingClientRect();
    return this.contentPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  /** Fits every box in view, without blowing a lone box up past a readable size. */
  private async fit(): Promise<void> {
    const area = this.area;
    const editor = this.editor;
    if (!area || !editor) {
      return;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const node of editor.getNodes()) {
      const view = area.nodeViews.get(node.id);
      if (!view) {
        continue;
      }
      left = Math.min(left, view.position.x);
      top = Math.min(top, view.position.y);
      right = Math.max(right, view.position.x + node.width);
      bottom = Math.max(bottom, view.position.y + node.height);
    }
    const host = this.host().nativeElement;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!Number.isFinite(left) || width === 0 || height === 0) {
      return;
    }
    const zoom = Math.min(
      MAX_FIT_ZOOM,
      (width * FIT_SCALE) / Math.max(1, right - left),
      (height * FIT_SCALE) / Math.max(1, bottom - top),
    );
    await area.area.zoom(zoom, 0, 0);
    await area.area.translate(width / 2 - ((left + right) / 2) * zoom, height / 2 - ((top + bottom) / 2) * zoom);
  }

  protected async resetEverything(): Promise<void> {
    await this.resetLayout();
    await this.resetZoom();
  }

  private readonly nodeRect = (nodeId: string): NodeRect | undefined => {
    const node = this.editor?.getNode(nodeId);
    const view = this.area?.nodeViews.get(nodeId);
    if (!node || !view) {
      return undefined;
    }
    return {
      left: view.position.x,
      top: view.position.y,
      width: node.width,
      height: node.height,
      selected: Boolean(node.selected),
      inputs: Object.keys(node.inputs).length,
    };
  };

  private connectionRefresh = 0;
  private readonly selectedNodes = new Set<string>();

  private scheduleConnectionRefresh(): void {
    if (this.connectionRefresh) {
      return;
    }
    this.connectionRefresh = requestAnimationFrame(() => {
      this.connectionRefresh = 0;
      const editor = this.editor;
      const area = this.area;
      if (!editor || !area) {
        return;
      }
      const changed = new Set<string>();
      for (const node of editor.getNodes()) {
        if (Boolean(node.selected) !== this.selectedNodes.has(node.id)) {
          changed.add(node.id);
          if (node.selected) {
            this.selectedNodes.add(node.id);
          } else {
            this.selectedNodes.delete(node.id);
          }
        }
      }
      for (const connection of editor.getConnections()) {
        if (changed.has(connection.source) || changed.has(connection.target)) {
          void area.update('connection', connection.id);
        }
      }
    });
  }

  protected toggleMinimap(): void {
    this.minimapOpen.update((open) => !open);
    this.syncMinimap();
  }

  private syncMinimap(): void {
    if (this.minimap) {
      // display: none would zero the width the minimap measures, so it would draw empty when reopened.
      this.minimap.element.style.visibility = this.minimapOpen() ? 'visible' : 'hidden';
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.connectionRefresh);
    this.area?.destroy();
  }

  private mount(): void {
    try {
      this.mountEditor();
    } catch (error) {
      console.error(error);
      this.mountError.set('The canvas could not be created.');
    }
  }

  private mountEditor(): void {
    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(this.host().nativeElement);
    const render = new AngularPlugin<Schemes, AreaExtra>({ injector: this.injector });
    const arrange = new AutoArrangePlugin<Schemes, AreaExtra>();
    const minimap = new MinimapPlugin<Schemes>({ boundViewport: true });

    render.addPreset(
      Presets.classic.setup({
        socketPositionWatcher: getDOMSocketPosition<Schemes, AreaExtra>({
          offset: (position) => position,
        }),
        customize: {
          node: () => TransformNodeComponent,
          connection: () => TransformConnectionComponent,
          socket: () => AnchorSocketComponent,
        },
      }),
    );
    render.addPreset(Presets.minimap.setup({ size: 180 }));
    arrange.addPreset(leftToRightPorts);

    editor.addPipe((context) => {
      if (context.type === 'connectioncreate') {
        context.data.geometry = this.nodeRect;
      }
      return context;
    });
    const connections = new ConnectionPlugin<Schemes, AreaExtra>();
    connections.addPreset(() => new EditFlow<Schemes>(this.flowHandlers));

    editor.use(area);
    area.use(render);
    area.use(arrange);
    area.use(minimap);
    area.use(connections);
    minimap.element.classList.add('minimap');

    this.selection = AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });
    AreaExtensions.simpleNodesOrder(area);

    area.addPipe((context) => {
      // The box glow and selection ring paint with the node. Keep connectors above them
      // so arrowheads stay visible, without letting the connector catch clicks.
      if (context.type === 'render' && context.data.element instanceof HTMLElement) {
        if (context.data.type === 'connection') {
          context.data.element.style.zIndex = '2';
          context.data.element.style.pointerEvents = 'none';
        } else if (context.data.type === 'node') {
          context.data.element.style.zIndex = '1';
          // Selecting or unselecting re-renders the box; its arrows then move to or off the ring.
          this.scheduleConnectionRefresh();
        }
      }
      if (context.type === 'nodepicked') {
        const node = editor.getNode(context.data.id);
        if (node?.capsule === 'input' || node?.capsule === 'output') {
          return context;
        }
        this.nodeSelected.emit(node?.model ?? null);
        if (node) {
          this.detectDoublePick(node);
        }
      } else if (context.type === 'pointerdown') {
        const target = context.data.event.target;
        if (
          target instanceof Element &&
          !target.closest('[data-testid="node"]') &&
          !minimap.element.contains(target)
        ) {
          this.nodeSelected.emit(null);
        }
      } else if (context.type === 'translated') {
        this.updateReferenceLanes();
      }
      return context;
    });

    this.editor = editor;
    this.area = area;
    this.arrange = arrange;
    this.minimap = minimap;
    this.syncMinimap();
    this.ready = true;
  }

  private lastPick: { id: string; time: number } | null = null;

  /**
   * Picking a box moves its element to the front, which stops the browser from ever firing
   * dblclick on it; two picks of the same box in quick succession count as a double-click instead.
   */
  private detectDoublePick(node: EditorNode): void {
    const now = performance.now();
    const previous = this.lastPick;
    if (previous && previous.id === node.model.id && now - previous.time < DOUBLE_PICK_MS) {
      this.lastPick = null;
      if (node.model.kind === 'operation') {
        this.nodeEdit.emit(node.model);
      }
      return;
    }
    this.lastPick = { id: node.model.id, time: now };
  }

  private modelOf(nodeId: string): TransformNodeModel | undefined {
    return this.editor?.getNode(nodeId)?.model;
  }

  private readonly flowHandlers: EditFlowHandlers = {
    canStart: (socket) =>
      socket.side === 'output' ? socket.key === 'out' : !socket.key.startsWith('$'),
    canConnect: (source, target) => {
      const from = this.editor?.getNode(source.nodeId);
      const to = this.editor?.getNode(target.nodeId);
      if (!from || !to || from.id === to.id || source.key !== 'out' || target.key.startsWith('$')) {
        return false;
      }
      if (from.capsule === 'input') {
        return target.key === 'input' || target.key === 'implicit';
      }
      return true;
    },
    connect: (source, target) => {
      const from = this.modelOf(source.nodeId);
      const to = this.modelOf(target.nodeId);
      if (from && to) {
        this.connectRequest.emit({ sourceId: from.id, targetId: to.id, inputKey: target.key });
      }
    },
    disconnect: (target) => {
      const to = this.modelOf(target.nodeId);
      if (to) {
        this.disconnectRequest.emit({ targetId: to.id, inputKey: target.key });
      }
    },
    cancel: () => this.scheduleRender(),
  };

  /** Runs one draw at a time so a newer document cannot leave the previous arrows behind. */
  private scheduleRender(): void {
    const version = ++this.renderVersion;
    this.renderChain = this.renderChain
      .catch(() => undefined)
      .then(() => (version === this.renderVersion ? this.renderGraph() : undefined));
  }

  private async renderGraph(): Promise<void> {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area || !this.graph) {
      return;
    }

    const fresh = this.appliedLayoutKey !== this.layoutKey;
    this.appliedLayoutKey = this.layoutKey;
    if (fresh) {
      this.positions.clear();
    } else {
      this.rememberPositions();
    }
    await this.clear(editor);

    const graph = this.graph;
    const nodes = new Map<string, EditorNode>();

    const implicitIds = new Set(
      graph.nodes.filter((model) => model.kind === 'implicit').map((model) => model.id),
    );

    for (const model of graph.nodes) {
      if (model.kind === 'implicit') {
        continue;
      }
      const view = presentNode(graph, model);
      const node = new FlowNode(model, view);
      node.result = this.results?.get(model.id);
      if (model.kind === 'literal') {
        this.fitCapsule(node, 'literal', view.title);
      }
      const incoming = graph.edges.filter((edge) => edge.targetId === model.id);
      incoming.forEach((edge, index) => {
        const input = new ClassicPreset.Input(valueSocket, edge.label);
        input.index = index;
        node.addInput(edge.inputKey, input);
      });
      for (const slot of model.slots ?? []) {
        if (!node.inputs[slot.key]) {
          const input = new ClassicPreset.Input(valueSocket, slot.label);
          input.index = Object.keys(node.inputs).length;
          node.addInput(slot.key, input);
        }
      }
      if (model.kind !== 'literal') {
        node.width = NODE_WIDTH;
        node.height = nodeHeight(
          view,
          Object.keys(node.inputs).length,
          variableHeight(node.result?.variables?.length ?? 0),
        );
      }
      node.addOutput('out', new ClassicPreset.Output(valueSocket, 'Output'));
      if (graph.edges.some((edge) => edge.reference && edge.sourceId === model.id)) {
        node.addOutput('ref', new ClassicPreset.Output(valueSocket, 'Variable'));
      }
      nodes.set(model.id, node);
      await editor.addNode(node);
    }

    if (implicitIds.size > 0) {
      const input = this.createEndpoint('input');
      nodes.set(input.model.id, input);
      await editor.addNode(input);
    }
    const output = this.createEndpoint('output');
    nodes.set(output.model.id, output);
    await editor.addNode(output);

    for (const edge of graph.edges) {
      if (implicitIds.has(edge.targetId)) {
        continue;
      }
      const source = nodes.get(implicitIds.has(edge.sourceId) ? TRANSFORM_INPUT_ID : edge.sourceId);
      const target = nodes.get(edge.targetId);
      if (source && target) {
        const connection = new FlowConnection(
          source,
          target,
          edge.inputKey,
          edge.label,
          edge.reference ? 'ref' : 'out',
        );
        connection.reference = edge.reference === true;
        connection.active = this.connectionActive(connection);
        await editor.addConnection(connection);
      }
    }

    const root = graph.rootId ? nodes.get(graph.rootId) : undefined;
    const outputNode = nodes.get(TRANSFORM_OUTPUT_ID);
    if (root && outputNode) {
      const connection = new FlowConnection(root, outputNode, 'value', '');
      connection.active = this.connectionActive(connection);
      await editor.addConnection(connection);
    }

    // Input lines and results change box heights, which move the anchors; size first, then lay out.
    this.applyResults();
    if (fresh) {
      await this.layoutNodes();
      await this.fit();
    } else {
      await this.restorePositions();
      this.updateReferenceLanes();
    }
    await this.syncSelection();
  }

  private rememberPositions(): void {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    for (const node of editor.getNodes()) {
      const view = area.nodeViews.get(node.id);
      if (view) {
        this.positions.set(node.model.id, { ...view.position });
      }
    }
  }

  /** Boxes go back where they were; new ones go to the drop spot or next to a box they connect to. */
  private async restorePositions(): Promise<void> {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    const placed = new Map<string, Point>();
    const unplaced: EditorNode[] = [];
    for (const node of editor.getNodes()) {
      const position = this.positions.get(node.model.id);
      if (position) {
        placed.set(node.id, position);
      } else {
        unplaced.push(node);
      }
    }

    const spot = this.pendingPlacement;
    this.pendingPlacement = null;
    if (spot) {
      const added =
        unplaced.find((node) => node.model.floating) ?? unplaced.find((node) => node.model.kind === 'operation');
      if (added) {
        const centred = { x: spot.x - added.width / 2, y: spot.y - added.height / 2 };
        placed.set(added.id, this.freeSpot(added, centred, placed));
        unplaced.splice(unplaced.indexOf(added), 1);
      }
    }

    const links = editor.getConnections().filter((connection) => !connection.reference);
    for (let pass = 0; pass < 4 && unplaced.length > 0; pass++) {
      for (const node of [...unplaced]) {
        const position = this.besideNeighbour(node, links, placed);
        if (position) {
          placed.set(node.id, this.freeSpot(node, position, placed));
          unplaced.splice(unplaced.indexOf(node), 1);
        }
      }
    }
    const center = this.viewportCenter();
    for (const node of unplaced) {
      placed.set(node.id, this.freeSpot(node, { x: center.x - node.width / 2, y: center.y }, placed));
    }

    for (const [id, position] of placed) {
      await area.translate(id, position);
    }
  }

  private besideNeighbour(node: EditorNode, links: FlowConnection[], placed: Map<string, Point>): Point | null {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const downstream = links.find((link) => link.source === node.id && placed.has(link.target));
    if (downstream) {
      const target = editor.getNode(downstream.target);
      const at = placed.get(downstream.target) as Point;
      return { x: at.x - node.width - PLACE_GAP, y: at.y + ((target?.height ?? 0) - node.height) / 2 };
    }
    const upstream = links.find((link) => link.target === node.id && placed.has(link.source));
    if (upstream) {
      const source = editor.getNode(upstream.source);
      const at = placed.get(upstream.source) as Point;
      return { x: at.x + (source?.width ?? 0) + PLACE_GAP, y: at.y + ((source?.height ?? 0) - node.height) / 2 };
    }
    return null;
  }

  /** Slides a new box down until it no longer covers a placed one. */
  private freeSpot(node: EditorNode, start: Point, placed: Map<string, Point>): Point {
    const editor = this.editor;
    const position = { ...start };
    for (let attempt = 0; attempt < 50; attempt++) {
      let blocker: { bottom: number } | null = null;
      for (const [id, at] of placed) {
        const other = editor?.getNode(id);
        if (!other || id === node.id) {
          continue;
        }
        const overlaps =
          position.x < at.x + other.width + 16 &&
          position.x + node.width + 16 > at.x &&
          position.y < at.y + other.height + 16 &&
          position.y + node.height + 16 > at.y;
        if (overlaps) {
          blocker = { bottom: at.y + other.height };
          break;
        }
      }
      if (!blocker) {
        break;
      }
      position.y = blocker.bottom + 24;
    }
    return position;
  }

  private async syncSelection(): Promise<void> {
    const editor = this.editor;
    if (!editor || !this.selection) {
      return;
    }
    const target = editor.getNodes().find((node) => node.model.id === this.selectedId);
    if (target) {
      if (!target.selected) {
        await this.selection.select(target.id, false);
      }
      return;
    }
    for (const node of editor.getNodes().filter((item) => item.selected)) {
      await this.selection.unselect(node.id);
    }
  }

  private async clear(editor: NodeEditor<Schemes>): Promise<void> {
    try {
      await editor.clear();
    } catch {
      // A failed removal must not keep the previous arrows on screen.
    }
    this.area?.area.content.holder.replaceChildren();
    this.area?.nodeViews.clear();
    this.area?.connectionViews.clear();
  }

  private async layoutNodes(): Promise<void> {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    const references = editor.getConnections().filter((connection) => connection.reference);
    for (const connection of references) {
      await editor.removeConnection(connection.id);
    }
    try {
      try {
        await this.arrange?.layout({ options: LAYOUT_OPTIONS });
      } catch {
        await this.fallbackLayout(editor, area);
      }
    } finally {
      for (const connection of references) {
        await editor.addConnection(connection);
      }
      this.updateReferenceLanes();
    }
  }

  /** Parks each variable arrow in its own lane above the boxes so it does not cut through them. */
  private updateReferenceLanes(): void {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    const references = editor.getConnections().filter((connection) => connection.reference);
    if (references.length === 0) {
      return;
    }
    let top = Infinity;
    for (const node of editor.getNodes()) {
      const view = area.nodeViews.get(node.id);
      if (view) {
        top = Math.min(top, view.position.y);
      }
    }
    if (!Number.isFinite(top)) {
      return;
    }
    references.sort((left, right) => {
      const leftY = area.nodeViews.get(left.target)?.position.y ?? 0;
      const rightY = area.nodeViews.get(right.target)?.position.y ?? 0;
      return leftY - rightY;
    });
    references.forEach((connection, index) => {
      const lane = top - 48 - index * 22;
      if (connection.lane !== lane) {
        connection.lane = lane;
        void area.update('connection', connection.id);
      }
    });
  }

  private async fallbackLayout(
    editor: NodeEditor<Schemes>,
    area: AreaPlugin<Schemes, AreaExtra>,
  ): Promise<void> {
    const nodes = editor.getNodes();
    const connections = editor.getConnections();
    const depth = new Map<string, number>(nodes.map((node) => [node.id, 0]));
    const queue = nodes
      .filter((node) => !connections.some((connection) => connection.target === node.id))
      .map((node) => node.id);
    const seen = new Set(queue);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const connection of connections.filter((item) => item.source === current)) {
        depth.set(
          connection.target,
          Math.max(depth.get(connection.target) ?? 0, (depth.get(current) ?? 0) + 1),
        );
        if (!seen.has(connection.target)) {
          seen.add(connection.target);
          queue.push(connection.target);
        }
      }
    }

    const columns = new Map<number, number>();
    for (const node of nodes) {
      const row = depth.get(node.id) ?? 0;
      const column = columns.get(row) ?? 0;
      columns.set(row, column + 1);
      await area.translate(node.id, { x: row * (NODE_WIDTH + 80), y: column * 100 });
    }
  }
}
