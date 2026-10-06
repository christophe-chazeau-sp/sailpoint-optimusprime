import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FlowConnection } from './flow-node';

interface Point {
  x: number;
  y: number;
}

interface Route {
  start: Point;
  end: Point;
  vertical: boolean;
}

interface Shape {
  points: Point[];
  end: Point;
  base: Point;
  /** Last bend before the arrowhead, used to centre the label on the final segment. */
  corner: Point;
  vertical: boolean;
}

const HIDDEN_LABELS = new Set(['input', 'Implicit input']);
const CORNER_RADIUS = 12;
const ARROW_LENGTH = 9;
const ARROW_HALF = 4.5;
const SELECTION_RING = 6;
/** Boxes closer than this on one axis count as overlapping on it. */
const SIDE_GAP = 16;
const STRAIGHT_SNAP = 4;

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
    const shape = this.shape();
    return shape ? roundedPath(shape.points) : '';
  }

  /** Triangle pointing into the target box, so the line reads as an input. */
  protected arrowPoints(): string | null {
    const tip = this.data?.reference ? this.end : this.shape()?.end;
    const base = this.data?.reference ? this.arrowBase() : this.shape()?.base;
    if (!tip || !base) {
      return null;
    }
    const length = Math.hypot(tip.x - base.x, tip.y - base.y);
    if (length < 0.5) {
      return null;
    }
    const half = (ARROW_HALF * length) / ARROW_LENGTH;
    const normalX = (-(tip.y - base.y) / length) * half;
    const normalY = ((tip.x - base.x) / length) * half;
    return `${tip.x},${tip.y} ${base.x + normalX},${base.y + normalY} ${base.x - normalX},${base.y - normalY}`;
  }

  /**
   * Picks the sides of the two boxes that face each other, then lays out a stepped line between them.
   * Vertical routes are computed with x and y swapped so both directions share one layout.
   */
  private shape(): Shape | null {
    const route = this.route();
    if (!route) {
      return null;
    }
    const flip = (point: Point): Point => (route.vertical ? { x: point.y, y: point.x } : point);
    const start = flip(route.start);
    const straight = Math.abs(start.y - flip(route.end).y) < STRAIGHT_SNAP;
    // A near miss would draw a tiny kink, so a nearly aligned arrow snaps to a straight line.
    const end = straight ? { x: flip(route.end).x, y: start.y } : flip(route.end);
    const forward = end.x >= start.x ? 1 : -1;
    const middle = start.x + (end.x - start.x) / 2;
    const radius = Math.max(
      0,
      Math.min(CORNER_RADIUS, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2),
    );
    const neck = straight ? start.x : middle + forward * radius;
    const length = Math.min(ARROW_LENGTH, Math.max(0, Math.abs(end.x - neck) - 1));
    const base = { x: end.x - forward * length, y: end.y };
    const points = straight
      ? [start, base]
      : [start, { x: middle, y: start.y }, { x: middle, y: end.y }, base];
    return {
      points: points.map(flip),
      end: flip(end),
      base: flip(base),
      corner: flip({ x: straight ? start.x : middle, y: end.y }),
      vertical: route.vertical,
    };
  }

  private route(): Route | null {
    const { start, end } = this;
    if (!start || !end) {
      return null;
    }
    const source = this.data?.geometry?.(this.data.source);
    const target = this.data?.geometry?.(this.data.target);
    if (!source || !target) {
      return { start, end, vertical: false };
    }
    // The selection ring is a 6px box-shadow drawn outside the card (see transform-node.component.scss).
    const sourceRing = source.selected ? SELECTION_RING : 0;
    const targetRing = target.selected ? SELECTION_RING : 0;
    const sourceRight = source.left + source.width;
    const targetRight = target.left + target.width;
    const sourceBottom = source.top + source.height;
    const targetBottom = target.top + target.height;
    const ahead = target.left - sourceRight;
    const behind = source.left - targetRight;
    const below = target.top - sourceBottom;
    const above = source.top - targetBottom;
    const overlapping = Math.max(ahead, behind, below, above) < SIDE_GAP;

    if (ahead >= SIDE_GAP || overlapping) {
      return {
        start: { x: sourceRight + sourceRing, y: start.y },
        end: { x: target.left - targetRing, y: end.y },
        vertical: false,
      };
    }
    if (behind >= SIDE_GAP) {
      return {
        start: { x: source.left - sourceRing, y: start.y },
        end: { x: targetRight + targetRing, y: end.y },
        vertical: false,
      };
    }
    // Stacked boxes: a single input drops straight in; several keep their order along the facing edge.
    const sourceX = source.left + source.width / 2;
    const ratio = target.height > 0 ? Math.min(1, Math.max(0, (end.y - target.top) / target.height)) : 0.5;
    const edge = Math.min(CORNER_RADIUS, target.width / 2);
    const targetX =
      target.inputs <= 1
        ? Math.min(targetRight - edge, Math.max(target.left + edge, sourceX))
        : target.left + target.width * ratio;
    return below >= SIDE_GAP
      ? {
          start: { x: sourceX, y: sourceBottom + sourceRing },
          end: { x: targetX, y: target.top - targetRing },
          vertical: true,
        }
      : {
          start: { x: sourceX, y: source.top - sourceRing },
          end: { x: targetX, y: targetBottom + targetRing },
          vertical: true,
        };
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

  /** Where a variable arrow's stroke stops so it meets the base of the arrowhead. */
  private arrowBase(): Point | null {
    const { end } = this;
    return end ? { x: end.x - ARROW_LENGTH, y: end.y } : null;
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
    const shape = this.shape();
    if (!shape) {
      return { x: 0, y: 0 };
    }
    const { corner, base } = shape;
    if (shape.vertical) {
      const text = this.label() ?? '';
      return { x: base.x + this.labelWidth(text) / 2 + 4, y: (corner.y + base.y) / 2 };
    }
    return { x: (corner.x + base.x) / 2, y: base.y - 10 };
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
