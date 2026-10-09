import { Injectable, signal } from '@angular/core';
import { ListedTransform } from './isc-client';

export interface TenantConnection {
  apiBase: string;
  /** Kept in memory only, never stored. */
  token: string;
}

/**
 * The tenant the user last signed in to, shared by the connection strip, the transform list and
 * the identity preview.
 */
@Injectable({ providedIn: 'root' })
export class TenantSession {
  readonly connection = signal<TenantConnection | null>(null);
  /** The tenant's transforms, loaded when signing in. */
  readonly transforms = signal<ListedTransform[]>([]);
  /** Whether the sign-in form under the connection strip is shown. */
  readonly signInOpen = signal(false);
}
