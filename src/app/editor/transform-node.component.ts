import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges } from '@angular/core';
import { ClassicPreset } from 'rete';
import { RefDirective } from 'rete-angular-plugin/22';
import { DeclaredVariable, formatValue, StepResult } from '../transform/evaluator/evaluator';
import { EditorNode, inputAnchorRatio } from './flow-node';

interface Anchor {
  key: string;
  top: string;
  reference: boolean;
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
export class TransformNodeComponent implements OnChanges {
  @Input() data!: EditorNode;
  @Input() emit!: (payload: unknown) => void;
  @Input() rendered!: () => void;

  seed = 0;

  constructor(private readonly cdr: ChangeDetectorRef) {
    this.cdr.detach();
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
    const data = entries.filter(([key]) => !key.startsWith('$'));
    const references = entries.filter(([key]) => key.startsWith('$'));
    return [
      ...data.map(([key, input], index) => ({
        key,
        reference: false,
        top: `${inputAnchorRatio(index, data.length) * 100}%`,
        socket: input.socket,
      })),
      ...references.map(([key, input], index) => ({
        key,
        reference: true,
        top: `${14 + index * 18}px`,
        socket: input.socket,
      })),
    ];
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
