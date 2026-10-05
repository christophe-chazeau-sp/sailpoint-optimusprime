import { TRANSFORM_EXAMPLES } from '../examples';
import { pathKey } from '../source-range';
import { accountKey, evaluateTransform, EvaluationInputs, requiredInputs, stepInputs } from './evaluator';

const NOW = new Date('2026-10-05T10:00:00Z');

function inputs(overrides: Partial<EvaluationInputs> = {}): EvaluationInputs {
  return { implicitInput: null, accountAttributes: {}, identityAttributes: {}, now: NOW, ...overrides };
}

function example(id: string): unknown {
  return TRANSFORM_EXAMPLES.find((item) => item.id === id)?.document;
}

function run(document: unknown, overrides: Partial<EvaluationInputs> = {}) {
  return evaluateTransform(document, inputs(overrides));
}

describe('evaluateTransform', () => {
  it('calculates the nested example and records every step', () => {
    const evaluation = run(example('nested'));
    expect(evaluation.result).toEqual({ ok: true, value: 'foobaz' });
    expect(evaluation.steps.get(pathKey(['attributes', 'input', 'attributes', 'values', 1]) as string)).toEqual({
      ok: true,
      value: 'Baz',
    });
  });

  it('uses the implicit input when no input is given', () => {
    expect(run(example('implicit-lower'), { implicitInput: 'Engineering' }).result).toEqual({
      ok: true,
      value: 'engineering',
    });
    expect(run(example('implicit-lower')).result).toEqual({ ok: true, value: null });
  });

  it('reads account attributes by source and name', () => {
    const evaluation = run(example('concat'), {
      accountAttributes: {
        [accountKey('HR Source', 'FirstName')]: 'Ada',
        [accountKey('HR Source', 'LastName')]: 'Lovelace',
      },
    });
    expect(evaluation.result).toEqual({ ok: true, value: 'Ada Lovelace (Contractor)' });
  });

  it('renders static templates with variables', () => {
    const evaluation = run(example('static'), {
      accountAttributes: { [accountKey('HR Source', 'empType')]: 'Employee' },
    });
    expect(evaluation.result).toEqual({ ok: true, value: 'Employee' });
  });

  it('chooses the conditional branch', () => {
    const science = { [accountKey('HR Source', 'department')]: 'Science' };
    expect(run(example('conditional'), { accountAttributes: science }).result).toEqual({
      ok: true,
      value: 'true',
      variables: [{ name: 'department', value: 'Science' }],
    });
    expect(run(example('conditional'), { accountAttributes: { [accountKey('HR Source', 'department')]: 'Art' } }).result)
      .toEqual({ ok: true, value: 'false', variables: [{ name: 'department', value: 'Art' }] });
  });

  it('evaluates variables declared on a conditional and reuses them in the branch', () => {
    const document = {
      type: 'firstValid',
      attributes: {
        ignoreErrors: true,
        values: [
          {
            type: 'replace',
            attributes: {
              regex: 'NULL_VALUE',
              replacement: '#set($forceNull = null)$forceNull',
              input: {
                type: 'conditional',
                attributes: {
                  termDate: {
                    type: 'replace',
                    attributes: {
                      regex: '^(?!\\d{8}$).*$',
                      replacement: 'ACTIVE',
                      input: {
                        type: 'firstValid',
                        attributes: {
                          values: [{ type: 'substring', attributes: { begin: 0 } }, 'ACTIVE'],
                        },
                      },
                    },
                  },
                  expression: '$termDate eq ACTIVE',
                  positiveCondition: 'O365-S',
                  negativeCondition: {
                    type: 'dateCompare',
                    attributes: {
                      firstDate: {
                        type: 'dateFormat',
                        attributes: {
                          input: {
                            type: 'replace',
                            attributes: {
                              regex: 'ACTIVE',
                              replacement: '19991231',
                              input: '$termDate',
                            },
                          },
                          inputFormat: 'yyyyMMdd',
                          outputFormat: 'ISO8601',
                        },
                      },
                      secondDate: { type: 'dateMath', attributes: { expression: 'now-60d/d' } },
                      operator: 'lt',
                      positiveCondition: 'NULL_VALUE',
                      negativeCondition: 'O365-S',
                    },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const active = run(document, { implicitInput: null });
    const conditional = active.steps.get(pathKey(['attributes', 'values', 0, 'attributes', 'input']) as string);
    expect(conditional).toMatchObject({
      ok: true,
      value: 'O365-S',
      variables: [{ name: 'termDate', value: 'ACTIVE' }],
    });
    expect(active.result).toEqual({ ok: true, value: 'O365-S' });

    const recent = run(document, { implicitInput: '20260901' });
    expect(recent.steps.get(pathKey(['attributes', 'values', 0, 'attributes', 'input']) as string)).toMatchObject({
      variables: [{ name: 'termDate', value: '20260901' }],
      value: 'O365-S',
    });

    const ended = run(document, { implicitInput: '20200101' });
    expect(ended.steps.get(pathKey(['attributes', 'values', 0, 'attributes', 'input']) as string)).toMatchObject({
      variables: [{ name: 'termDate', value: '20200101' }],
      value: 'NULL_VALUE',
    });
    expect(ended.result).toEqual({ ok: true, value: null });
  });

  it('formats and compares dates', () => {
    const hired = (date: string) =>
      run(example('date-compare'), { accountAttributes: { [accountKey('HR Source', 'hire_date')]: date } }).result;
    expect(hired('5/1/1990')).toEqual({ ok: true, value: 'legacy' });
    expect(hired('5/1/2001')).toEqual({ ok: true, value: 'regular' });
  });

  it('reports the failing step and marks its parents', () => {
    const document = {
      type: 'upper',
      attributes: { input: { type: 'lookup', attributes: { input: 'x', table: { a: 'b' } } } },
    };
    const evaluation = run(document);
    expect(evaluation.result.ok).toBe(false);
    const child = evaluation.steps.get(pathKey(['attributes', 'input']) as string);
    expect(child).toEqual({ ok: false, error: 'The lookup table has no entry for "x" and no "default".' });
    expect(evaluation.steps.get(pathKey([]) as string)).toMatchObject({ ok: false, upstream: true });
  });

  it('covers the common string operations', () => {
    const cases: [unknown, unknown][] = [
      [{ type: 'substring', attributes: { input: 'abcdef', begin: 1, end: 3 } }, 'bc'],
      [{ type: 'split', attributes: { input: 'a-b-c', delimiter: '-', index: 2 } }, 'c'],
      [{ type: 'leftPad', attributes: { input: '7', length: '3', padding: '0' } }, '007'],
      [{ type: 'replace', attributes: { input: 'a1b2', regex: '[0-9]', replacement: '' } }, 'ab'],
      [{ type: 'join', attributes: { values: ['a', 'b'], separator: '+' } }, 'a+b'],
      [{ type: 'firstValid', attributes: { values: [null, '', 'x'] } }, 'x'],
      [{ type: 'base64Encode', attributes: { input: 'hé' } }, 'aMOp'],
      [{ type: 'decomposeDiacriticalMarks', attributes: { input: 'Électricité' } }, 'Electricite'],
      [{ type: 'normalizeNames', attributes: { input: 'JOHN VON NEUMANN' } }, 'John von Neumann'],
      [{ type: 'indexOf', attributes: { input: 'hello', substring: 'l' } }, 2],
      [{ type: 'lookup', attributes: { input: 'US', table: { US: 'United States', default: '?' } } }, 'United States'],
      [{ type: 'e164phone', attributes: { input: '(512) 555-0100', defaultRegion: 'US' } }, '+15125550100'],
      [{ type: 'iso3166', attributes: { input: 'France' } }, 'FR'],
      [{ type: 'dateMath', attributes: { expression: 'now+1d/d' } }, '2026-10-06T00:00:00.000Z'],
      [{ type: 'static', attributes: { value: '#if($a == "x")yes#{else}no#end', a: 'x' } }, 'yes'],
    ];
    for (const [document, expected] of cases) {
      expect(run(document).result).toEqual({ ok: true, value: expected });
    }
  });
});

describe('requiredInputs', () => {
  it('lists the implicit input and attribute lookups once each', () => {
    expect(requiredInputs(example('implicit-lower')).map((item) => item.kind)).toEqual(['implicit']);
    expect(requiredInputs(example('concat')).map((item) => item.key)).toEqual([
      accountKey('HR Source', 'FirstName'),
      accountKey('HR Source', 'LastName'),
    ]);
    expect(requiredInputs(example('nested'))).toEqual([]);
  });
});

describe('stepInputs', () => {
  it('lists firstValid candidates and marks the one it selected', () => {
    const document = {
      type: 'firstValid',
      attributes: {
        values: [
          { type: 'identityAttribute', attributes: { name: 'nickname' } },
          { type: 'identityAttribute', attributes: { name: 'firstname' } },
          'Unknown',
        ],
      },
    };
    const evaluation = run(document, { identityAttributes: { nickname: null, firstname: 'Ada' } });
    expect(stepInputs(document, [], evaluation, null)).toEqual([
      { key: 'values[0]', source: 'Identity Attribute', result: { ok: true, value: null }, chosen: false },
      { key: 'values[1]', source: 'Identity Attribute', result: { ok: true, value: 'Ada' }, chosen: true },
      { key: 'values[2]', source: 'Literal', result: { ok: true, value: 'Unknown' }, chosen: false },
    ]);
  });

  it('shows the implicit input, table entries and the chosen lookup entry', () => {
    const document = { type: 'lookup', attributes: { table: { US: 'United States', default: '?' } } };
    const rows = stepInputs(document, [], run(document, { implicitInput: 'FR' }), 'FR');
    expect(rows.map((row) => [row.key, row.source, row.chosen])).toEqual([
      ['input', 'Implicit input', false],
      ['table › US', 'Literal', false],
      ['table › default', 'Literal', true],
    ]);
  });

  it('marks the conditional branch it took', () => {
    const rows = stepInputs(example('conditional'), [], run(example('conditional')), null);
    expect(rows.filter((row) => row.chosen).map((row) => row.key)).toHaveLength(1);
  });
});
