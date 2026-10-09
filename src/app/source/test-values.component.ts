import { Component, input, output } from '@angular/core';
import { inputId, RequiredInput } from '../transform/evaluator/evaluator';

export interface TestValueChange {
  input: RequiredInput;
  value: string;
}

/** The Values tab: one field per value the transform reads. A blank field means null. */
@Component({
  selector: 'app-test-values',
  template: `
    @if (filledFrom(); as name) {
      <p class="filled">Filled from <strong>{{ name }}</strong>. Edit a field to override it.</p>
    }
    @for (item of requirements(); track item.kind + ':' + item.key) {
      <label class="field" [class.missing]="!valueOf(item)">
        <span class="label">
          {{ item.label }}
          <small>{{ item.detail }}</small>
          @if (!valueOf(item)) {
            <span class="tag">no value</span>
          }
        </span>
        <input
          type="text"
          spellcheck="false"
          placeholder="null"
          [attr.data-input]="item.kind + ':' + item.key"
          [value]="valueOf(item)"
          (input)="valueChange.emit({ input: item, value: $any($event.target).value })"
        />
      </label>
    } @empty {
      <p class="empty">This transform does not need any input values.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .filled {
      margin: 0;
      padding: 6px 10px;
      border-radius: 8px;
      background: #ecfdf3;
      color: #054f31;
      font-size: 12px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .label {
      color: #344054;
      font-size: 13px;
    }

    .label small {
      margin-left: 4px;
      color: #98a2b3;
      font-size: 12px;
    }

    .tag {
      margin-left: 6px;
      padding: 0 6px;
      border-radius: 999px;
      background: #fee4e2;
      color: #b42318;
      font-size: 11px;
      font-weight: 600;
    }

    input {
      box-sizing: border-box;
      width: 100%;
      height: 34px;
      padding: 0 10px;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      color: #1d2939;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 13px;
    }

    .missing input {
      border-color: #fda29b;
      background: #fef3f2;
    }

    input:focus {
      border-color: #4c6ef5;
      outline: none;
      box-shadow: 0 0 0 3px rgb(76 110 245 / 15%);
    }

    .empty {
      margin: 0;
      color: #667085;
      font-size: 13px;
    }
  `,
})
export class TestValuesComponent {
  readonly requirements = input.required<RequiredInput[]>();
  /** Typed or identity-filled values, keyed by {@link inputId}. */
  readonly values = input.required<Record<string, string>>();
  /** Name of the identity that filled the values, if any. */
  readonly filledFrom = input<string | null>(null);
  readonly valueChange = output<TestValueChange>();

  protected valueOf(item: RequiredInput): string {
    return this.values()[inputId(item)] ?? '';
  }
}
