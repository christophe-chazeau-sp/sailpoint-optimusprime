import { pathKey } from '../source-range';
import { explainTransform } from './explain';

const step = (type: string, attributes: Record<string, unknown> = {}) => ({ type, attributes });
const summary = (document: unknown) => explainTransform(document).summary;
const dateCompare = (name: string, expression: string, operator: string, yes: unknown, no: unknown) =>
  step('dateCompare', {
    firstDate: step('identityAttribute', { name }),
    secondDate: step('dateMath', { expression }),
    operator,
    positiveCondition: yes,
    negativeCondition: no,
  });

describe('explainTransform', () => {
  it('reads sources and the implicit input', () => {
    expect(summary(step('lower'))).toBe('Returns the mapped source attribute in lowercase.');
    expect(summary(step('upper', { input: step('identityAttribute', { name: 'email' }) }))).toBe(
      "Returns the identity's `email` in uppercase.",
    );
    expect(
      summary(step('trim', { input: step('accountAttribute', { sourceName: 'HR', attributeName: 'department' }) })),
    ).toBe("Returns the `department` of the identity's `HR` account without surrounding spaces.");
  });

  it('mentions the transform name', () => {
    expect(summary({ name: 'Email', ...step('lower') })).toBe('“Email” returns the mapped source attribute in lowercase.');
  });

  it('reads text steps', () => {
    expect(
      summary(step('concat', { values: [step('identityAttribute', { name: 'firstname' }), '.', step('identityAttribute', { name: 'lastname' })] })),
    ).toBe("Returns the identity's `firstname`, '.' and the identity's `lastname` joined together.");
    expect(summary(step('join', { values: ['a', 'b'], separator: '-' }))).toBe("Returns 'a' and 'b' joined with '-'.");
    expect(summary(step('firstValid', { values: ['$x', 'none'], ignoreErrors: true }))).toBe(
      "Returns the first non-empty of: `x`, else 'none' (errors count as empty).",
    );
  });

  it('reads a lookup with its default', () => {
    expect(summary(step('lookup', { table: { US: 'United States', FR: 'France', default: 'Unknown' } }))).toBe(
      "Returns the mapped source attribute translated through a table of 2 entries (default 'Unknown').",
    );
    expect(summary(step('lookup', { input: 'x', table: { a: 'b' } }))).toBe(
      "Returns 'x' translated through a table of 1 entry (no default).",
    );
  });

  it('reads dateMath expressions', () => {
    const date = (expression: string, extra: Record<string, unknown> = {}) =>
      summary(step('dateMath', { expression, ...extra }));
    expect(date('now')).toBe('Returns now.');
    expect(date('now+45d')).toBe('Returns 45 days from now.');
    expect(date('now-60d/d')).toBe('Returns 60 days ago, rounded to the day.');
    expect(date('now+1y-2d')).toBe('Returns now plus 1 year minus 2 days.');
    expect(date('+1M')).toBe('Returns the mapped source attribute plus 1 month.');
    expect(date('/d', { input: step('identityAttribute', { name: 'hireDate' }), roundUp: true })).toBe(
      "Returns the identity's `hireDate`, rounded up to the day.",
    );
  });

  it('flattens the Lifecycle State chain into one sentence', () => {
    const lifecycle = dateCompare(
      'endDate',
      'now',
      'lte',
      'terminated',
      dateCompare(
        'startDate',
        'now',
        'lte',
        'active',
        dateCompare('startDate', 'now+45d', 'gt', 'leaveOfAbsence', dateCompare('startDate', 'now', 'GT', 'preHire', 'active')),
      ),
    );
    const explanation = explainTransform(lifecycle);
    expect(explanation.summary).toBe(
      "Returns 'terminated' if `endDate` is on or before now; otherwise 'active' if `startDate` is on or before now; " +
        "otherwise 'leaveOfAbsence' if `startDate` is after 45 days from now; otherwise 'preHire' if `startDate` is after now; " +
        "otherwise 'active'.",
    );
    expect(explanation.details).toEqual([]);
    expect(explanation.steps.get(pathKey([]) as string)).toBe(
      "Returns 'terminated' if `endDate` is on or before now, otherwise the Date Compare result.",
    );
  });

  it('reads a conditional with its variables, and notes the forceNull pitfall', () => {
    const document = {
      name: 'companyAttributeCloudEnabled',
      ...step('firstValid', {
        ignoreErrors: true,
        values: [
          step('replace', {
            regex: 'NULL_VALUE',
            replacement: '#set($forceNull = null)$forceNull',
            input: step('conditional', {
              termDate: step('identityAttribute', { name: 'termDate' }),
              expression: '$termDate eq ACTIVE',
              positiveCondition: 'O365-S',
              negativeCondition: step('dateCompare', {
                firstDate: step('dateFormat', {
                  input: step('replace', { regex: 'ACTIVE', replacement: '19991231', input: '$termDate' }),
                  inputFormat: 'yyyyMMdd',
                  outputFormat: 'ISO8601',
                }),
                secondDate: step('dateMath', { expression: 'now-60d/d' }),
                operator: 'lt',
                positiveCondition: 'NULL_VALUE',
                negativeCondition: 'O365-S',
              }),
            }),
          }),
        ],
      }),
    };
    const explanation = explainTransform(document);
    expect(explanation.summary).toBe(
      '“companyAttributeCloudEnabled” returns the first non-empty of: ' +
        "('O365-S' if `termDate` is 'ACTIVE'; otherwise 'NULL_VALUE' if calculated value A (see below) reformatted from `yyyyMMdd` to `ISO8601` is before 60 days ago, rounded to the day; otherwise 'O365-S') " +
        'with matches of `NULL_VALUE` replaced by the Velocity template `#set($forceNull = null)$forceNull` (errors count as empty).',
    );
    expect(explanation.details).toEqual([
      "Where `termDate` is the identity's `termDate`.",
      "Where calculated value A is `termDate` with matches of `ACTIVE` replaced by '19991231'.",
    ]);
    expect(explanation.notes).toHaveLength(2);
    expect(explanation.notes[0]).toContain('#set($x = null)$x');
    expect(explanation.notes[1]).toContain('Velocity');

    const conditional = pathKey(['attributes', 'values', 0, 'attributes', 'input']) as string;
    expect(explanation.steps.get(conditional)).toBe(
      "Returns 'O365-S' if `termDate` is 'ACTIVE' (where `termDate` is the identity's `termDate`), otherwise the Date Compare result.",
    );
  });

  it('explains steps deeper than the readability limit below the summary', () => {
    const deep = step('upper', { input: step('trim', { input: step('lower', { input: step('base64Decode', { input: step('base64Encode') }) }) }) });
    const explanation = explainTransform(deep);
    expect(explanation.summary).toBe(
      'Returns calculated value A (see below) decoded from Base64 in lowercase without surrounding spaces in uppercase.',
    );
    expect(explanation.details).toEqual(['Where calculated value A is the mapped source attribute encoded in Base64.']);
  });

  it('describes every step on its own line', () => {
    const explanation = explainTransform(step('lower', { input: step('concat', { values: ['a', step('uuid')] }) }));
    expect(explanation.steps.get(pathKey([]) as string)).toBe('Returns the Concatenation result in lowercase.');
    expect(explanation.steps.get(pathKey(['attributes', 'input']) as string)).toBe(
      "Returns 'a' and a new random UUID joined together.",
    );
    expect(explanation.steps.get(pathKey(['attributes', 'input', 'attributes', 'values', 1]) as string)).toBe(
      'Returns a new random UUID.',
    );
  });

  it('names an unknown type', () => {
    expect(summary(step('notAType'))).toBe('Returns a `notAType` step.');
    expect(explainTransform(step('static', { value: 'x' })).notes).toEqual([]);
  });
});
