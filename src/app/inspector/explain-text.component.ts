import { Component, computed, input } from '@angular/core';
import { segments } from '../transform/explain/explain';

/** An explanation line, with the names it quotes in backticks shown as chips. */
@Component({
  selector: 'app-explain-text',
  template: `@for (part of parts(); track $index) {<span [class.chip]="part.code">{{ part.text }}</span>}`,
  styles: `
    .chip {
      padding: 0 4px;
      border-radius: 4px;
      background: #e0eaff;
      color: #0033a1;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 0.92em;
      overflow-wrap: anywhere;
    }
  `,
})
export class ExplainTextComponent {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => segments(this.text()));
}
