import { Component, computed, output, signal } from '@angular/core';
import { allBlocks, BLOCK_GROUPS, BlockInfo } from '../transform/catalog/blocks';
import { BLOCK_MIME } from './transform-canvas.component';

interface PaletteGroup {
  name: string;
  blocks: BlockInfo[];
}

export const PALETTE_COLLAPSED_KEY = 'sailpoint.optimusprime.paletteCollapsed';

/** Every section starts folded until the user opens one. */
function storedCollapsed(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(PALETTE_COLLAPSED_KEY);
    const parsed = raw == null ? BLOCK_GROUPS : (JSON.parse(raw) as unknown);
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : BLOCK_GROUPS);
  } catch {
    return new Set(BLOCK_GROUPS);
  }
}

/** Every transform type, grouped. Drag one onto the canvas or double-click it to add it. */
@Component({
  selector: 'app-block-palette',
  template: `
    <header class="palette-head">
      <h2>Blocks</h2>
      <p>Drag onto the canvas, or double-click.</p>
      <input
        type="search"
        placeholder="Search blocks"
        aria-label="Search blocks"
        spellcheck="false"
        data-testid="palette-search"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
    </header>
    @if (!searching()) {
      <div class="fold-all">
        <button type="button" data-testid="palette-expand-all" (click)="setAll(false)">Expand all</button>
        <span aria-hidden="true">·</span>
        <button type="button" data-testid="palette-collapse-all" (click)="setAll(true)">Collapse all</button>
      </div>
    }
    <div class="palette-list">
      @for (group of groups(); track group.name) {
        @let open = isOpen(group.name);
        <section class="group" [class.open]="open" [attr.data-group]="group.name" data-testid="palette-group">
          <h3>
            <button
              type="button"
              class="group-head"
              [attr.aria-expanded]="open"
              [attr.aria-controls]="'palette-' + group.name"
              (click)="toggle(group.name)"
            >
              <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
              <span class="accent" aria-hidden="true"></span>
              <span class="group-name">{{ group.name }}</span>
              <span class="count">{{ group.blocks.length }}</span>
            </button>
          </h3>
          @if (open) {
            <div class="group-body" [id]="'palette-' + group.name">
              @for (block of group.blocks; track block.type) {
                <div
                  class="block"
                  role="button"
                  tabindex="0"
                  draggable="true"
                  data-testid="palette-block"
                  [attr.data-type]="block.type"
                  [title]="block.operation.description"
                  (dragstart)="onDragStart($event, block)"
                  (dblclick)="add.emit(block.type)"
                  (keydown.enter)="add.emit(block.type)"
                >
                  <span class="name">{{ block.operation.label }}</span>
                  <span class="type">{{ block.type }}</span>
                </div>
              }
            </div>
          }
        </section>
      } @empty {
        <p class="empty">No block matches.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
    }

    .palette-head {
      padding: 16px 14px 10px;
      border-bottom: 1px solid #e4e7ec;
    }

    h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }

    .palette-head p {
      margin: 2px 0 10px;
      color: #667085;
      font-size: 12px;
    }

    input {
      box-sizing: border-box;
      width: 100%;
      padding: 6px 9px;
      border: 1px solid #d0d5dd;
      border-radius: 6px;
      font: inherit;
      font-size: 13px;
    }

    input:focus {
      border-color: #4c6ef5;
      outline: 2px solid rgb(76 110 245 / 20%);
    }

    .fold-all {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      padding: 6px 14px 0;
      color: #98a2b3;
      font-size: 12px;
    }

    .fold-all button {
      padding: 0;
      border: 0;
      background: none;
      color: #475467;
      font: inherit;
      cursor: pointer;
    }

    .fold-all button:hover {
      color: #0033a1;
      text-decoration: underline;
    }

    .palette-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 8px 16px;
    }

    .group {
      --accent: #4c6ef5;
      margin-bottom: 6px;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      background: #f9fafb;
    }

    .group[data-group='Sources'] { --accent: #2e90fa; }
    .group[data-group='Text'] { --accent: #7a5af8; }
    .group[data-group='Dates'] { --accent: #f79009; }
    .group[data-group='Logic'] { --accent: #15b79e; }
    .group[data-group='Formats'] { --accent: #ee46bc; }
    .group[data-group='Generators'] { --accent: #66c61c; }

    h3 {
      margin: 0;
    }

    .group-head {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 9px 10px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: #1d2939;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }

    .group-head:hover {
      background: #f2f4f7;
    }

    .group-head:focus-visible {
      outline: 2px solid rgb(76 110 245 / 35%);
    }

    .group.open .group-head {
      border-bottom: 1px solid #e4e7ec;
      border-radius: 8px 8px 0 0;
    }

    .chevron {
      flex: none;
      width: 14px;
      height: 14px;
      fill: none;
      stroke: #667085;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 120ms ease;
    }

    .group.open .chevron {
      transform: rotate(90deg);
    }

    .accent {
      flex: none;
      width: 4px;
      height: 16px;
      border-radius: 2px;
      background: var(--accent);
    }

    .group-name {
      flex: 1;
    }

    .count {
      min-width: 20px;
      padding: 1px 7px;
      border-radius: 999px;
      background: #eaecf0;
      color: #475467;
      font-size: 11px;
      font-weight: 600;
      text-align: center;
    }

    .group-body {
      padding: 6px;
    }

    .block {
      display: flex;
      flex-direction: column;
      margin-bottom: 4px;
      border-left: 3px solid var(--accent);
      padding: 6px 9px;
      border: 1px solid #dfe3ee;
      border-radius: 6px;
      background: #fff;
      cursor: grab;
      user-select: none;
    }

    .block:last-child {
      margin-bottom: 0;
    }

    .block:hover,
    .block:focus-visible {
      border-color: #4c6ef5;
      border-left-color: var(--accent);
      outline: none;
      box-shadow: 0 2px 6px rgb(76 110 245 / 14%);
    }

    .block:active {
      cursor: grabbing;
    }

    .name {
      color: #1d2939;
      font-size: 13px;
    }

    .type {
      color: #667085;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 11px;
    }

    .empty {
      margin: 16px 4px;
      color: #667085;
      font-size: 13px;
    }
  `,
})
export class BlockPaletteComponent {
  readonly add = output<string>();
  protected readonly query = signal('');
  protected readonly searching = computed(() => this.query().trim() !== '');
  private readonly collapsed = signal<ReadonlySet<string>>(storedCollapsed());

