import { Component, computed, signal } from '@angular/core';
import { JsonEditorComponent } from './editor/json-editor.component';
import { TransformCanvasComponent } from './editor/transform-canvas.component';
import {
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
import { graphNode, parseTransform } from './transform/parser/transform-parser';
import { presentNode } from './transform/presentation';
import { nodeAtOffset, pathKey, SourceRange, sourceRanges } from './transform/source-range';

const DEFAULT_LEFT_WIDTH = 380;
const MIN_LEFT_WIDTH = 260;
const MAX_LEFT_WIDTH = 800;

export const LEFT_PANE_WIDTH_KEY = 'sailpoint.optimusprime.leftWidth';
export const LEFT_PANE_OPEN_KEY = 'sailpoint.optimusprime.leftOpen';

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

function storedLeftOpen(): boolean {
  const raw = storageGet(LEFT_PANE_OPEN_KEY);
  return raw == null ? true : raw === '1';
}

@Component({
  selector: 'app-root',
  imports: [TransformCanvasComponent, JsonEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly examples = TRANSFORM_EXAMPLES;
  protected readonly jsonText = signal(exampleText(DEFAULT_EXAMPLE_ID));
  protected readonly exampleId = signal(DEFAULT_EXAMPLE_ID);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly document = signal<unknown>(JSON.parse(exampleText(DEFAULT_EXAMPLE_ID)));
  protected readonly graph = signal(this.parseInitial());

  /** What the user typed for each required input, keyed by {@link inputId}. Blank means null. */
  private readonly testValues = signal<Record<string, string>>({});
  protected readonly requirements = computed(() => requiredInputs(this.document()));
  protected readonly evaluation = computed(() => {
    const values = this.testValues();
    const pick = (kind: RequiredInput['kind']) => {
      const picked: Record<string, string | null> = {};
      for (const input of this.requirements().filter((item) => item.kind === kind)) {
        picked[input.key] = values[inputId(input)] || null;
      }
      return picked;
    };
    return evaluateTransform(this.document(), {
      implicitInput: values[inputId({ kind: 'implicit', key: IMPLICIT_KEY })] || null,
      accountAttributes: pick('account'),
      identityAttributes: pick('identity'),
    });
  });
  protected readonly nodeResults = computed(() => {
    const evaluation = this.evaluation();
    const implicit = this.testValues()[inputId({ kind: 'implicit', key: IMPLICIT_KEY })] || null;
    const results = new Map<string, StepResult>();
    for (const node of this.graph().nodes) {
      const result =
        node.kind === 'implicit'
          ? ({ ok: true, value: implicit } as StepResult)
          : evaluation.steps.get(pathKey(node.path) ?? '');
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
    const implicit = this.testValues()[inputId({ kind: 'implicit', key: IMPLICIT_KEY })] || null;
    return stepInputs(this.document(), node.path, this.evaluation(), implicit);
  });
  protected readonly formatValue = formatValue;
  protected readonly selected = signal<TransformNodeModel | null>(this.rootNode());
  protected readonly selectedView = computed(() => {
    const node = this.selected();
    return node ? presentNode(this.graph(), node) : null;
  });
  protected readonly inspectorOpen = signal(true);
  protected readonly minLeftWidth = MIN_LEFT_WIDTH;
  protected readonly maxLeftWidth = MAX_LEFT_WIDTH;
  protected readonly leftWidth = signal(storedLeftWidth());
  protected readonly leftOpen = signal(storedLeftOpen());
  protected readonly resizing = signal(false);
  protected readonly shellColumns = computed(() => {
    const left = this.leftOpen() ? `${this.leftWidth()}px` : '0px';
    return `${left} minmax(0, 1fr) auto`;
  });

  /** Ranges are only meaningful while the text still matches the rendered graph. */
  private readonly ranges = computed(() =>
    this.errorMessage() ? new Map<string, SourceRange>() : sourceRanges(this.jsonText(), this.graph()),
  );

  protected readonly highlight = computed<SourceRange | null>(() => {
    const node = this.selected();
    if (!node?.path || node.path.length === 0) {
      return null;
    }
    return this.ranges().get(node.id) ?? null;
  });

  protected toggleInspector(): void {
    this.inspectorOpen.update((open) => !open);
  }

  protected toggleLeft(): void {
    this.leftOpen.update((open) => !open);
    this.persistLayout();
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
    this.applyDocument(text, true);
  }

  protected onEditorCursor(offset: number): void {
    const id = nodeAtOffset(this.ranges(), offset);
    const graph = this.graph();
    this.selected.set(
      (id ? graphNode(graph, id) : undefined) ?? graphNode(graph, graph.rootId) ?? null,
    );
  }

  protected loadExample(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) {
      return;
    }
    this.exampleId.set(id);
    this.applyDocument(exampleText(id), false);
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
      this.applyDocument(text, false);
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
      this.applyDocument(text, false);
    });
  }

  protected onSelected(node: TransformNodeModel | null): void {
    this.selected.set(node);
  }

  protected testValue(input: RequiredInput): string {
    return this.testValues()[inputId(input)] ?? '';
  }

  protected onTestValue(input: RequiredInput, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.testValues.update((values) => ({ ...values, [inputId(input)]: value }));
  }

  protected resultText(result: StepResult): string {
    return result.ok ? formatValue(result.value) : result.error;
  }

  private applyDocument(text: string, keepSelection: boolean): void {
    this.jsonText.set(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.errorMessage.set('The document is not valid JSON.');
      return;
    }

    const result = parseTransform(parsed);
    if (!result.ok) {
      this.errorMessage.set(result.message);
      return;
    }

    this.errorMessage.set(null);
    this.document.set(parsed);
    this.graph.set(result.graph);
    this.selected.set(
      (keepSelection ? this.matchSelection(result.graph) : undefined) ??
        graphNode(result.graph, result.graph.rootId) ??
        null,
    );
  }

  private matchSelection(graph: TransformGraph): TransformNodeModel | undefined {
    const key = pathKey(this.selected()?.path);
    return key ? graph.nodes.find((node) => pathKey(node.path) === key) : undefined;
  }

  private parseInitial() {
    const result = parseTransform(JSON.parse(exampleText(DEFAULT_EXAMPLE_ID)));
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
