import type { GraphModel } from '../../parser'
import { KIND_LABEL } from './kindLabels'

/**
 * Progressive disclosure for large graphs.
 *
 * A "detail level" L means: show every node down to hierarchy depth L, and
 * collapse every container at depth >= L so its children stay hidden. Level 0
 * therefore collapses everything to the top-level containers, and the last
 * level expands the whole graph.
 *
 * Levels are derived from the graph itself rather than hardcoded per view, so
 * the same control works for Network (Account › Region › VPC › Subnet) and for
 * any other view with a parent hierarchy.
 */

export interface DetailLevel {
  /** Max hierarchy depth still expanded at this level. */
  level: number
  /** Kind-derived label, e.g. "VPC" — or "All" for the fully expanded level. */
  label: string
  /** Container ids to collapse to reach this level. */
  collapsedIds: string[]
  /** How many nodes stay visible at this level. */
  visibleCount: number
}

/** Above this many visible nodes a view is treated as too dense to open flat. */
export const DENSITY_BUDGET = 80

/** Subnet kinds differ by tier but sit at the same level — label them as one. */
function normalizeKind(kind: string): string {
  return kind.startsWith('subnet') ? 'subnet' : kind
}

/** Depth of every node, roots at 0. Parent references that don't resolve (or
 *  form a cycle) are treated as roots rather than throwing. */
export function computeDepths(model: GraphModel): Map<string, number> {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const depth = new Map<string, number>()

  const resolve = (id: string, seen: Set<string>): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    const parentId = byId.get(id)?.parentId
    let d = 0
    if (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId)
      d = resolve(parentId, seen) + 1
    }
    depth.set(id, d)
    return d
  }

  for (const n of model.nodes) resolve(n.id, new Set([n.id]))
  return depth
}

/**
 * Label a level after the container kind that dominates it — a level is a tier
 * of containers to expand, so leaves sitting at the same depth (a TGW or the
 * internet cloud next to the accounts) must not get a say in its name. When no
 * kind dominates, name the level after its top two rather than falling back to
 * something generic, which reads as a duplicate when two levels do it.
 */
function levelLabel(containerKinds: string[]): string {
  if (containerKinds.length === 0) return 'Detail'
  const counts = new Map<string, number>()
  for (const k of containerKinds) {
    const key = normalizeKind(k)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const label = (kind: string) => KIND_LABEL[kind] ?? kind
  if (ranked[0][1] / containerKinds.length >= 0.6 || ranked.length === 1) return label(ranked[0][0])
  return `${label(ranked[0][0])} / ${label(ranked[1][0])}`
}

export function computeDetailLevels(model: GraphModel | null): DetailLevel[] {
  if (!model || model.nodes.length === 0) return []

  const depth = computeDepths(model)
  const containerIds = new Set(model.nodes.filter((n) => n.parentId).map((n) => n.parentId!))
  const containers = model.nodes.filter((n) => containerIds.has(n.id))
  if (containers.length === 0) return []

  const maxContainerDepth = Math.max(...containers.map((n) => depth.get(n.id) ?? 0))

  const levels: DetailLevel[] = []
  const usedLabels = new Set<string>()
  for (let level = 0; level <= maxContainerDepth + 1; level++) {
    const containerKinds = containers.filter((n) => (depth.get(n.id) ?? 0) === level).map((n) => n.kind)
    // The last level expands everything; there is no deeper tier to name it after.
    let label = level > maxContainerDepth ? 'All' : levelLabel(containerKinds)
    // Two identical buttons would be indistinguishable — keep every label unique.
    if (usedLabels.has(label)) label = `${label} ${level}`
    usedLabels.add(label)
    levels.push({
      level,
      label,
      collapsedIds: containers.filter((n) => (depth.get(n.id) ?? 0) >= level).map((n) => n.id),
      visibleCount: model.nodes.filter((n) => (depth.get(n.id) ?? 0) <= level).length,
    })
  }
  return levels
}

/**
 * The level a view should open at: the most detail that still fits the density
 * budget. Graphs that fit whole open fully expanded, so small configs behave
 * exactly as before.
 */
export function defaultDetailLevel(levels: DetailLevel[], budget = DENSITY_BUDGET): number | null {
  if (levels.length === 0) return null
  const last = levels[levels.length - 1]
  if (last.visibleCount <= budget) return null
  const fitting = levels.filter((l) => l.visibleCount <= budget)
  // Even the top level overflows the budget — still the least dense option.
  return fitting.length > 0 ? fitting[fitting.length - 1].level : levels[0].level
}
