import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges } from '@angular/core';
import { ClassicPreset } from 'rete';
import { RefDirective } from 'rete-angular-plugin/22';
import { DeclaredVariable, formatValue, StepResult } from '../transform/evaluator/evaluator';
import { EditorNode, inputAnchorRatio } from './flow-node';

interface Anchor {
  key: string;
  top: string;
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
    return this.data.model.kind === 'implicit';
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
    return entries.map(([key, input], index) => ({
      key,
      top: `${inputAnchorRatio(index, entries.length) * 100}%`,
      socket: input.socket,
    }));
  }

  outputSocket(): ClassicPreset.Socket | undefined {
    return this.data.outputs['out']?.socket;
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
