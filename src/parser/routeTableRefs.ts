import type { RouteTableRef } from './types'

/**
 * Route table names from an association or propagation list.
 *
 * LZA's schema declares these as `string[]` — a plain list of route table
 * names. Hand-written configs (and this project's own samples, before this was
 * checked against the schema) sometimes use `- routeTableName: X` objects
 * instead. Both are accepted here so neither shape silently reads as an empty
 * list, which is how a missing propagation used to disappear from the diagram.
 */
export function routeTableNames(refs: RouteTableRef[] | undefined): string[] {
  const out: string[] = []
  for (const ref of refs ?? []) {
    if (typeof ref === 'string') {
      if (ref) out.push(ref)
    } else if (ref?.routeTableName) {
      out.push(ref.routeTableName)
    }
  }
  return out
}
