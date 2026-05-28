import type { SpanNode } from "./query.ts";

type FlatSpan = Omit<SpanNode, "children">;

/**
 * Assemble a flat list of spans into the nested trace tree.
 * - Roots are spans with `parentSpanId === null` (or a parent not present).
 * - Children are sorted by startTime so the tree reads top-to-bottom in order.
 * - Orphans (parent id set but missing) are promoted to roots rather than dropped.
 */
export function buildSpanTree(spans: FlatSpan[]): SpanNode[] {
  const nodes = new Map<string, SpanNode>();
  for (const s of spans) {
    nodes.set(s.spanId, { ...s, children: [] });
  }

  const roots: SpanNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentSpanId ? nodes.get(node.parentSpanId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byStart = (a: SpanNode, b: SpanNode) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  const sortDeep = (list: SpanNode[]) => {
    list.sort(byStart);
    for (const n of list) sortDeep(n.children);
  };
  sortDeep(roots);

  return roots;
}
