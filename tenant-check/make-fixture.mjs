import { readFileSync, writeFileSync } from 'node:fs';
import { CASES } from './cases.mjs';

const { ranAt, results } = JSON.parse(readFileSync(new URL('./tenant-results.json', import.meta.url), 'utf8'));
const rows = CASES.map(([label, transform]) => {
  const result = results[label];
  const expected = result.errors?.length
    ? { ok: false, tenantError: result.errors[0].split('\nCause: ')[1] ?? result.errors[0] }
    : { ok: true, value: result.value };
  return { label, transform, expected };
});
const source = `/**
 * Outputs recorded from an Identity Security Cloud tenant (identity preview, ${ranAt.slice(0, 10)}).
 * Every case runs against an identity whose middleName is null.
 */
export interface TenantCase {
  label: string;
  transform: unknown;
  expected: { ok: true; value: string | null } | { ok: false; tenantError: string };
}

export const TENANT_CASES: TenantCase[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(new URL('../src/app/transform/evaluator/tenant-cases.ts', import.meta.url), source);
