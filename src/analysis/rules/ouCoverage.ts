import { ouNodeId } from '../../parser/nodeIds'
import { ROOT_OU } from '../accountResolver'
import type { Rule, RuleFinding } from '../types'

/** OU paths a policy reaches: the OU itself and every OU beneath it, since an
 *  SCP on a parent applies all the way down. */
function coveredBy(targetOu: string, ouPaths: string[]): string[] {
  if (targetOu === ROOT_OU) return ouPaths
  const prefix = `${targetOu}/`
  return ouPaths.filter((p) => p === targetOu || p.startsWith(prefix))
}

/**
 * An OU no service control policy reaches, directly or by inheritance.
 *
 * Usually deliberate for a Sandbox or Suspended OU, occasionally a real gap in
 * a workload branch — which is why this is `info` and not a warning. It is a
 * question to answer once, not a defect.
 */
export const ouWithoutScp: Rule = {
  id: 'ou-without-scp',
  title: 'Organizational unit has no SCP',
  run(ctx): RuleFinding[] {
    const org = ctx.configs.organization
    if (!org?.organizationalUnits?.length) return []

    const scps = org.serviceControlPolicies ?? []
    // No SCPs anywhere is a different (and obvious) situation — reporting every
    // OU individually would say the same thing many times over.
    if (scps.length === 0) return []

    const ouPaths = ctx.accounts.ouPaths
    const covered = new Set<string>()
    for (const scp of scps) {
      for (const target of scp.deploymentTargets?.organizationalUnits ?? []) {
        for (const path of coveredBy(target, ouPaths)) covered.add(path)
      }
    }

    const declared = new Set(ouPaths)
    const parentOf = (path: string) => {
      const cut = path.lastIndexOf('/')
      return cut === -1 ? null : path.slice(0, cut)
    }

    const findings: RuleFinding[] = []
    for (const path of ouPaths) {
      if (covered.has(path)) continue
      // An OU marked `ignore` is not managed by LZA at all, so having no
      // policy on it is the expected state rather than a gap.
      if (ctx.accounts.ignoredOuPaths.has(path)) continue
      // Report only the topmost uncovered OU in a branch. If a parent has no
      // policy then neither does anything beneath it, and one finding per
      // level of a deep tree says the same thing over and over — attaching a
      // policy to the parent fixes the whole subtree at once.
      const parent = parentOf(path)
      if (parent && declared.has(parent) && !covered.has(parent)) continue

      const accountCount = ctx.accounts.accountsInOu(path).length
      findings.push({
        ruleId: 'ou-without-scp',
        severity: 'info',
        title: 'Organizational unit has no SCP',
        detail: accountCount === 0
          ? `No service control policy targets the OU "${path}" or any OU above it. It currently holds no accounts.`
          : `No service control policy targets the OU "${path}" or any OU above it, leaving its ${accountCount} account${accountCount === 1 ? '' : 's'} without guardrails.`,
        view: 'organization',
        nodeIds: [ouNodeId(path)],
        configFile: 'organization-config.yaml',
      })
    }
    return findings
  },
}
