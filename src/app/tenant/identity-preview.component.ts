import { Component, computed, inject, input, output, signal } from '@angular/core';
import { StepResult } from '../transform/evaluator/evaluator';
import {
  browserTransport,
  IdentityAccount,
  IdentitySummary,
  ImplicitSource,
  listAccounts,
  previewOnTenant,
  searchIdentities,
  TenantPreview,
} from './isc-client';
import { TenantSession } from './tenant-session';

/** The identity the transform is previewed with, and the source attribute mapped as its input. */
export interface PreviewContext {
  identity: IdentitySummary;
  accounts: IdentityAccount[];
  implicit: ImplicitSource | null;
}

type TenantRun =
  | { state: 'busy' }
  | { state: 'done'; preview: TenantPreview; document: unknown }
  | { state: 'failed'; error: string };

@Component({
  selector: 'app-identity-preview',
  templateUrl: './identity-preview.component.html',
  styleUrl: './identity-preview.component.scss',
})
export class IdentityPreviewComponent {
  /** The connected transform; null when nothing is plugged into the output. */
  readonly document = input<Record<string, unknown> | null>(null);
  readonly needsImplicit = input(false);
  readonly localResult = input<StepResult | null>(null);
  readonly contextChange = output<PreviewContext | null>();

  private readonly session = inject(TenantSession);
  protected readonly connected = computed(() => this.session.connection() !== null);

  protected readonly query = signal('');
  protected readonly searching = signal(false);
  protected readonly results = signal<IdentitySummary[] | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly identity = signal<IdentitySummary | null>(null);
  protected readonly accounts = signal<IdentityAccount[]>([]);
  protected readonly loadingAccounts = signal(false);
  protected readonly sourceName = signal('');
  protected readonly attributeName = signal('');
  protected readonly run = signal<TenantRun | null>(null);

  protected readonly sources = computed(() => [...new Set(this.accounts().map((account) => account.sourceName))]);
  private readonly account = computed(() => this.accounts().find((item) => item.sourceName === this.sourceName()));
  protected readonly attributeNames = computed(() =>
    Object.keys(this.account()?.attributes ?? {}).sort((left, right) => left.localeCompare(right)),
  );
  protected readonly implicitValue = computed(() => this.account()?.attributes[this.attributeName()] ?? null);
  private readonly implicit = computed<ImplicitSource | null>(() =>
    this.sourceName() && this.attributeName()
      ? { sourceName: this.sourceName(), attributeName: this.attributeName() }
      : null,
  );

  /** Whether the tenant result still describes the current transform. */
  protected readonly stale = computed(() => {
    const run = this.run();
    return run?.state === 'done' && run.document !== this.document();
  });
  protected readonly agreement = computed<'match' | 'differ' | null>(() => {
    const run = this.run();
    const local = this.localResult();
    if (run?.state !== 'done' || !local || this.stale()) {
      return null;
    }
    const tenantFailed = run.preview.errors.length > 0;
    if (!local.ok || tenantFailed) {
      return !local.ok && tenantFailed ? 'match' : 'differ';
    }
    const localText = local.value === null ? null : String(local.value);
    return localText === run.preview.value ? 'match' : 'differ';
  });

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected async search(): Promise<void> {
    const connection = this.session.connection();
    if (!connection || this.searching()) {
      return;
    }
    this.searching.set(true);
    this.error.set(null);
    try {
      this.results.set(await searchIdentities(connection.apiBase, connection.token, this.query(), browserTransport()));
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.searching.set(false);
    }
  }

  protected async pick(identity: IdentitySummary): Promise<void> {
    const connection = this.session.connection();
    if (!connection) {
      return;
    }
    this.identity.set(identity);
    this.accounts.set([]);
    this.sourceName.set('');
    this.attributeName.set('');
    this.run.set(null);
    this.error.set(null);
    this.emit();
    this.loadingAccounts.set(true);
    try {
      const accounts = await listAccounts(connection.apiBase, connection.token, identity.id, browserTransport());
      if (this.identity() === identity) {
        this.accounts.set(accounts);
        this.emit();
      }
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.loadingAccounts.set(false);
    }
  }

  protected clear(): void {
    this.identity.set(null);
    this.accounts.set([]);
    this.sourceName.set('');
    this.attributeName.set('');
    this.run.set(null);
    this.error.set(null);
    this.contextChange.emit(null);
  }

  protected onSource(event: Event): void {
    this.sourceName.set((event.target as HTMLSelectElement).value);
    this.attributeName.set('');
    this.emit();
  }

  protected onAttribute(event: Event): void {
    this.attributeName.set((event.target as HTMLSelectElement).value);
    this.emit();
  }

  protected async runOnTenant(): Promise<void> {
    const connection = this.session.connection();
    const identity = this.identity();
    const document = this.document();
    if (!connection || !identity || !document || this.run()?.state === 'busy') {
      return;
    }
    this.run.set({ state: 'busy' });
    try {
      const preview = await previewOnTenant(
        connection.apiBase,
        connection.token,
        identity.id,
        document,
        this.needsImplicit() ? this.implicit() : null,
        browserTransport(),
      );
      this.run.set({ state: 'done', preview, document });
    } catch (error) {
      this.run.set({ state: 'failed', error: message(error) });
    }
  }

  private emit(): void {
    const identity = this.identity();
    this.contextChange.emit(identity ? { identity, accounts: this.accounts(), implicit: this.implicit() } : null);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The tenant could not be reached.';
}
