export interface TransformExample {
  id: string;
  label: string;
  document: unknown;
}

export const TRANSFORM_EXAMPLES: TransformExample[] = [
  {
    id: 'nested',
    label: 'Nested lowercase',
    document: {
      name: 'Lowercase display',
      type: 'lower',
      attributes: {
        input: {
          type: 'concat',
          attributes: {
            values: [
              'Foo',
              {
                type: 'replace',
                attributes: {
                  input: 'Bar',
                  regex: 'Bar',
                  replacement: 'Baz',
                },
              },
            ],
          },
        },
      },
    },
  },
  {
    id: 'implicit-lower',
    label: 'Lowercase, implicit input',
    document: {
      name: 'Lowercase Department',
      type: 'lower',
      attributes: {},
    },
  },
  {
    id: 'explicit-account',
    label: 'Lowercase, explicit account',
    document: {
      name: 'Lowercase Department',
      type: 'lower',
      attributes: {
        input: {
          type: 'accountAttribute',
          attributes: {
            attributeName: 'department',
            sourceName: 'Source 2',
          },
        },
      },
    },
  },
  {
    id: 'concat',
    label: 'Concatenation',
    document: {
      name: 'Test Concat Transform',
      type: 'concat',
      attributes: {
        values: [
          {
            type: 'accountAttribute',
            attributes: {
              sourceName: 'HR Source',
              attributeName: 'FirstName',
            },
          },
          ' ',
          {
            type: 'accountAttribute',
            attributes: {
              sourceName: 'HR Source',
              attributeName: 'LastName',
            },
          },
          ' (Contractor)',
        ],
      },
    },
  },
  {
    id: 'static',
    label: 'Static template',
    document: {
      name: 'Static Transform',
      type: 'static',
      attributes: {
        value: '$workerType',
        workerType: {
          type: 'accountAttribute',
          attributes: {
            sourceName: 'HR Source',
            attributeName: 'empType',
          },
        },
      },
    },
  },
  {
    id: 'conditional',
    label: 'Conditional',
    document: {
      name: 'Test Conditional Transform',
      type: 'conditional',
      attributes: {
        expression: '$department eq Science',
        positiveCondition: 'true',
        negativeCondition: 'false',
        department: {
          type: 'accountAttribute',
          attributes: {
            sourceName: 'HR Source',
            attributeName: 'department',
          },
        },
      },
    },
  },
  {
    id: 'date-compare',
    label: 'Date compare',
    document: {
      name: 'Date Compare Transform',
      type: 'dateCompare',
      attributes: {
        firstDate: {
          type: 'dateFormat',
          attributes: {
            input: {
              type: 'accountAttribute',
              attributes: {
                sourceName: 'HR Source',
                attributeName: 'hire_date',
              },
            },
            inputFormat: 'M/d/yyyy',
            outputFormat: 'ISO8601',
          },
        },
        secondDate: '1996-01-01T00:00:00Z',
        operator: 'lte',
        positiveCondition: 'legacy',
        negativeCondition: 'regular',
      },
    },
  },
];

export const DEFAULT_EXAMPLE_ID = 'nested';

export function exampleText(id: string): string {
  const example =
    TRANSFORM_EXAMPLES.find((item) => item.id === id) ?? TRANSFORM_EXAMPLES[0];
  return JSON.stringify(example.document, null, 2);
}
