import { Injectable, signal } from '@angular/core';

export interface TenantConnection {
  apiBase: string;
  /** Kept in memory only, never stored. */
  token: string;
}

/** The tenant the user last signed in to, shared by the transform list and the identity preview. */
@Injectable({ providedIn: 'root' })
export class TenantSession {
  readonly connection = signal<TenantConnection | null>(null);
}
