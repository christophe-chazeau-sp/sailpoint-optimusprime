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
import { MinimapExtra, MinimapPlugin } from 'rete-minimap-plugin';
import { getDOMSocketPosition } from 'rete-render-utils';
import { formatValue, StepResult } from '../transform/evaluator/evaluator';
import { TransformGraph, TransformNodeModel } from '../transform/model/transform-graph';
import { presentNode } from '../transform/presentation';
import { AnchorSocketComponent } from './anchor-socket.component';
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

const TRANSFORM_INPUT_ID = 'transform-input';
const TRANSFORM_OUTPUT_ID = 'transform-output';

const PORT_SIZE = 2;
const FIT_SCALE = 0.85;

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

  readonly nodeSelected = output<TransformNodeModel | null>();
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

  constructor(private readonly injector: Injector) {}

  ngAfterViewInit(): void {
    this.mount();
    this.scheduleRender();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.ready) {
      return;
    }
    if (changes['graph']) {
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

  /** Value carried into this node by each incoming arrow. */
  private inputValues(node: EditorNode): NodeInputValue[] {
    const editor = this.editor;
    if (!editor) {
      return [];
    }
    return editor
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
      .filter((item) => item.text !== '')
      .sort((left, right) => left.index - right.index)
      .map(({ key, text }) => ({ key, text }));
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
    const area = this.area;
    const editor = this.editor;
    if (!area || !editor) {
      return;
    }
    await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: FIT_SCALE });
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
    editor.use(area);
    area.use(render);
    area.use(arrange);
    area.use(minimap);
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
      } else {
        node.width = NODE_WIDTH;
        const inputCount = graph.edges.filter((edge) => edge.targetId === model.id).length;
        node.height = nodeHeight(view, inputCount, variableHeight(node.result?.variables?.length ?? 0));
      }
      graph.edges
        .filter((edge) => edge.targetId === model.id)
        .forEach((edge, index) => {
          const input = new ClassicPreset.Input(valueSocket, edge.label);
          input.index = index;
          node.addInput(edge.inputKey, input);
        });
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

    const root = nodes.get(graph.rootId);
    const outputNode = nodes.get(TRANSFORM_OUTPUT_ID);
    if (root && outputNode) {
      const connection = new FlowConnection(root, outputNode, 'value', '');
      connection.active = this.connectionActive(connection);
      await editor.addConnection(connection);
    }

    // Input lines and results change box heights, which move the anchors; size first, then lay out.
    this.applyResults();
    await this.layoutNodes();

    await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: FIT_SCALE });
    await this.syncSelection();
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