  /** While searching, every group with a match stays open whatever its folded state. */
  protected isOpen(group: string): boolean {
    return this.searching() || !this.collapsed().has(group);
  }

  protected toggle(group: string): void {
    if (this.searching()) {
      return;
    }
    const next = new Set(this.collapsed());
    if (!next.delete(group)) {
      next.add(group);
    }
    this.store(next);
  }

  protected setAll(collapsed: boolean): void {
    this.store(new Set(collapsed ? BLOCK_GROUPS : []));
  }

  private store(collapsed: Set<string>): void {
    this.collapsed.set(collapsed);
    try {
      globalThis.localStorage?.setItem(PALETTE_COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Unavailable in some private-browsing environments.
    }
  }

  protected readonly groups = computed<PaletteGroup[]>(() => {
    const query = this.query().trim().toLowerCase();
    const blocks = allBlocks().filter(
      (block) =>
        !query ||
        block.type.toLowerCase().includes(query) ||
        block.operation.label.toLowerCase().includes(query) ||
        block.operation.description.toLowerCase().includes(query),
    );
    return BLOCK_GROUPS.map((name) => ({
      name,
      blocks: blocks
        .filter((block) => block.group === name)
        .sort((left, right) => left.operation.label.localeCompare(right.operation.label)),
    })).filter((group) => group.blocks.length > 0);
  });

  protected onDragStart(event: DragEvent, block: BlockInfo): void {
    event.dataTransfer?.setData(BLOCK_MIME, block.type);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
}
