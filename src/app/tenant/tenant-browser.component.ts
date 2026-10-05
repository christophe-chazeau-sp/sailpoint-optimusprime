import { Component, computed, output, signal } from '@angular/core';
import {
  accessToken,
  bearerToken,
  browserTransport,
  listTransforms,
  ListedTransform,
} from './isc-client';
import { resolveTenant } from './tenant-address';

type AuthMode = 'jwt' | 'client';

const TENANT_KEY = 'sailpoint.optimusprime.tenant';
const MODE_KEY = 'sailpoint.optimusprime.authMode';

function stored(key: string): string {
  try {
    return globalThis.localStorage?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function remember(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Unavailable in some private-browsing environments.
  }
}

@Component({
  selector: 'app-tenant-browser',
  templateUrl: './tenant-browser.component.html',
  styleUrl: './tenant-browser.component.scss',
})
export class TenantBrowserComponent {
  readonly loaded = output<string>();

  protected readonly mode = signal<AuthMode>(stored(MODE_KEY) === 'client' ? 'client' : 'jwt');
  protected readonly tenant = signal(stored(TENANT_KEY));
  protected readonly token = signal('');
  protected readonly clientId = signal('');
  protected readonly clientSecret = signal('');
  protected readonly filter = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly transforms = signal<ListedTransform[]>([]);
  protected readonly selectedId = signal('');
  protected readonly filtered = computed(() => {
    const query = this.filter().trim().toLowerCase();
    const items = this.transforms();
    if (!query) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(query) || item.type.toLowerCase().includes(query));
  });

  protected setMode(mode: AuthMode): void {
    this.mode.set(mode);
    remember(MODE_KEY, mode);
  }

  protected onTenant(event: Event): void {
    this.tenant.set((event.target as HTMLInputElement).value);
  }

  protected onToken(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
  }

  protected onClientId(event: Event): void {
    this.clientId.set((event.target as HTMLInputElement).value);
  }

  protected onClientSecret(event: Event): void {
    this.clientSecret.set((event.target as HTMLInputElement).value);
  }

  protected onFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  protected async loadList(): Promise<void> {
    const resolved = resolveTenant(this.tenant());
    if ('error' in resolved) {
      this.error.set(resolved.error);
      return;
    }
    const mode = this.mode();
    const token = bearerToken(this.token());
    if (mode === 'jwt' && !token) {
      this.error.set('Paste a JWT access token.');
      return;
    }
    if (mode === 'client' && (!this.clientId().trim() || !this.clientSecret().trim())) {
      this.error.set('Enter a client ID and a client secret.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.status.set(mode === 'client' ? 'Signing in…' : 'Loading transforms…');
    this.transforms.set([]);
    this.selectedId.set('');
    try {
      const transport = browserTransport();
      const access =
        mode === 'jwt'
          ? token
          : await accessToken(resolved.apiBase, this.clientId().trim(), this.clientSecret().trim(), transport);
      this.status.set('Loading transforms…');
      const listed = await listTransforms(resolved.apiBase, access, transport);
      this.transforms.set(listed);
      this.status.set(listed.length === 1 ? '1 transform' : `${listed.length} transforms`);
      remember(TENANT_KEY, this.tenant().trim());
    } catch (error) {
      this.status.set('');
      this.error.set(error instanceof Error ? error.message : 'The tenant could not be reached.');
    } finally {
      this.busy.set(false);
    }
  }

  protected onPick(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedId.set(id);
    const item = this.transforms().find((transform) => transform.id === id);
    if (!item) {
      return;
    }
    this.loaded.emit(JSON.stringify(item.document, null, 2));
  }
}
