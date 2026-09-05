import type { ViewKind } from '../../parser'
import { nearestKnownKey } from '../schema/nearMiss'
import { SHAPES } from '../schema/shapes'
import { walkShape } from '../schema/walk'
import type { AnalysisContext, Rule, RuleFinding } from '../types'

const FILE_FOR_SHAPE: Record<keyof typeof SHAPES, { file: string; view: ViewKind }> = {
  network:        { file: 'network-config.yaml',        view: 'network' },
  organization:   { file: 'organization-config.yaml',   view: 'organization' },
  accounts:       { file: 'accounts-config.yaml',       view: 'organization' },
  customizations: { file: 'customizations-config.yaml', view: 'customizations' },
}

/**
 * A key that looks like a misspelling of a real one — `cidr` for `cidrs`,
 * `routeTablePropagation` for `routeTablePropagations`.
 *
 * These are the typos no other layer catches: the YAML is valid, the parser
 * reads the object fine, and the misspelled field is simply ignored. The
 * result is a VPC with no CIDR or an attachment that propagates nowhere, with
 * nothing anywhere saying why.
 *
 * Only near-misses are reported. A key we don't recognize at all is far more
 * likely to be a real LZA field this app doesn't model than a mistake, so it
 * stays silent — see the note in `schema/shapes.ts`.
 */
export const unknownKey: Rule = {
  id: 'unknown-key',
  title: 'Misspelled configuration key',
  run(ctx: AnalysisContext): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const [configKey, shape] of Object.entries(SHAPES)) {
      const config = ctx.configs[configKey as keyof typeof SHAPES]
      if (!config) continue
      const { file, view } = FILE_FOR_SHAPE[configKey as keyof typeof SHAPES]

      for (const visited of walkShape(config, shape)) {
        const known = visited.shape.keys
        for (const key of Object.keys(visited.value)) {
          if (known.includes(key)) continue
          const suggestion = nearestKnownKey(key, known)
          if (!suggestion) continue
          findings.push({
            ruleId: 'unknown-key',
            severity: 'warning',
            title: 'Misspelled configuration key',
            detail: `${visited.describe} sets "${key}", which is not a field LZA reads here — did you mean "${suggestion}"? The value is being ignored.`,
            view,
            nodeIds: [],
            configFile: file,
          })
        }
      }
    }

    return findings
  },
}
