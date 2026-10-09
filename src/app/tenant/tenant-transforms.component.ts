import { Component, computed, inject, output, signal } from '@angular/core';
import { ListedTransform } from './isc-client';
import { TenantSession } from './tenant-session';

/** The Tenant tab of "Open a transform": search the tenant's transforms by name and load one. */
@Component({
  selector: 'app-tenant-transforms',
  template: `
    @if (session.connection()) {
      @if (session.transforms().length) {
        <div class="search-row">
          <input
            type="search"
            spellcheck="false"
            autocomplete="off"
            placeholder="Search transform names"
            aria-label="Search transform names"
            data-testid="transform-search"
            [value]="search()"
            (input)="search.set($any($event.target).value)"
          />
          <small class="count">{{ filtered().length }} of {{ session.transforms().length }}</small>
        </div>
        <ul class="results" data-testid="transform-results">
          @for (item of filtered(); track item.id) {
            <li>
              <button
                type="button"
                [class.on]="item.id === selectedId()"
                [attr.aria-pressed]="item.id === selectedId()"
                [title]="item.name"
                (click)="pick(item)"
              >
                <span class="name">{{ item.name }}</span>
                @if (item.type) {
                  <small>{{ item.type }}</small>
                }
              </button>
            </li>
          } @empty {
            <li class="hint none">No transform name contains “{{ search().trim() }}”.</li>
          }
        </ul>
      } @else {
        <p class="hint">This tenant has no transforms.</p>
      }
    } @else {
      <p class="hint">Connect to a tenant to search its transforms.</p>
      <button type="button" class="connect" data-testid="open-sign-in" (click)="session.signInOpen.set(true)">
        Connect to a tenant
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .search-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    input {
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      height: 34px;
      padding: 0 10px;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      background: #fff;
      color: #1d2939;
      font: inherit;
      font-size: 13px;
    }

    input:focus {
      border-color: #0071ce;
      outline: none;
      box-shadow: 0 0 0 3px rgb(0 113 206 / 15%);
    }

    .count {
      flex: none;
      color: #667085;
      font-size: 12px;
    }

    .hint {
      margin: 0;
      color: #667085;
      font-size: 12px;
    }

    .connect {
      align-self: flex-start;
      height: 32px;
      padding: 0 12px;
      border: 1px solid #0033a1;
      border-radius: 8px;
      background: #fff;
      color: #0033a1;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .connect:hover {
      background: #e8f2fc;
    }

    .results {
      max-height: 200px;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      list-style: none;
    }

    .results li + li {
      border-top: 1px solid #f2f4f7;
    }

    .results .none {
      padding: 8px 10px;
    }

    .results button {
      display: flex;
      align-items: baseline;
      gap: 8px;
      width: 100%;
      padding: 6px 10px;
      border: 0;
      background: #fff;
      color: #1d2939;
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }

    .results button:hover {
      background: #f0f4ff;
    }

    .results button.on {
      background: #e0eaff;
      color: #0033a1;
      font-weight: 600;
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .results small {
      flex: none;
      color: #667085;
      font-size: 11px;
      font-weight: 400;
    }
  `,
})
export class TenantTransformsComponent {
  readonly loaded = output<string>();
  protected readonly session = inject(TenantSession);
  protected readonly search = signal('');
  protected readonly selectedId = signal('');
  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const items = this.session.transforms();
    return query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;
  });

  protected pick(item: ListedTransform): void {
    this.selectedId.set(item.id);
    this.loaded.emit(JSON.stringify(item.document, null, 2));
  }
}
