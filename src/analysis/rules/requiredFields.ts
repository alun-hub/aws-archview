import type { ViewKind } from '../../parser'
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
 * An object missing a field the parsers cannot work without.
 *
 * TypeScript marks these fields non-optional in `parser/types.ts`, but that is
 * a compile-time promise about a runtime cast — `parseYaml<NetworkConfig>()`
 * checks nothing. A VPC with no `account` reaches the parser as `undefined`
 * and lands under an account node literally named "undefined".
 *
 * The `required` lists are kept deliberately short: only fields whose absence
 * actually breaks something, never fields that merely look mandatory. A VPC's
 * `cidrs`, for instance, is legitimately absent when the range comes from IPAM.
 */
export const missingRequiredField: Rule = {
  id: 'missing-required-field',
  title: 'Required field is missing',
  run(ctx: AnalysisContext): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const [configKey, shape] of Object.entries(SHAPES)) {
      const config = ctx.configs[configKey as keyof typeof SHAPES]
      if (!config) continue
      const { file, view } = FILE_FOR_SHAPE[configKey as keyof typeof SHAPES]

      for (const visited of walkShape(config, shape)) {
        for (const field of visited.shape.required ?? []) {
          const value = visited.value[field]
          // An empty string is as broken as an absent key here — both produce
          // a node with no identity — but `false` and `0` are real values.
          if (value != null && value !== '') continue
          findings.push({
            ruleId: 'missing-required-field',
            severity: 'error',
            title: 'Required field is missing',
            detail: `${visited.describe} has no "${field}". LZA requires it, and this app cannot place the object without it.`,
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
