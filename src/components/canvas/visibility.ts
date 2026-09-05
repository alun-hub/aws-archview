import type { GraphModel } from '../../parser'

/**
 * Whether a node currently renders on the canvas — not itself hidden by the
 * "Node types" filter, and no ancestor is collapsed or hidden either.
 * Shared by the canvas's own node filtering and by search, so search can
 * tell a user their result is currently tucked away instead of just not
 * finding it.
 */
export function isNodeVisible(
  model: GraphModel,
  id: string,
  collapsedNodes: Set<string>,
  hiddenNodeIds: Set<string>,
): boolean {
  if (hiddenNodeIds.has(id)) return false
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))
  let pid = nodeMap.get(id)?.parentId
  while (pid) {
    if (collapsedNodes.has(pid) || hiddenNodeIds.has(pid)) return false
    pid = nodeMap.get(pid)?.parentId
  }
  return true
}

/** Ancestor chain of a node, nearest parent first — the ids that would need
 *  to be un-collapsed/un-hidden for the node itself to render. */
export function ancestorChain(model: GraphModel, id: string): string[] {
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))
  const chain: string[] = []
  const seen = new Set<string>([id])
  let cur = nodeMap.get(id)?.parentId
  while (cur && !seen.has(cur)) {
    chain.push(cur)
    seen.add(cur)
    cur = nodeMap.get(cur)?.parentId
  }
  return chain
}
