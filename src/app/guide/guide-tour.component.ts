import { Component, computed, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { GuideStep } from './guide-steps';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const RING = 6;
const GAP = 14;
const MARGIN = 12;
const CARD_WIDTH = 320;

/**
 * Walks through the UI: dims the page, rings the step's element and explains it in a card placed
 * beside it. `prepare` fires before each step so the host can open the pane that holds the element.
 */
@Component({
  selector: 'app-guide-tour',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:resize)': 'measure()',
  },
  template: `
    <div class="blocker" (click)="$event.stopPropagation()"></div>
    @if (spot(); as box) {
      <div
        class="spot"
        data-testid="tour-spot"
        [style.top.px]="box.top"
        [style.left.px]="box.left"
        [style.width.px]="box.width"
        [style.height.px]="box.height"
      ></div>
    } @else {
      <div class="dim"></div>
    }
    <section
      #card
      class="card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      data-testid="tour-card"
      [style.top.px]="cardPosition().top"
      [style.left.px]="cardPosition().left"
    >
      <p class="progress">Step {{ index() + 1 }} of {{ steps().length }}</p>
      <h2 id="tour-title">{{ step().title }}</h2>
      <p class="text">{{ step().text }}</p>
      <div class="dots" aria-hidden="true">
        @for (item of steps(); track $index) {
          <span [class.on]="$index === index()"></span>
        }
      </div>
      <footer>
        <button type="button" class="skip" data-testid="tour-close" (click)="closed.emit()">
          {{ last() ? 'Close' : 'Skip tour' }}
        </button>
        <span class="spacer"></span>
        <button type="button" class="secondary" data-testid="tour-back" [disabled]="index() === 0" (click)="go(-1)">
          Back
        </button>
        <button type="button" class="primary" data-testid="tour-next" (click)="last() ? closed.emit() : go(1)">
          {{ last() ? 'Done' : 'Next' }}
        </button>
      </footer>
    </section>
  `,
  styles: `
    .blocker {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }

    .dim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgb(16 24 40 / 55%);
    }

    .spot {
      position: fixed;
      z-index: 1000;
      border: 2px solid #4c6ef5;
      border-radius: 10px;
      box-shadow: 0 0 0 9999px rgb(16 24 40 / 55%), 0 0 0 6px rgb(76 110 245 / 25%);
      pointer-events: none;
      transition: top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease;
    }

    .card {
      position: fixed;
      z-index: 1001;
      box-sizing: border-box;
      width: ${CARD_WIDTH}px;
      max-width: calc(100vw - ${2 * MARGIN}px);
      padding: 14px 16px 12px;
      border-radius: 12px;
      background: #fff;
      color: #344054;
      font-size: 13px;
      box-shadow: 0 16px 40px rgb(16 24 40 / 30%);
      transition: top 200ms ease, left 200ms ease;
    }

    .progress {
      margin: 0 0 2px;
      color: #4c6ef5;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h2 {
      margin: 0 0 6px;
      color: #1d2939;
      font-size: 16px;
      font-weight: 600;
    }

    .text {
      margin: 0;
      line-height: 1.5;
    }

    .dots {
      display: flex;
      gap: 4px;
      margin: 12px 0 10px;
    }

    .dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #d0d5dd;
    }

    .dots span.on {
      width: 16px;
      border-radius: 3px;
      background: #4c6ef5;
    }

    footer {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .spacer {
      flex: 1;
    }

    footer button {
      height: 30px;
      padding: 0 12px;
      border-radius: 7px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    footer button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .skip {
      padding: 0 4px;
      border: 0;
      background: none;
      color: #667085;
    }

    .skip:hover {
      color: #1d2939;
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
export class GuideTourComponent {
  readonly steps = input.required<GuideStep[]>();
  readonly prepare = output<GuideStep>();
  readonly closed = output<void>();

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  protected readonly index = signal(0);
  protected readonly step = computed(() => this.steps()[this.index()]);
  protected readonly last = computed(() => this.index() === this.steps().length - 1);
  protected readonly spot = signal<Box | null>(null);
  protected readonly cardPosition = signal({ top: MARGIN, left: MARGIN });
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout));
    queueMicrotask(() => this.show());
  }

  protected go(delta: number): void {
    const next = Math.min(this.steps().length - 1, Math.max(0, this.index() + delta));
    if (next !== this.index()) {
      this.index.set(next);
      this.show();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closed.emit();
    } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
      if (this.last()) this.closed.emit();
      else this.go(1);
    } else if (event.key === 'ArrowLeft') {
      this.go(-1);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private show(): void {
    this.prepare.emit(this.step());
    this.timers.forEach(clearTimeout);
    // Opening a pane re-renders and resizes the layout, so measure once it settles.
    this.timers = [0, 120, 320].map((delay) =>
      setTimeout(() => {
        if (delay === 0) this.target()?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        this.measure();
      }, delay),
    );
  }

  private target(): HTMLElement | null {
    const element = document.querySelector<HTMLElement>(this.step().target);
    return element && element.getClientRects().length ? element : null;
  }

  protected measure(): void {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const element = this.target();
    const cardHeight = this.card()?.nativeElement.offsetHeight ?? 200;
    const cardWidth = Math.min(CARD_WIDTH, viewport.width - 2 * MARGIN);
    if (!element) {
      this.spot.set(null);
      this.cardPosition.set({
        top: Math.max(MARGIN, (viewport.height - cardHeight) / 2),
        left: Math.max(MARGIN, (viewport.width - cardWidth) / 2),
      });
      return;
    }
    const rect = element.getBoundingClientRect();
    const top = Math.max(MARGIN / 2, rect.top - RING);
    const left = Math.max(MARGIN / 2, rect.left - RING);
    const bottom = Math.min(viewport.height - MARGIN / 2, rect.bottom + RING);
    const right = Math.min(viewport.width - MARGIN / 2, rect.right + RING);
    const box = { top, left, width: right - left, height: bottom - top };
    this.spot.set(box);
    this.cardPosition.set(placeCard(box, cardWidth, cardHeight, viewport));
  }
}

/** Beside the ring where there is room (right, left, below, above); inside it when it fills the screen. */
function placeCard(
  box: Box,
  width: number,
  height: number,
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const clampTop = (value: number) => Math.min(Math.max(MARGIN, value), viewport.height - height - MARGIN);
  const clampLeft = (value: number) => Math.min(Math.max(MARGIN, value), viewport.width - width - MARGIN);
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  if (viewport.width - right - GAP >= width + MARGIN) {
    return { top: clampTop(box.top), left: right + GAP };
  }
  if (box.left - GAP >= width + MARGIN) {
    return { top: clampTop(box.top), left: box.left - GAP - width };
  }
  if (viewport.height - bottom - GAP >= height + MARGIN) {
    return { top: bottom + GAP, left: clampLeft(box.left) };
  }
  if (box.top - GAP >= height + MARGIN) {
    return { top: box.top - GAP - height, left: clampLeft(box.left) };
  }
  return { top: clampTop(box.top + 24), left: clampLeft(right - width - 24) };
}
