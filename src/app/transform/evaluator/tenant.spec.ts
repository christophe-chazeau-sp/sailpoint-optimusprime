import { evaluateTransform } from './evaluator';
import { TENANT_CASES } from './tenant-cases';

describe('agreement with the tenant', () => {
  it('produces the same output as Identity Security Cloud', () => {
    const mismatches: string[] = [];
    for (const item of TENANT_CASES) {
      const actual = evaluateTransform(item.transform, {
        implicitInput: null,
        accountAttributes: {},
        identityAttributes: { middleName: null },
      }).result;
      const expected = item.expected;
      const same = expected.ok
        ? actual.ok && (actual.value === null ? null : String(actual.value)) === expected.value
        : !actual.ok;
      if (!same) {
        const got = actual.ok ? JSON.stringify(actual.value) : `error: ${actual.error}`;
        const want = expected.ok ? JSON.stringify(expected.value) : `error: ${expected.tenantError}`;
        mismatches.push(`${item.label}: tenant ${want}, local ${got}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
