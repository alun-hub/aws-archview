import type { OUConfig } from './types'

/** One OU, with its place in the tree resolved. */
export interface FlatOu {
  /** Full path, e.g. "Workloads/Dev" — how every other config file names it. */
  path: string
  /** Last path segment, for display. */
  label: string
  /** Path of the OU above it, or null when it sits directly under Root. */
  parentPath: string | null
  ignore: boolean
  tags?: Record<string, string>
}

/**
 * Every OU in an organization config, as a flat list with resolved parentage.
 *
 * LZA declares OUs as a flat list whose `name` carries the whole path —
 * `Workloads`, then `Workloads/Dev` — and requires every OU in a path to be
 * listed. Nesting via a child `organizationalUnits` array is not part of the
 * schema; this project's own samples used to do that, and the parser recursed
 * into it while never splitting a path, so a real LZA config drew every OU as a
 * sibling of Root with a slash in its label.
 *
 * Both shapes are read here: the nested form is flattened into paths, so a
 * config written either way produces the same tree.
 */
export function flattenOus(ous: OUConfig[] | undefined): FlatOu[] {
  const out: FlatOu[] = []
  const seen = new Set<string>()

  const visit = (list: OUConfig[], prefix: string, inheritedIgnore: boolean) => {
    for (const ou of list ?? []) {
      if (!ou?.name) continue
      // A name may itself be a path; a prefix only appears in the nested form.
      const path = prefix ? `${prefix}/${ou.name}` : ou.name
      const ignore = inheritedIgnore || ou.ignore === true
      if (!seen.has(path)) {
        seen.add(path)
        out.push({ path, label: path.split('/').pop()!, parentPath: parentOf(path), ignore, tags: ou.tags })
      }
      visit(ou.organizationalUnits ?? [], path, ignore)
    }
  }
  visit(ous ?? [], '', false)

  // LZA requires every OU in a path to be declared, but a config that skips an
  // intermediate level should still produce a connected tree rather than an
  // orphan hanging off Root.
  for (const ou of [...out]) {
    let parent = ou.parentPath
    while (parent && !seen.has(parent)) {
      seen.add(parent)
      out.push({ path: parent, label: parent.split('/').pop()!, parentPath: parentOf(parent), ignore: false })
      parent = parentOf(parent)
    }
  }

  // Parents before children, so a consumer can build nodes in one pass.
  return out.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
}

function parentOf(path: string): string | null {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? null : path.slice(0, cut)
}
