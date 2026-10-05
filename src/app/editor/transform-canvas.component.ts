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
import { getDOMSocketPosition } from 'rete-render-utils';
import { StepResult } from '../transform/evaluator/evaluator';
import { TransformGraph, TransformNodeModel } from '../transform/model/transform-graph';
import { presentNode } from '../transform/presentation';
import { AnchorSocketComponent } from './anchor-socket.component';
import {
  EditorNode,
  FlowConnection,
  FlowNode,
  inputAnchorRatio,
  NODE_WIDTH,
  nodeHeight,
  variableHeight,
  valueSocket,
} from './flow-node';
import { TransformConnectionComponent } from './transform-connection.component';
import { TransformNodeComponent } from './transform-node.component';

type Schemes = GetSchemes<EditorNode, FlowConnection>;
type AreaExtra = AngularArea2D<Schemes>;

const DOT_SPACING = 22;
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

  private editor?: NodeEditor<Schemes>;
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
    return nodeHeight(node.view, Object.keys(node.inputs).length, variableHeight(result?.variables?.length ?? 0));
  }

  private applyResults(): void {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    for (const node of editor.getNodes()) {
      const next = this.results?.get(node.model.id);
      const height = this.nodeHeightFor(node, next);
      if (next !== node.result || height !== node.height) {
        node.result = next;
        node.height = height;
        void area.update('node', node.id);
      }
    }
    for (const connection of editor.getConnections()) {
      const active = this.connectionActive(connection);
      if (connection.active !== active) {
        connection.active = active;
        void area.update('connection', connection.id);
      }
    }
  }

  /** An arrow is active when its source step was calculated. Implicit input follows its target. */
  private connectionActive(connection: FlowConnection): boolean {
    const source = this.editor?.getNode(connection.source);
    const target = this.editor?.getNode(connection.target);
    if (!source || !target) {
      return false;
    }
    if (source.model.kind === 'implicit') {
      return target.result != null;
    }
    return source.result != null;
  }

  protected async resetLayout(): Promise<void> {
    await this.layoutNodes();
    if (this.area) {
      this.syncBackground(this.area);
    }
  }

  protected async resetZoom(): Promise<void> {
    const area = this.area;
    const editor = this.editor;
    if (!area || !editor) {
      return;
    }
    await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: FIT_SCALE });
    this.syncBackground(area);
  }

  protected async resetEverything(): Promise<void> {
    await this.resetLayout();
    await this.resetZoom();
  }

  ngOnDestroy(): void {
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
    arrange.addPreset(leftToRightPorts);

    editor.use(area);
    area.use(render);
    area.use(arrange);

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
        }
      }
      if (context.type === 'nodepicked') {
        const node = editor.getNode(context.data.id);
        this.nodeSelected.emit(node?.model ?? null);
      } else if (context.type === 'pointerdown') {
        const target = context.data.event.target;
        if (target instanceof Element && !target.closest('[data-testid="node"]')) {
          this.nodeSelected.emit(null);
        }
      } else if (context.type === 'translated' || context.type === 'zoomed' || context.type === 'resized') {
        this.syncBackground(area);
      }
      return context;
    });

    this.editor = editor;
    this.area = area;
    this.arrange = arrange;
    this.mountGrid(area);
    this.ready = true;
  }

  private grid?: HTMLElement;

  /** The dot grid lives inside the zoomed layer, so it scales and pans with the boxes. */
  private mountGrid(area: AreaPlugin<Schemes, AreaExtra>): void {
    const grid = document.createElement('div');
    grid.style.position = 'absolute';
    grid.style.zIndex = '0';
    grid.style.pointerEvents = 'none';
    grid.style.backgroundImage =
      'radial-gradient(circle, #c5cee4 1px, transparent 1.2px), radial-gradient(circle, #c5cee4 1px, transparent 1.2px)';
    grid.style.backgroundSize = `${DOT_SPACING}px ${DOT_SPACING * 2}px, ${DOT_SPACING}px ${DOT_SPACING * 2}px`;
    area.area.content.holder.prepend(grid);
    this.grid = grid;
    this.syncBackground(area);
  }

  private syncBackground(area: AreaPlugin<Schemes, AreaExtra>): void {
    const grid = this.grid;
    if (!grid) {
      return;
    }
    const { x, y, k } = area.area.transform;
    const width = this.host().nativeElement.clientWidth;
    const height = this.host().nativeElement.clientHeight;
    const margin = DOT_SPACING * 4;
    const left = -x / k - margin;
    const top = -y / k - margin;
    grid.style.left = `${left}px`;
    grid.style.top = `${top}px`;
    grid.style.width = `${width / k + margin * 2}px`;
    grid.style.height = `${height / k + margin * 2}px`;
    // Keep dots locked to the canvas, not to this covering element's corner.
    grid.style.backgroundPosition = `${-left}px ${-top}px, ${-left + DOT_SPACING / 2}px ${-top + DOT_SPACING}px`;
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

    for (const model of graph.nodes) {
      const view = presentNode(graph, model);
      const node = new FlowNode(model, view);
      node.result = this.results?.get(model.id);
      node.width = NODE_WIDTH;
      const inputCount = graph.edges.filter((edge) => edge.targetId === model.id).length;
      node.height = nodeHeight(view, inputCount, variableHeight(node.result?.variables?.length ?? 0));
      graph.edges
        .filter((edge) => edge.targetId === model.id)
        .forEach((edge, index) => {
          const input = new ClassicPreset.Input(valueSocket, edge.label);
          input.index = index;
          node.addInput(edge.inputKey, input);
        });
      node.addOutput('out', new ClassicPreset.Output(valueSocket, 'Output'));
      nodes.set(model.id, node);
      await editor.addNode(node);
    }

    for (const edge of graph.edges) {
      const source = nodes.get(edge.sourceId);
      const target = nodes.get(edge.targetId);
      if (source && target) {
        const connection = new FlowConnection(source, target, edge.inputKey, edge.label);
        connection.active = this.connectionActive(connection);
        await editor.addConnection(connection);
      }
    }

    await this.layoutNodes();

    await AreaExtensions.zoomAt(area, editor.getNodes(), { scale: FIT_SCALE });
    this.syncBackground(area);
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
    if (this.grid && this.area) {
      this.area.area.content.holder.prepend(this.grid);
    }
    this.area?.nodeViews.clear();
    this.area?.connectionViews.clear();
  }

  private async layoutNodes(): Promise<void> {
    const editor = this.editor;
    const area = this.area;
    if (!editor || !area) {
      return;
    }
    try {
      await this.arrange?.layout({ options: LAYOUT_OPTIONS });
    } catch {
      await this.fallbackLayout(editor, area);
    }
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
