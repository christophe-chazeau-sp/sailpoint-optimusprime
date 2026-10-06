import { Injectable, signal } from '@angular/core';

export interface Tooltip {
  heading: string;
  text: string;
  x: number;
  y: number;
  below: boolean;
}

@Injectable({ providedIn: 'root' })
export class TooltipService {
  readonly current = signal<Tooltip | null>(null);
  private owner: Element | null = null;

  show(anchor: Element, heading: string, text: string): void {
    const rect = anchor.getBoundingClientRect();
    const below = rect.top < 140;
    this.owner = anchor;
    this.current.set({
      heading,
      text,
      x: rect.left + rect.width / 2,
      y: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
  }

  hide(anchor?: Element): void {
    if (anchor && anchor !== this.owner) {
      return;
    }
    this.owner = null;
    this.current.set(null);
  }
}
