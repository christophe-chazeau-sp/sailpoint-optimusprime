import { Component, input, output } from '@angular/core';

export interface Tab {
  id: string;
  label: string;
  /** A small count next to the label. */
  badge?: string;
  /** Shows the badge in red. */
  alert?: boolean;
  /** A green dot next to the label, with this text for screen readers. */
  dot?: string;
}

/** Segmented tabs; the panels are shown by the parent. */
@Component({
  selector: 'app-tab-bar',
  host: { role: 'tablist', '[attr.aria-label]': 'label()' },
  template: `
    @for (tab of tabs(); track tab.id) {
      <button
        type="button"
        role="tab"
        [attr.data-testid]="'tab-' + tab.id"
        [class.on]="tab.id === active()"
        [attr.aria-selected]="tab.id === active()"
        (click)="choose.emit(tab.id)"
      >
        {{ tab.label }}
        @if (tab.badge) {
          <span class="badge" [class.alert]="tab.alert">{{ tab.badge }}</span>
        }
        @if (tab.dot) {
          <span class="dot" [attr.aria-label]="tab.dot"></span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
      gap: 4px;
      padding: 3px;
      border-radius: 8px;
      background: #f2f4f7;
    }

    button {
      display: inline-flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 28px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #475467;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    button:hover:not(.on) {
      color: #1d2939;
    }

    button.on {
      background: #fff;
      color: #0033a1;
      font-weight: 600;
      box-shadow: 0 1px 2px rgb(16 24 40 / 8%);
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #17b26a;
    }

    .badge {
      padding: 0 6px;
      border-radius: 999px;
      background: #e0eaff;
      color: #0033a1;
      font-size: 11px;
      font-weight: 600;
    }

    .badge.alert {
      background: #fee4e2;
      color: #b42318;
    }
  `,
})
export class TabBarComponent {
  readonly tabs = input.required<Tab[]>();
  readonly active = input.required<string>();
  readonly label = input('');
  readonly choose = output<string>();
}
