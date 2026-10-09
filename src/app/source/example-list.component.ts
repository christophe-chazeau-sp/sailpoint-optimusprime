import { Component, input, output } from '@angular/core';
import { TRANSFORM_EXAMPLES } from '../transform/examples';

/** The Examples tab: the built-in examples, and a blank transform first. */
@Component({
  selector: 'app-example-list',
  template: `
    <ul data-testid="examples">
      <li>
        <button
          type="button"
          class="new"
          [attr.data-example]="blankId()"
          [class.on]="active() === blankId()"
          (click)="pick.emit(blankId())"
        >
          + New empty transform
        </button>
      </li>
      @for (example of examples; track example.id) {
        <li>
          <button
            type="button"
            [attr.data-example]="example.id"
            [class.on]="active() === example.id"
            (click)="pick.emit(example.id)"
          >
            {{ example.label }}
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      max-height: 176px;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      list-style: none;
    }

    li + li {
      border-top: 1px solid #f2f4f7;
    }

    button {
      width: 100%;
      padding: 7px 10px;
      border: 0;
      background: #fff;
      color: #1d2939;
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }

    button:hover {
      background: #f0f4ff;
    }

    button.on {
      background: #e0eaff;
      color: #0033a1;
      font-weight: 600;
    }

    button.new {
      color: #0033a1;
      font-weight: 600;
    }
  `,
})
export class ExampleListComponent {
  readonly active = input('');
  readonly blankId = input.required<string>();
  readonly pick = output<string>();
  protected readonly examples = TRANSFORM_EXAMPLES;
}
