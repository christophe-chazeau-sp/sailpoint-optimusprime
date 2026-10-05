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
    <svg data-testid="connection" [class.active]="active()" [class.variable]="variable()">
      @if (start && end) {
        <path [attr.d]="stepPath()" />
        @if (arrowPoints(); as points) {
          <polygon [attr.points]="points" />
        }
        @if (label(); as text) {
          @if (variable()) {
            <rect
              [attr.x]="labelPoint().x - labelWidth(text) / 2"
              [attr.y]="labelPoint().y - 8"
              [attr.width]="labelWidth(text)"
              height="16"
              rx="8"
            />
          }
          <text
            [attr.x]="labelPoint().x"
            [attr.y]="labelPoint().y"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ text }}
          </text>
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

    svg.active path {
      stroke: #0071ce;
      stroke-width: 2px;
    }

    svg.active polygon {
      fill: #0071ce;
    }

    svg.active text {
      fill: #0033a1;
    }

    svg.variable path {
      stroke: #0f766e;
      stroke-width: 1.75px;
      stroke-dasharray: 6 4;
    }

    svg.variable polygon {
      fill: #0f766e;
    }

    svg.variable rect {
      fill: #f0fdfa;
      stroke: #99f6e4;
      stroke-width: 1px;
    }

    svg.variable text {
      fill: #115e59;
      font-size: 12px;
      font-weight: 600;
      stroke: none;
      paint-order: normal;
    }
  `,
})
export class TransformConnectionComponent {
  @Input() data!: FlowConnection;
  @Input() start: Point | null = null;
  @Input() end: Point | null = null;
  @Input() path = '';

  protected stepPath(): string {
    const around = this.referencePoints();
    if (around) {
      return roundedPath(around);
    }
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

  /**
   * Leaves the conditional through the gap, crosses above every box, and enters the target from the left.
   */
  private referencePoints(): Point[] | null {
    const { start, end } = this;
    if (!this.data?.reference || !start || !end) {
      return null;
    }
    const lane = this.data.lane ?? Math.min(start.y, end.y) - 72;
    const outward = end.x < start.x ? -48 : 48;
    const approach = end.x - 36;
    const stop = end.x - ARROW_LENGTH;
    return [
      start,
      { x: start.x + outward, y: start.y },
      { x: start.x + outward, y: lane },
      { x: approach, y: lane },
      { x: approach, y: end.y },
      { x: stop, y: end.y },
    ];
  }

  /** Where the stroke stops so it meets the base of the arrow. */
  private arrowBase(): Point | null {
    const { start, end } = this;
    if (!start || !end) {
      return null;
    }
    if (this.data?.reference) {
      return { x: end.x - ARROW_LENGTH, y: end.y };
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

  protected active(): boolean {
    return Boolean(this.data?.active) && !this.data?.reference;
  }

  protected variable(): boolean {
    return Boolean(this.data?.reference);
  }

  protected label(): string | null {
    const label = this.data?.label;
    if (!label || HIDDEN_LABELS.has(label)) {
      return null;
    }
    return this.data?.reference && this.data.valueText ? `${label} ${this.data.valueText}` : label;
  }

  protected labelPoint(): Point {
    const points = this.referencePoints();
    if (points) {
      const left = points[2];
      const right = points[3];
      return { x: (left.x + right.x) / 2, y: left.y - 14 };
    }
    const { start, end } = this;
    const base = this.arrowBase();
    if (!start || !end || !base) {
      return { x: 0, y: 0 };
    }
    const cornerX =
      Math.abs(start.y - end.y) < 1 ? start.x : start.x + (end.x - start.x) / 2;
    return { x: (cornerX + base.x) / 2, y: end.y - 10 };
  }

  protected labelWidth(text: string): number {
    return text.length * 7 + 14;
  }
}

function roundedPath(points: Point[]): string {
  if (points.length < 2) {
    return '';
  }
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inX = current.x - previous.x;
    const inY = current.y - previous.y;
    const inLength = Math.hypot(inX, inY) || 1;
    const outX = next.x - current.x;
    const outY = next.y - current.y;
    const outLength = Math.hypot(outX, outY) || 1;
    const radius = Math.min(CORNER_RADIUS, inLength / 2, outLength / 2);
    const enterX = current.x - (inX / inLength) * radius;
    const enterY = current.y - (inY / inLength) * radius;
    const leaveX = current.x + (outX / outLength) * radius;
    const leaveY = current.y + (outY / outLength) * radius;
    path += ` L ${enterX} ${enterY} Q ${current.x} ${current.y} ${leaveX} ${leaveY}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}
