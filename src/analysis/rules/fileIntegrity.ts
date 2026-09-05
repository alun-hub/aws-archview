import { findIncludes, resolveConfigKey } from '../../parser'
import type { Rule, RuleFinding } from '../types'

/** Which view a config file feeds, so a file-level finding still lands
 *  somewhere sensible when clicked. */
const VIEW_FOR_FILE = {
  organization: 'organization',
  accounts: 'organization',
  network: 'network',
  security: 'security',
  iam: 'iam',
  global: 'global',
  customizations: 'customizations',
} as const

function viewForFile(filename: string) {
  const key = resolveConfigKey(filename)
  return key ? VIEW_FOR_FILE[key] : 'organization'
}

/** A file that failed to parse. The config store already keeps these per file
 *  so one bad file doesn't take down the rest; surfacing them as findings puts
 *  them in the same list as everything else rather than in their own notice. */
export const yamlParseFailure: Rule = {
  id: 'yaml-parse-failure',
  title: 'File failed to parse',
  run(ctx): RuleFinding[] {
    return Object.entries(ctx.parseErrors).map(([filename, message]) => ({
      ruleId: 'yaml-parse-failure',
      severity: 'error' as const,
      title: 'File failed to parse',
      detail: `${filename} is not valid YAML, so nothing in it is loaded: ${message}`,
      view: viewForFile(filename),
      nodeIds: [],
      configFile: filename,
    }))
  },
}

/**
 * An `!include` pointing at a file that isn't loaded.
 *
 * This is the quietest failure in the whole app: the include tag resolves to
 * null, `compactIncludeHoles` strips the hole out of its array, and the config
 * parses cleanly with a chunk of the architecture simply absent. Nothing
 * downstream can tell the difference between "this VPC was never configured"
 * and "you forgot to drop one file".
 */
export const missingInclude: Rule = {
  id: 'missing-include',
  title: 'Included file not loaded',
  run(ctx): RuleFinding[] {
    const loadedNames = Object.keys(ctx.loadedFiles)
    const isLoaded = (path: string) => {
      const basename = path.split('/').pop()!
      return loadedNames.some((k) => k === path || k === basename || k.split('/').pop() === basename)
    }

    // One finding per missing file, naming every config that wanted it —
    // a shared include referenced from four places is one thing to fix.
    const wantedBy = new Map<string, Set<string>>()
    for (const [filename, content] of Object.entries(ctx.loadedFiles)) {
      for (const path of findIncludes(content, ctx.loadedFiles)) {
        if (isLoaded(path)) continue
        const basename = path.split('/').pop()!
        const set = wantedBy.get(basename) ?? new Set()
        set.add(filename)
        wantedBy.set(basename, set)
      }
    }

    return [...wantedBy.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([missing, sources]) => {
      const from = [...sources].sort()
      return {
        ruleId: 'missing-include',
        severity: 'error' as const,
        title: 'Included file not loaded',
        detail: `${from.join(', ')} !include ${missing}, which is not loaded — everything it defines is silently missing from the diagram.`,
        view: viewForFile(from[0]),
        nodeIds: [],
        configFile: from[0],
      }
    })
  },
}
