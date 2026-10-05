import { ClassicPreset } from 'rete';
import { StepResult } from '../transform/evaluator/evaluator';
import { TransformNodeModel } from '../transform/model/transform-graph';
import { NodePresentation } from '../transform/presentation';

export type EditorNode = ClassicPreset.Node & {
  width: number;
  height: number;
  model: TransformNodeModel;
  view: NodePresentation;
  result?: StepResult;
};

export class FlowNode extends ClassicPreset.Node {
  width = 300;
  height = 60;
  result?: StepResult;

  constructor(
    public readonly model: TransformNodeModel,
    public readonly view: NodePresentation,
  ) {
    super(view.title);
  }
}

export class FlowConnection extends ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node> {
  constructor(
    source: ClassicPreset.Node,
    target: ClassicPreset.Node,
    targetInput: string,
    public readonly label: string,
  ) {
    super(source, 'out', target, targetInput);
  }
}

export const valueSocket = new ClassicPreset.Socket('value');

export const NODE_WIDTH = 300;

export function nodeHeight(view: NodePresentation, inputCount = 1, extra = 0): number {
  const base = view.detail ? 72 : 58;
  return Math.max(base, 32 + inputCount * 28) + extra;
}

/** Extra card height for the variable lines drawn on a conditional. */
export function variableHeight(count: number): number {
  return count > 0 ? 6 + count * 16 : 0;
}

export function inputAnchorRatio(index: number, count: number): number {
  return (index + 1) / (count + 1);
}
