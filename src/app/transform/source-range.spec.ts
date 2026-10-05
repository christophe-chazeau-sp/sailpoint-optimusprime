import { exampleText } from './examples';
import { parseTransform } from './parser/transform-parser';
import { nodeAtOffset, sourceRanges } from './source-range';

describe('sourceRanges', () => {
  it('maps nodes to their JSON text and finds the innermost node at an offset', () => {
    const text = exampleText('explicit-account');
    const result = parseTransform(JSON.parse(text));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const ranges = sourceRanges(text, result.graph);
    const account = result.graph.nodes.find((node) => node.type === 'accountAttribute');
    const range = account ? ranges.get(account.id) : undefined;
    expect(range).toBeTruthy();
    if (!account || !range) {
      return;
    }
    const slice = text.slice(range.from, range.to);
    expect(JSON.parse(slice)).toEqual(
      expect.objectContaining({ type: 'accountAttribute' }),
    );

    expect(nodeAtOffset(ranges, text.indexOf('Source 2'))).toBe(account.id);
    expect(nodeAtOffset(ranges, text.indexOf('"name"'))).toBe(result.graph.rootId);
  });

  it('returns nothing when the text is not JSON', () => {
    const result = parseTransform({ type: 'lower', attributes: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(sourceRanges('', result.graph).size).toBe(0);
    }
  });
});
