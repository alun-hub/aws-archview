import { findUnresolvedReplacements } from '../../parser'
import type { Rule, RuleFinding } from '../types'

/** A `{{ TOKEN }}` inside an `!include` path that replacements-config.yaml
 *  never defines. The parser degrades it to a literal, so the include silently
 *  resolves to nothing and whole sections of the diagram go missing without an
 *  error anywhere — which is exactly what makes it worth a finding. */
export const unresolvedReplacement: Rule = {
  id: 'unresolved-replacement',
  title: 'Unresolved replacement token',
  run(ctx): RuleFinding[] {
    const unresolved = findUnresolvedReplacements(ctx.loadedFiles)
    if (unresolved.length === 0) return []

    return unresolved.map((key) => ({
      ruleId: 'unresolved-replacement',
      severity: 'error' as const,
      title: 'Unresolved replacement token',
      detail: `"{{ ${key} }}" is used in an !include path but replacements-config.yaml defines no value for it, so that include resolves to nothing.`,
      view: 'organization' as const,
      nodeIds: [],
      configFile: 'replacements-config.yaml',
    }))
  },
}
