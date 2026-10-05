import { ClassicPreset } from 'rete';
import { StepResult } from '../transform/evaluator/evaluator';
import { TransformNodeModel } from '../transform/model/transform-graph';
import { NodePresentation } from '../transform/presentation';

export interface NodeInputValue {
  key: string;
  text: string;
}

/** A value drawn as a pill: a literal, or the whole transform's input or output. */
export type CapsuleRole = 'literal' | 'input' | 'output';

export type EditorNode = ClassicPreset.Node & {
  width: number;
  height: number;
  model: TransformNodeModel;
  view: NodePresentation;
  result?: StepResult;
  inputValues: NodeInputValue[];
  capsule?: CapsuleRole;
  /** Text inside a capsule. Action cards keep using {@link NodePresentation.title}. */
  caption?: string;
};

export class FlowNode extends ClassicPreset.Node {
  width = 300;
  height = 60;
  result?: StepResult;
  inputValues: NodeInputValue[] = [];
  capsule?: CapsuleRole;
  caption?: string;

  constructor(
    public readonly model: TransformNodeModel,
    public readonly view: NodePresentation,
  ) {
    super(view.title);
  }
}

export class FlowConnection extends ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node> {
  /** The source step was calculated for the current test values. */
  active = false;
  /** Dashed arrow from a conditional to a step that reads one of its variables. */
  reference = false;
  /** Content y of the lane this variable arrow uses to pass above the boxes. */
  lane?: number;

  constructor(
    source: ClassicPreset.Node,
    target: ClassicPreset.Node,
    targetInput: string,
    public readonly label: string,
    sourceOutput = 'out',
  ) {
    super(source, sourceOutput, target, targetInput);
  }
}

export const valueSocket = new ClassicPreset.Socket('value');

export const NODE_WIDTH = 300;

const CAPSULE_FONT = '600 13px Consolas, "Courier New", monospace';
const CAPSULE_PADDING = 44;
export const CAPSULE_HEIGHT = 36;

let measureCanvas: CanvasRenderingContext2D | null | undefined;

function measureText(text: string): number {
  const fallback = text.length * 7.8;
  if (typeof document === 'undefined') {
    return fallback;
  }
  if (measureCanvas === undefined) {
    measureCanvas = document.createElement('canvas').getContext('2d');
  }
  if (!measureCanvas) {
    return fallback;
  }
  measureCanvas.font = CAPSULE_FONT;
  const width = measureCanvas.measureText(text).width;
  return width > 0 ? width : fallback;
}

/** Pill size that hugs its text, capped so a long value stays on one line. */
export function capsuleSize(text: string): { width: number; height: number } {
  const width = Math.ceil(Math.min(280, Math.max(48, measureText(text) + CAPSULE_PADDING)));
  return { width, height: CAPSULE_HEIGHT };
}

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
