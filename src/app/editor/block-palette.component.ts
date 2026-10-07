import { Component, computed, output, signal } from '@angular/core';
import { allBlocks, BLOCK_GROUPS, BlockInfo } from '../transform/catalog/blocks';
import { BLOCK_MIME } from './transform-canvas.component';

interface PaletteGroup {
  name: string;
  blocks: BlockInfo[];
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
    <div class="palette-list">
      @for (group of groups(); track group.name) {
        <section>
          <h3>{{ group.name }}</h3>
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

    .palette-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 10px 16px;
    }

    h3 {
      margin: 12px 4px 6px;
      color: #667085;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .block {
      display: flex;
      flex-direction: column;
      margin-bottom: 4px;
      padding: 6px 9px;
      border: 1px solid #dfe3ee;
      border-radius: 6px;
      background: #fff;
      cursor: grab;
      user-select: none;
    }

    .block:hover,
    .block:focus-visible {
      border-color: #4c6ef5;
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
