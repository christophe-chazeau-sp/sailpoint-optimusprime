import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges, OnDestroy } from '@angular/core';
import { ClassicPreset } from 'rete';
import { RefDirective } from 'rete-angular-plugin/22';
import { DeclaredVariable, formatValue, StepResult } from '../transform/evaluator/evaluator';
import { ROOT_TREE } from '../transform/workspace/workspace';
import { EditorNode, inputAnchorRatio } from './flow-node';
import { TooltipService } from './tooltip.service';

interface Anchor {
  key: string;
  top: string;
  reference: boolean;
  /** Nothing is plugged in yet. */
  open: boolean;
  socket: ClassicPreset.Socket;
}

@Component({
  selector: 'app-transform-node',
  imports: [RefDirective],
  templateUrl: './transform-node.component.html',
  styleUrl: './transform-node.component.scss',
  host: {
    'data-testid': 'node',
  },
})
export class TransformNodeComponent implements OnChanges, OnDestroy {
  @Input() data!: EditorNode;
  @Input() emit!: (payload: unknown) => void;
  @Input() rendered!: () => void;

  readonly velocityHeading = 'Velocity expression';
  readonly velocityWarning =
    'This step is calculated here with a JavaScript Velocity engine, which may behave differently ' +
    'from the tenant. Test it in the tenant before sending it to production.';

  seed = 0;
  private velocityBubble: Element | null = null;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly tooltip: TooltipService,
  ) {
    this.cdr.detach();
  }

  showVelocityWarning(event: MouseEvent): void {
    this.velocityBubble = event.currentTarget as Element;
    this.tooltip.show(this.velocityBubble, this.velocityHeading, this.velocityWarning);
  }

  hideVelocityWarning(): void {
    if (this.velocityBubble) {
      this.tooltip.hide(this.velocityBubble);
      this.velocityBubble = null;
    }
  }

  ngOnDestroy(): void {
    this.hideVelocityWarning();
  }

  @HostBinding('style.width.px')
  get width(): number {
    return this.data.width;
  }

  @HostBinding('style.height.px')
  get height(): number {
    return this.data.height;
  }

  @HostBinding('class.selected')
  get selected(): boolean {
    return Boolean(this.data.selected);
  }

  @HostBinding('class.dashed')
  get dashed(): boolean {
    return this.data.model.kind === 'implicit' && this.data.capsule !== 'input';
  }

  @HostBinding('class.capsule')
  get capsule(): boolean {
    return this.data.capsule != null;
  }

  @HostBinding('class.literal')
  get literal(): boolean {
    return this.data.capsule === 'literal';
  }

  @HostBinding('class.input')
  get inputCapsule(): boolean {
    return this.data.capsule === 'input';
  }

  @HostBinding('class.output')
  get outputCapsule(): boolean {
    return this.data.capsule === 'output';
  }

  /** Part of a block tree that is not wired to the transform output. */
  @HostBinding('class.detached')
  get detached(): boolean {
    return this.data.model.tree != null && this.data.model.tree !== ROOT_TREE;
  }

  @HostBinding('class.failed')
  get failed(): boolean {
    const result = this.data.result;
    return this.data.capsule === 'output' && result != null && !result.ok;
  }

  ngOnChanges(): void {
    this.seed++;
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered?.());
  }

  inputAnchors(): Anchor[] {
    const entries = Object.entries(this.data.inputs)
      .filter((entry): entry is [string, ClassicPreset.Input<ClassicPreset.Socket>] => !!entry[1])
      .sort((left, right) => (left[1].index ?? 0) - (right[1].index ?? 0));
    const open = new Set((this.data.model.slots ?? []).map((slot) => slot.key));
    return entries.map(([key, input], index) => ({
      key,
      reference: key.startsWith('$'),
      open: open.has(key),
      top: `${inputAnchorRatio(index, entries.length) * 100}%`,
      socket: input.socket,
    }));
  }

  outputSocket(): ClassicPreset.Socket | undefined {
    return this.data.outputs['out']?.socket;
  }

  referenceSocket(): ClassicPreset.Socket | undefined {
    return this.data.outputs['ref']?.socket;
  }

  socketData(side: 'input' | 'output', key: string, socket: ClassicPreset.Socket | undefined) {
    return { type: 'socket', side, key, nodeId: this.data.id, payload: socket };
  }

  variableText(variable: DeclaredVariable): string {
    return formatValue(variable.value);
  }

  resultText(result: StepResult): string {
    if (result.ok) {
      return formatValue(result.value);
    }
    return result.upstream ? 'Input failed' : result.error;
  }
}
