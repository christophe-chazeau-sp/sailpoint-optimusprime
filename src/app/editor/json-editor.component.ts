import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  output,
  viewChild,
} from '@angular/core';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  Text,
  Transaction,
} from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { SourceRange } from '../transform/source-range';

const setHighlight = StateEffect.define<SourceRange | null>();

const highlightMark = Decoration.mark({ class: 'cm-transform-highlight' });
const highlightLine = Decoration.line({ class: 'cm-transform-line' });

function highlightDecorations(doc: Text, range: SourceRange): DecorationSet {
  const first = doc.lineAt(range.from).number;
  const last = doc.lineAt(range.to).number;
  const lines = [];
  for (let number = first; number <= last; number++) {
    lines.push(highlightLine.range(doc.line(number).from));
  }
  return Decoration.set([...lines, highlightMark.range(range.from, range.to)], true);
}

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setHighlight)) {
        next = effect.value
          ? highlightDecorations(transaction.state.doc, effect.value)
          : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const jsonColors = HighlightStyle.define([
  { tag: tags.propertyName, color: '#3b5bdb' },
  { tag: tags.string, color: '#2e7d32' },
  { tag: tags.number, color: '#c2410c' },
  { tag: [tags.bool, tags.null], color: '#7c3aed' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: '#667085' },
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: '#fff',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "Consolas, 'Courier New', monospace",
    lineHeight: '1.5',
  },
  '.cm-gutters': {
    backgroundColor: '#f9fafb',
    borderRight: '1px solid #eaecf0',
    color: '#98a2b3',
  },
  '.cm-activeLine': { backgroundColor: 'rgb(76 110 245 / 4%)' },
  '.cm-line.cm-transform-line': { backgroundColor: 'rgb(76 110 245 / 14%)' },
  '.cm-selectionBackground': { backgroundColor: '#c3d0fb' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: '#9fb3f7',
  },
  '.cm-activeLineGutter': { backgroundColor: 'rgb(76 110 245 / 8%)' },
  '.cm-transform-highlight': {
    fontWeight: '700',
  },
});

@Component({
  selector: 'app-json-editor',
  template: '<div #host class="host"></div>',
  styles: `
    :host {
      display: block;
      min-height: 0;
      overflow: hidden;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
    }

    :host:focus-within {
      border-color: #4c6ef5;
      box-shadow: 0 0 0 3px rgb(76 110 245 / 15%);
    }

    .host {
      height: 100%;
    }
  `,
})
export class JsonEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  @Input() value = '';
  @Input() highlight: SourceRange | null = null;
  /** Read once, when the editor is created. */
  @Input() readOnly = false;
  @Input() label = 'Transform JSON';

  readonly valueChange = output<string>();
  readonly cursorMove = output<number>();

  private view?: EditorView;

  ngAfterViewInit(): void {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value,
        extensions: [
          basicSetup,
          json(),
          ...(this.readOnly
            ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
            : [linter(jsonParseLinter()), lintGutter()]),
          syntaxHighlighting(jsonColors),
          highlightField,
          editorTheme,
          EditorView.contentAttributes.of({ 'aria-label': this.label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (update.transactions.some((tr) => tr.annotation(Transaction.userEvent) !== undefined)) {
                this.valueChange.emit(update.state.doc.toString());
              }
            } else if (update.selectionSet && update.transactions.some((tr) => tr.isUserEvent('select'))) {
              this.cursorMove.emit(update.state.selection.main.head);
            }
          }),
        ],
      }),
    });
    this.applyHighlight();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const view = this.view;
    if (!view) {
      return;
    }
    if (changes['value'] && this.value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: this.value } });
    }
    if (changes['highlight'] || changes['value']) {
      this.applyHighlight(this.isNewBlock(changes));
    }
  }

  /**
   * Scroll only when a block is picked from outside the editor. While the user is typing or
   * clicking in the JSON, moving the view under the cursor would be disorienting.
   */
  private isNewBlock(changes: SimpleChanges): boolean {
    return !!changes['highlight']?.currentValue && !changes['value'] && !this.view?.hasFocus;
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  private applyHighlight(scroll = true): void {
    const view = this.view;
    if (!view) {
      return;
    }
    const length = view.state.doc.length;
    const range =
      this.highlight && this.highlight.to <= length && this.highlight.from < this.highlight.to
        ? this.highlight
        : null;
    const effects: StateEffect<unknown>[] = [setHighlight.of(range)];
    if (range && scroll) {
      effects.push(this.scrollEffect(view, range));
    }
    view.dispatch({ effects });
  }

  /** Center the block, or pin its first line near the top when it is taller than the editor. */
  private scrollEffect(view: EditorView, range: SourceRange): StateEffect<unknown> {
    const top = view.lineBlockAt(range.from).top;
    const bottom = view.lineBlockAt(range.to).bottom;
    const fits = bottom - top < view.scrollDOM.clientHeight - 24;
    return fits
      ? EditorView.scrollIntoView(EditorSelection.range(range.from, range.to), { y: 'center' })
      : EditorView.scrollIntoView(range.from, { y: 'start', yMargin: 12 });
  }
}
