import { Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import {
  accessToken,
  bearerToken,
  browserTransport,
  listTransforms,
  ListedTransform,
  tokenClaims,
} from './isc-client';
import { resolveTenant } from './tenant-address';
import { TenantSession } from './tenant-session';

type AuthMode = 'jwt' | 'client';

const TENANT_KEY = 'sailpoint.optimusprime.tenant';
const MODE_KEY = 'sailpoint.optimusprime.authMode';
/** Below this, the countdown turns amber. */
const EXPIRY_WARNING_MS = 2 * 60_000;

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

/** `mm:ss`, or `h:mm:ss` from one hour. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

@Component({
  selector: 'app-tenant-browser',
  templateUrl: './tenant-browser.component.html',
  styleUrl: './tenant-browser.component.scss',
})
export class TenantBrowserComponent {
  readonly loaded = output<string>();
  private readonly session = inject(TenantSession);

  protected readonly mode = signal<AuthMode>(stored(MODE_KEY) === 'client' ? 'client' : 'jwt');
  protected readonly tenant = signal(stored(TENANT_KEY));
  protected readonly token = signal('');
  protected readonly clientId = signal('');
  protected readonly clientSecret = signal('');
  protected readonly search = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly transforms = signal<ListedTransform[]>([]);
  protected readonly selectedId = signal('');
  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const items = this.transforms();
    return query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;
  });

  /** Host of the connected tenant, shown in the banner. */
  protected readonly connectedTo = computed(() => {
    const connection = this.session.connection();
    return connection ? new URL(connection.apiBase).hostname.replace('.api.', '.') : null;
  });
  /** When the signed-in JWT expires; null for client credentials, which sign in again on reload. */
  private readonly expiresAt = signal<number | null>(null);
  private readonly now = signal(Date.now());
  protected readonly remaining = computed(() => {
    const expiresAt = this.expiresAt();
    return expiresAt === null ? null : expiresAt - this.now();
  });
  protected readonly remainingText = computed(() => {
    const remaining = this.remaining();
    return remaining === null ? '' : countdown(remaining);
  });
  protected readonly expiry = computed<'ok' | 'soon' | 'expired' | null>(() => {
    const remaining = this.remaining();
    if (remaining === null) return null;
    if (remaining <= 0) return 'expired';
    return remaining < EXPIRY_WARNING_MS ? 'soon' : 'ok';
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

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

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
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
    const claims = mode === 'jwt' ? tokenClaims(token) : null;
    if (claims?.issuer && claims.issuer !== resolved.apiBase.toLowerCase()) {
      this.error.set(`This token was issued by ${new URL(claims.issuer).hostname}, not by this tenant.`);
      return;
    }
    if (claims?.expiresAt && claims.expiresAt <= Date.now()) {
      this.error.set('This token has expired. Paste a new one.');
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
      this.session.connection.set({ apiBase: resolved.apiBase, token: access });
      this.expiresAt.set(claims?.expiresAt ?? null);
      this.transforms.set(listed);
      this.status.set('');
      remember(TENANT_KEY, this.tenant().trim());
    } catch (error) {
      this.status.set('');
      this.error.set(error instanceof Error ? error.message : 'The tenant could not be reached.');
    } finally {
      this.busy.set(false);
    }
  }

  protected disconnect(): void {
    this.session.connection.set(null);
    this.expiresAt.set(null);
    this.transforms.set([]);
    this.selectedId.set('');
    this.search.set('');
    this.token.set('');
    this.clientSecret.set('');
    this.error.set(null);
  }

  protected pick(item: ListedTransform): void {
    this.selectedId.set(item.id);
    this.loaded.emit(JSON.stringify(item.document, null, 2));
  }
}
