import type { Shape } from './shapes'

/** One visited object in a config tree, with the shape describing it. */
export interface Visited {
  shape: Shape
  value: Record<string, unknown>
  /** Dotted path with list indices, e.g. "vpcs[1].subnets[0]". */
  path: string
  /** Readable identity for messages: `VPC "Prod-VPC"`, or the path when the
   *  item has no name field. */
  describe: string
}

function describe(shape: Shape, value: Record<string, unknown>, path: string): string {
  const name = shape.nameKey ? value[shape.nameKey] : undefined
  return typeof name === 'string' && name.length > 0
    ? `${shape.label} "${name}"`
    : `${shape.label} at ${path}`
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Walks a parsed config alongside its shape descriptor, yielding every object
 *  a shape covers. Anything the descriptors don't reach is skipped rather than
 *  guessed at — an undescribed subtree produces no findings, never wrong ones. */
export function walkShape(root: unknown, shape: Shape, rootPath = ''): Visited[] {
  const out: Visited[] = []

  const visit = (value: unknown, current: Shape, path: string) => {
    if (!isPlainObject(value)) return
    out.push({ shape: current, value, path, describe: describe(current, value, path || current.label) })

    for (const [key, child] of Object.entries(current.children ?? {})) {
      const nested = value[key]
      if (nested == null) continue
      if (child.list) {
        if (!Array.isArray(nested)) continue
        nested.forEach((item, i) => visit(item, child.shape, `${path}${path ? '.' : ''}${key}[${i}]`))
      } else {
        visit(nested, child.shape, `${path}${path ? '.' : ''}${key}`)
      }
    }
  }

  visit(root, shape, rootPath)
  return out
}
