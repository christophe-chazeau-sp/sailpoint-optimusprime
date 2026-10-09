import { Component, input, signal } from '@angular/core';
import { Explanation } from '../transform/explain/explain';
import { ExplainTextComponent } from './explain-text.component';

export const EXPLAIN_OPEN_KEY = 'sailpoint.optimusprime.explainOpen';

function storedOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(EXPLAIN_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

/** "What it does": the whole transform in plain English, with its details and known pitfalls. */
@Component({
  selector: 'app-explanation-card',
  imports: [ExplainTextComponent],
  host: { 'data-testid': 'explanation', '[class.folded]': '!open()' },
  template: `
    <button type="button" class="head" data-testid="explain-toggle" [attr.aria-expanded]="open()" (click)="toggle()">
      <span>What it does</span>
      <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
    </button>
    @if (open()) {
      <p class="summary" data-testid="explain-summary"><app-explain-text [text]="explanation().summary" /></p>
      @if (explanation().details.length) {
        <ul class="details">
          @for (detail of explanation().details; track $index) {
            <li><app-explain-text [text]="detail" /></li>
          }
        </ul>
      }
      @for (note of explanation().notes; track $index) {
        <p class="note" data-testid="explain-note">{{ note }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      border: 1px solid #d1e0ff;
      border-radius: 8px;
      background: #f5f8ff;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0;
      border: 0;
      background: none;
      color: #0033a1;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .chevron {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 120ms ease;
    }

    :host(.folded) .chevron {
      transform: rotate(-90deg);
    }

    .summary {
      margin: 0;
      color: #1d2939;
      font-size: 14px;
      line-height: 22px;
    }

    .details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding-left: 18px;
      color: #344054;
      font-size: 13px;
      line-height: 20px;
    }

    .note {
      margin: 0;
      padding: 6px 10px;
      border-radius: 6px;
      background: #fffaeb;
      color: #93370d;
      font-size: 12px;
      line-height: 18px;
    }
  `,
})
export class ExplanationCardComponent {
  readonly explanation = input.required<Explanation>();
  protected readonly open = signal(storedOpen());

  protected toggle(): void {
    this.open.update((open) => !open);
    try {
      globalThis.localStorage?.setItem(EXPLAIN_OPEN_KEY, this.open() ? '1' : '0');
    } catch {
      // Unavailable in some private-browsing environments.
    }
  }
}
