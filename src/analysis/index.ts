import type { ViewKind } from '../parser'
import { buildAccountIndex } from './accountResolver'
import { vpcCidrOverlap } from './rules/cidrOverlap'
import { emptyDeploymentTarget, unknownDeploymentTarget } from './rules/deploymentTargets'
import { unresolvedReplacement } from './rules/replacements'
import { subnetCidrOutsideVpc, subnetCidrOverlap } from './rules/subnetCidr'
import { tgwAttachmentNoPropagation, unknownTgwRouteTable } from './rules/tgwRouting'
import { missingInclude, yamlParseFailure } from './rules/fileIntegrity'
import { unknownKey } from './rules/unknownKey'
import { missingRequiredField } from './rules/requiredFields'
import {
  SEVERITY_ORDER,
  type AnalysisContext,
  type Finding,
  type Rule,
  type Severity,
  type ValidationInput,
} from './types'

export type { Finding, Severity, Rule, ValidationInput } from './types'
export type { AccountIndex, ResolvedAccount, TargetExpansion } from './accountResolver'
export { buildAccountIndex, ROOT_OU } from './accountResolver'
export { buildAccountProfile } from './accountProfile'
export type {
  AccountProfile, PolicyAttachment, ProfileVpc, SharedSubnet, ProfileDeployable, ProfileLink,
} from './accountProfile'
export { parseCidr, overlaps, contains, formatIp, describeRange } from './cidr'
export type { CidrRange } from './cidr'

/** Every rule, in no particular order — findings are sorted by severity below,
 *  not by registration order. Adding a rule means adding it here and nowhere
 *  else. */
export const RULES: Rule[] = [
  yamlParseFailure,
  missingInclude,
  missingRequiredField,
  unknownKey,
  vpcCidrOverlap,
  subnetCidrOutsideVpc,
  subnetCidrOverlap,
  unknownDeploymentTarget,
  emptyDeploymentTarget,
  unknownTgwRouteTable,
  tgwAttachmentNoPropagation,
  unresolvedReplacement,
]

export function runValidation(input: ValidationInput, rules: Rule[] = RULES): Finding[] {
  const { configs, loadedFiles = {}, parseErrors = {} } = input
  const ctx: AnalysisContext = {
    configs,
    loadedFiles,
    parseErrors,
    accounts: buildAccountIndex(configs.organization, configs.accounts),
  }

  const findings: Finding[] = []
  for (const rule of rules) {
    let produced
    try {
      produced = rule.run(ctx)
    } catch (e) {
      // One rule tripping over an unexpected config shape must not cost the
      // user every other rule's findings.
      console.error(`Validation rule "${rule.id}" failed`, e)
      continue
    }
    produced.forEach((f, i) => findings.push({ ...f, id: `${rule.id}#${i}` }))
  }

  return findings.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId)
    return a.detail.localeCompare(b.detail)
  })
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  return counts
}

/** Highest severity flagged against each node, for the diagram's outline. A
 *  node can collect findings from several rules; the worst one wins. */
export function severityByNode(findings: Finding[]): Map<string, Severity> {
  const map = new Map<string, Severity>()
  for (const f of findings) {
    for (const id of f.nodeIds) {
      const current = map.get(id)
      if (!current || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[current]) map.set(id, f.severity)
    }
  }
  return map
}

export function findingsByView(findings: Finding[]): Map<ViewKind, Finding[]> {
  const map = new Map<ViewKind, Finding[]>()
  for (const f of findings) {
    const list = map.get(f.view)
    if (list) list.push(f)
    else map.set(f.view, [f])
  }
  return map
}
