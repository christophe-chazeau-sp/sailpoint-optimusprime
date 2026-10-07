import { TRANSFORM_EXAMPLES } from '../examples';
import { graphNode, parseTransform } from './transform-parser';

describe('parseTransform', () => {
  it('parses every built-in example', () => {
    for (const example of TRANSFORM_EXAMPLES) {
      const result = parseTransform(example.document);
      expect(result.ok, example.id).toBe(true);
    }
  });

  it('shows an implicit input when a consuming transform names none', () => {
    const result = parseTransform({
      name: 'Lowercase Department',
      type: 'lower',
      attributes: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const root = graphNode(result.graph, result.graph.rootId);
    const implicit = result.graph.nodes.find((node) => node.kind === 'implicit');
    expect(root?.name).toBe('Lowercase Department');
    expect(implicit).toBeTruthy();
    expect(result.graph.edges).toEqual([
      expect.objectContaining({
        sourceId: implicit?.id,
        targetId: result.graph.rootId,
        label: 'Implicit input',
      }),
    ]);
  });

  it('shows no implicit input for a dateMath computed from now', () => {
    const fromNow = parseTransform({ type: 'dateMath', attributes: { expression: 'now+45d' } });
    const fromInput = parseTransform({ type: 'dateMath', attributes: { expression: '+45d' } });
    expect(fromNow.ok && fromNow.graph.nodes.some((node) => node.kind === 'implicit')).toBe(false);
    expect(fromInput.ok && fromInput.graph.nodes.some((node) => node.kind === 'implicit')).toBe(true);
  });

  it('uses an explicit account attribute instead of an implicit input', () => {
    const result = parseTransform({
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
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes.some((node) => node.kind === 'implicit')).toBe(false);
    const account = result.graph.nodes.find((node) => node.type === 'accountAttribute');
    expect(account?.summary).toContain('sourceName: Source 2');
    expect(result.graph.edges[0]).toEqual(
      expect.objectContaining({ label: 'input', targetId: result.graph.rootId }),
    );
  });

  it('keeps a string input as configuration', () => {
    const result = parseTransform({
      type: 'replace',
      attributes: { input: 'Bar', regex: 'Bar', replacement: 'Baz' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes).toHaveLength(1);
    expect(result.graph.nodes[0]?.attributes).toEqual(
      expect.arrayContaining([
        { key: 'input', value: 'Bar' },
        { key: 'replacement', value: 'Baz' },
      ]),
    );
  });

  it('mixes literals and nested transforms in concatenation values', () => {
    const example = TRANSFORM_EXAMPLES.find((item) => item.id === 'concat');
    const result = parseTransform(example?.document);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes.filter((node) => node.kind === 'literal')).toHaveLength(2);
    expect(result.graph.nodes.filter((node) => node.type === 'accountAttribute')).toHaveLength(2);
    expect(result.graph.edges.map((edge) => edge.label)).toEqual([
      'values[0]',
      'values[1]',
      'values[2]',
      'values[3]',
    ]);
  });

  it('draws literal conditional branches as inputs', () => {
    const example = TRANSFORM_EXAMPLES.find((item) => item.id === 'conditional');
    const result = parseTransform(example?.document);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.edges.map((edge) => edge.label)).toEqual(
      expect.arrayContaining(['positiveCondition', 'negativeCondition', 'department']),
    );
    const positive = result.graph.nodes.find((node) => node.summary === 'true');
    expect(positive?.kind).toBe('literal');
  });

  it('draws a dashed reference from a conditional variable to the step that reads it', () => {
    const result = parseTransform({
      type: 'conditional',
      attributes: {
        termDate: { type: 'substring', attributes: { begin: 0 } },
        expression: '$termDate eq ACTIVE',
        positiveCondition: 'O365-S',
        negativeCondition: {
          type: 'replace',
          attributes: { regex: 'ACTIVE', replacement: '19991231', input: '$termDate' },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const reference = result.graph.edges.find((edge) => edge.reference);
    const conditional = result.graph.nodes.find((node) => node.type === 'conditional');
    const replace = result.graph.nodes.find((node) => node.type === 'replace');
    expect(reference).toMatchObject({
      label: '$termDate',
      sourceId: conditional?.id,
      targetId: replace?.id,
    });
    expect(result.graph.edges.some((edge) => edge.label === 'termDate' && !edge.reference)).toBe(true);
  });

  it('connects static template variables and keeps the Velocity template', () => {
    const example = TRANSFORM_EXAMPLES.find((item) => item.id === 'static');
    const result = parseTransform(example?.document);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const root = graphNode(result.graph, result.graph.rootId);
    expect(root?.velocityTemplate).toBe('$workerType');
    expect(result.graph.edges).toEqual([
      expect.objectContaining({ label: 'workerType', targetId: result.graph.rootId }),
    ]);
  });

  it('flags the steps that are calculated with Velocity', () => {
    const flagged = (document: unknown) => {
      const result = parseTransform(document);
      return result.ok ? result.graph.nodes.filter((node) => node.usesVelocity).map((node) => node.type) : [];
    };
    expect(flagged(TRANSFORM_EXAMPLES.find((item) => item.id === 'static')?.document)).toEqual(['static']);
    expect(flagged({ type: 'replace', attributes: { input: 'a', regex: 'a', replacement: '#set($x = 1)$x' } })).toEqual([
      'replace',
    ]);
    expect(
      flagged({ type: 'concat', attributes: { values: ['$first', { type: 'lower', attributes: { input: 'A' } }] } }),
    ).toEqual(['concat']);
    expect(flagged({ type: 'lower', attributes: { input: 'Price: 5$' } })).toEqual([]);
  });

  it('records the JSON path of each node', () => {
    const example = TRANSFORM_EXAMPLES.find((item) => item.id === 'concat');
    const result = parseTransform(example?.document);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes.map((node) => node.path)).toEqual(
      expect.arrayContaining([
        [],
        ['attributes', 'values', 0],
        ['attributes', 'values', 1],
      ]),
    );
  });

  it('nests a date format inside date compare', () => {
    const example = TRANSFORM_EXAMPLES.find((item) => item.id === 'date-compare');
    const result = parseTransform(example?.document);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const types = result.graph.nodes.map((node) => node.type);
    expect(types).toContain('dateCompare');
    expect(types).toContain('dateFormat');
    expect(types).toContain('accountAttribute');
    const root = graphNode(result.graph, result.graph.rootId);
    expect(root?.attributes).toEqual(
      expect.arrayContaining([{ key: 'operator', value: 'lte' }]),
    );
    expect(result.graph.nodes.some((node) => node.kind === 'implicit')).toBe(false);
  });

  it('leaves a lookup table on the node', () => {
    const result = parseTransform({
      type: 'lookup',
      attributes: {
        input: {
          type: 'accountAttribute',
          attributes: { sourceName: 'HR', attributeName: 'dept' },
        },
        table: { eng: 'Engineering', hr: 'Human Resources' },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const root = graphNode(result.graph, result.graph.rootId);
    expect(root?.attributes).toEqual(
      expect.arrayContaining([
        { key: 'table', value: '{"eng":"Engineering","hr":"Human Resources"}' },
      ]),
    );
    expect(result.graph.nodes).toHaveLength(2);
  });

  it('does not expand a reference transform', () => {
    const result = parseTransform({
      type: 'reference',
      attributes: { id: 'Lowercase Department' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes).toHaveLength(1);
    expect(result.graph.nodes[0]?.summary).toContain('Lowercase Department');
    expect(result.graph.edges).toHaveLength(0);
  });

  it('renders an unknown type with a warning flag', () => {
    const result = parseTransform({ type: 'notARealTransform', attributes: { keep: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes[0]).toEqual(
      expect.objectContaining({
        type: 'notARealTransform',
        label: 'Not A Real Transform',
        unknownType: true,
      }),
    );
  });

  it('stops when a transform references itself', () => {
    const cycle: Record<string, unknown> = { type: 'lower', attributes: {} };
    (cycle['attributes'] as Record<string, unknown>)['input'] = cycle;
    const result = parseTransform(cycle);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.graph.nodes.filter((node) => node.kind === 'operation')).toHaveLength(1);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0]?.sourceId).toBe(result.graph.edges[0]?.targetId);
  });

  it('rejects documents that are not one transform object', () => {
    const arrayResult = parseTransform([]);
    expect(arrayResult.ok).toBe(false);
    if (!arrayResult.ok) {
      expect(arrayResult.message).toBe('Expected a single transform object.');
    }
    expect(parseTransform(null)).toEqual({
      ok: false,
      message: 'A transform must be a JSON object.',
    });
    expect(parseTransform({ name: 'Missing type' })).toEqual({
      ok: false,
      message: 'The transform is missing a string type.',
    });
    expect(parseTransform({ type: 'lower', attributes: [] })).toEqual({
      ok: false,
      message: 'The attributes property must be an object.',
    });
  });

  it('accepts an API payload that includes id and internal', () => {
    const result = parseTransform({
      id: '2cd78ad',
      name: 'Timestamp To Date',
      type: 'dateFormat',
      internal: false,
      attributes: { inputFormat: 'ISO8601', outputFormat: 'yyyy-MM-dd' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const root = graphNode(result.graph, result.graph.rootId);
    expect(root?.attributes).toEqual(
      expect.arrayContaining([
        { key: 'id', value: '2cd78ad' },
        { key: 'internal', value: 'false' },
      ]),
    );
    expect(result.graph.nodes.some((node) => node.kind === 'implicit')).toBe(true);
  });
});
