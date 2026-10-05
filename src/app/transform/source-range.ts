import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import { JsonPath, TransformGraph } from './model/transform-graph';

export interface SourceRange {
  from: number;
  to: number;
}

export function pathKey(path: JsonPath | undefined): string | null {
  return path ? JSON.stringify(path) : null;
}

/** Offsets of every node that has its own JSON, keyed by node id. */
export function sourceRanges(text: string, graph: TransformGraph): Map<string, SourceRange> {
  const ranges = new Map<string, SourceRange>();
  const tree = parseTree(text);
  if (!tree) {
    return ranges;
  }
  for (const node of graph.nodes) {
    if (!node.path) {
      continue;
    }
    const found = findNodeAtLocation(tree, node.path);
    if (found) {
      ranges.set(node.id, { from: found.offset, to: found.offset + found.length });
    }
  }
  return ranges;
}

/** Innermost node whose JSON contains the offset. */
export function nodeAtOffset(ranges: Map<string, SourceRange>, offset: number): string | null {
  let best: { id: string; size: number } | null = null;
  for (const [id, range] of ranges) {
    if (offset < range.from || offset > range.to) {
      continue;
    }
    const size = range.to - range.from;
    if (!best || size < best.size) {
      best = { id, size };
    }
  }
  return best?.id ?? null;
}
