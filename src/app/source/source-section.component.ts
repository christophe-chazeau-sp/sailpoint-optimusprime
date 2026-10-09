import { Component, input, output } from '@angular/core';

/** A numbered, foldable step of the source pane. Extra header content goes in `[sectionBadge]`. */
@Component({
  selector: 'app-source-section',
  host: { '[class.folded]': 'folded()' },
  template: `
    <button type="button" class="head" [attr.aria-expanded]="!folded()" (click)="toggle.emit()">
      <span class="number">{{ number() }}</span>
      <span class="title">{{ heading() }}</span>
      <ng-content select="[sectionBadge]" />
      <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
    </button>
    <div class="body" [hidden]="folded()">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
      flex-direction: column;
      min-height: 0;
      border: 1px solid #e4e7ec;
      border-radius: 10px;
      background: #fff;
    }

    .head {
      display: flex;
      flex: none;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border: 0;
      border-radius: 10px;
      background: none;
      color: #1d2939;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .head:hover {
      background: #f9fafb;
    }

    :host(:not(.folded)) .head {
      border-bottom: 1px solid #f2f4f7;
      border-radius: 10px 10px 0 0;
    }

    .number {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #0033a1;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }

    .title {
      flex: 1;
      font-size: 14px;
      font-weight: 600;
    }

    .chevron {
      flex: none;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: #667085;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 120ms ease;
    }

    :host(.folded) .chevron {
      transform: rotate(-90deg);
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
      padding: 10px 12px 12px;
    }

    .body[hidden] {
      display: none;
    }
  `,
})
export class SourceSectionComponent {
  readonly number = input.required<number>();
  readonly heading = input.required<string>();
  readonly folded = input(false);
  readonly toggle = output<void>();
}
