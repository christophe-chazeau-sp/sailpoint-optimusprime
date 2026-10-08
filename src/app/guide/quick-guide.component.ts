import { Component, output } from '@angular/core';

/** The help popup: the main directions, and a button that starts the guided tour. */
@Component({
  selector: 'app-quick-guide',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="quick-guide-title" data-testid="quick-guide">
      <header>
        <h2 id="quick-guide-title">Quick guide</h2>
        <button type="button" class="close" aria-label="Close" (click)="closed.emit()">×</button>
      </header>

      <ol class="steps">
        <li>
          <strong>Open a transform</strong>
          <span>Pick an example, paste or drop JSON in the left pane, or connect to a tenant and search its transforms.</span>
        </li>
        <li>
          <strong>Read the diagram</strong>
          <span>Data flows from left to right into <b>out</b>. Click a box to see its output and inputs in the right pane.</span>
        </li>
        <li>
          <strong>Edit</strong>
          <span>Open the Blocks pane and drag or double-click a block. Connect dots to plug blocks together, double-click a box to edit it, Delete removes it.</span>
        </li>
        <li>
          <strong>Test</strong>
          <span>Fill the test values, or preview with a real identity of your tenant and compare with <b>Run on tenant</b>.</span>
        </li>
        <li>
          <strong>Check Velocity on the tenant</strong>
          <span>Steps with a <b>V</b> bubble use Velocity, which is simulated here. Confirm them on a tenant before production.</span>
        </li>
      </ol>

      <div class="keys">
        <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span>
        <span><kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</span>
        <span><kbd>Del</kbd> delete block</span>
        <span>Double-click: edit block</span>
      </div>

      <footer>
        <button type="button" class="secondary" (click)="closed.emit()">Close</button>
        <button type="button" class="primary" data-testid="start-tour" (click)="tour.emit()">Take the tour</button>
      </footer>
    </section>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgb(16 24 40 / 45%);
    }

    .dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      z-index: 1001;
      box-sizing: border-box;
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      padding: 20px 22px 18px;
      overflow-y: auto;
      border-radius: 12px;
      background: #fff;
      color: #344054;
      font-size: 13px;
      box-shadow: 0 20px 48px rgb(16 24 40 / 25%);
      transform: translate(-50%, -50%);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    h2 {
      margin: 0;
      color: #1d2939;
      font-size: 18px;
      font-weight: 600;
    }

    .close {
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: #667085;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }

    .close:hover {
      background: #f2f4f7;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 16px 0;
      padding: 0;
      counter-reset: step;
      list-style: none;
    }

    .steps li {
      display: grid;
      grid-template-columns: 28px 1fr;
      column-gap: 10px;
      counter-increment: step;
    }

    .steps li::before {
      content: counter(step);
      grid-row: span 2;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #e0eaff;
      color: #0033a1;
      font-weight: 700;
    }

    .steps strong {
      color: #1d2939;
      font-size: 14px;
    }

    .steps span {
      line-height: 1.45;
    }

    .keys {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #f9fafb;
      color: #475467;
      font-size: 12px;
    }

    kbd {
      padding: 1px 5px;
      border: 1px solid #d0d5dd;
      border-bottom-width: 2px;
      border-radius: 4px;
      background: #fff;
      font-family: inherit;
      font-size: 11px;
    }

    footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    footer button {
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .secondary {
      border: 1px solid #d0d5dd;
      background: #fff;
      color: #344054;
    }

    .primary {
      border: 0;
      background: #0033a1;
      color: #fff;
    }

    .primary:hover {
      background: #0071ce;
    }
  `,
})
export class QuickGuideComponent {
  readonly closed = output<void>();
  readonly tour = output<void>();
}
