import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FlowConnection } from './flow-node';

interface Point {
  x: number;
  y: number;
}

const HIDDEN_LABELS = new Set(['input', 'Implicit input']);
const CORNER_RADIUS = 12;
const ARROW_LENGTH = 9;
const ARROW_HALF = 4.5;

@Component({
  selector: 'app-transform-connection',
  // The Rete connection wrapper assigns inputs imperatively and then calls detectChanges().
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <svg data-testid="connection">
      @if (start && end) {
        <path [attr.d]="stepPath()" />
        @if (arrowPoints(); as points) {
          <polygon [attr.points]="points" />
        }
        @if (label(); as text) {
          <text [attr.x]="labelPoint().x" [attr.y]="labelPoint().y" text-anchor="middle">{{ text }}</text>
        }
      }
    </svg>
  `,
  styles: `
    svg {
      position: absolute;
      width: 9999px;
      height: 9999px;
      overflow: visible !important;
      pointer-events: none;
    }

    path {
      fill: none;
      stroke: #8d939c;
      stroke-width: 1.25px;
    }

    polygon {
      fill: #8d939c;
    }

    text {
      fill: #667085;
      font-family: Inter, 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      paint-order: stroke;
      stroke: #fafbfc;
      stroke-width: 4px;
    }
  `,
})
export class TransformConnectionComponent {
  @Input() data!: FlowConnection;
  @Input() start: Point | null = null;
  @Input() end: Point | null = null;
  @Input() path = '';

  protected stepPath(): string {
    const { start, end } = this;
    const stop = this.arrowBase();
    if (!start || !end || !stop) {
      return '';
    }
    if (Math.abs(start.y - end.y) < 1) {
      return `M ${start.x} ${start.y} H ${stop.x}`;
    }
    const middle = start.x + (end.x - start.x) / 2;
    const rightward = end.x >= start.x ? 1 : -1;
    const downward = end.y >= start.y ? 1 : -1;
    const radius = this.cornerRadius();
    return [
      `M ${start.x} ${start.y}`,
      `H ${middle - rightward * radius}`,
      `Q ${middle} ${start.y} ${middle} ${start.y + downward * radius}`,
      `V ${end.y - downward * radius}`,
      `Q ${middle} ${end.y} ${middle + rightward * radius} ${end.y}`,
      `H ${stop.x}`,
    ].join(' ');
  }

  /** Triangle pointing into the target box, so the line reads as an input. */
  protected arrowPoints(): string | null {
    const { end } = this;
    const base = this.arrowBase();
    if (!end || !base || base.x === end.x) {
      return null;
    }
    const scale = Math.abs(end.x - base.x) / ARROW_LENGTH;
    const half = ARROW_HALF * scale;
    return `${end.x},${end.y} ${base.x},${end.y - half} ${base.x},${end.y + half}`;
  }

  /** Where the stroke stops so it meets the base of the arrow. */
  private arrowBase(): Point | null {
    const { start, end } = this;
    if (!start || !end) {
      return null;
    }
    const rightward = end.x >= start.x ? 1 : -1;
    const straight = Math.abs(start.y - end.y) < 1;
    const neck = straight
      ? start.x
      : start.x + (end.x - start.x) / 2 + rightward * this.cornerRadius();
    const room = Math.max(0, Math.abs(end.x - neck) - 1);
    const length = Math.min(ARROW_LENGTH, room);
    return { x: end.x - rightward * length, y: end.y };
  }

  private cornerRadius(): number {
    const { start, end } = this;
    if (!start || !end) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(CORNER_RADIUS, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2),
    );
  }

  protected label(): string | null {
    const label = this.data?.label;
    return label && !HIDDEN_LABELS.has(label) ? label : null;
  }

  protected labelPoint(): Point {
    const { start, end } = this;
    const base = this.arrowBase();
    if (!start || !end || !base) {
      return { x: 0, y: 0 };
    }
    const cornerX =
      Math.abs(start.y - end.y) < 1 ? start.x : start.x + (end.x - start.x) / 2;
    return { x: (cornerX + base.x) / 2, y: end.y - 10 };
  }
}
