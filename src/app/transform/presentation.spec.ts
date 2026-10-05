import { TRANSFORM_EXAMPLES } from './examples';
import { parseTransform } from './parser/transform-parser';
import { presentNode } from './presentation';

describe('presentNode', () => {
  it('labels root, operations, sources, and literals like workflow steps', () => {
    const example = TRANSFORM_EXAMPLES.find((item) => item.id === 'nested');
    const result = parseTransform(example?.document);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const views = result.graph.nodes.map((node) => presentNode(result.graph, node));
    expect(views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'Transform',
          title: 'Lower',
          detail: 'Lowercase display',
        }),
        expect.objectContaining({ category: 'Operation', title: 'Concatenation' }),
        expect.objectContaining({ category: 'Source', title: 'Replace' }),
        expect.objectContaining({ category: 'Literal', title: '"Foo"' }),
      ]),
    );
  });

  it('marks implicit input and unknown types', () => {
    const result = parseTransform({ type: 'lower', attributes: {} });
    const unknown = parseTransform({ type: 'mystery', attributes: {} });
    expect(result.ok && unknown.ok).toBe(true);
    if (!result.ok || !unknown.ok) {
      return;
    }
    const implicit = result.graph.nodes.find((node) => node.kind === 'implicit');
    expect(implicit && presentNode(result.graph, implicit)).toEqual(
      expect.objectContaining({ category: 'Input', title: 'Implicit input' }),
    );
    expect(presentNode(unknown.graph, unknown.graph.nodes[0]!)).toEqual(
      expect.objectContaining({ category: 'Unknown', tone: 'warning' }),
    );
  });
});
