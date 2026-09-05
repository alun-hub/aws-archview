import { tgwNodeId } from '../../parser/nodeIds'
import type { ViewKind } from '../../parser'
import type { ExpandableTargets } from '../accountResolver'
import type { AnalysisContext, Rule, RuleFinding } from '../types'

/** One targeting block somewhere in the config set, flattened so a single
 *  loop can check them all. `where` reads back to the user as the path they
 *  would search for in the YAML. */
interface TargetSite {
  where: string
  configFile: string
  view: ViewKind
  targets?: ExpandableTargets
  /** Node to select when the user clicks the finding, when one exists. */
  nodeIds?: string[]
}

function collectSites(ctx: AnalysisContext): TargetSite[] {
  const sites: TargetSite[] = []
  const { organization, iam, customizations, network, global } = ctx.configs

  const orgPolicies: [string, { name: string; deploymentTargets?: ExpandableTargets }[] | undefined][] = [
    ['serviceControlPolicies', organization?.serviceControlPolicies],
    ['taggingPolicies', organization?.taggingPolicies],
    ['backupPolicies', organization?.backupPolicies],
  ]
  for (const [key, policies] of orgPolicies) {
    for (const p of policies ?? []) {
      sites.push({
        where: `${key}: ${p.name}`,
        configFile: 'organization-config.yaml',
        view: 'organization',
        targets: p.deploymentTargets,
      })
    }
  }

  for (const a of iam?.identityCenterAssignments ?? []) {
    sites.push({
      where: `identityCenterAssignments: ${a.name}`,
      configFile: 'iam-config.yaml',
      view: 'iam',
      targets: a.deploymentTargets,
    })
  }
  const iamSets: [string, { name?: string; deploymentTargets?: ExpandableTargets }[] | undefined][] = [
    ['roleSets', iam?.roleSets],
    ['groupSets', iam?.groupSets],
    ['userSets', iam?.userSets],
    ['policySets', iam?.policySets],
  ]
  for (const [key, sets] of iamSets) {
    // Sets are frequently unnamed in LZA configs — fall back to the index so
    // the message still points at a findable spot in the file.
    ;(sets ?? []).forEach((s, i) => {
      sites.push({
        where: `${key}[${i}]${s.name ? `: ${s.name}` : ''}`,
        configFile: 'iam-config.yaml',
        view: 'iam',
        targets: s.deploymentTargets,
      })
    })
  }

  const custom = customizations?.customizations ?? customizations
  const customLists: [string, { name: string; deploymentTargets?: ExpandableTargets }[] | undefined][] = [
    ['cloudFormationStacks', custom?.cloudFormationStacks],
    ['cloudFormationStackSets', custom?.cloudFormationStackSets],
    ['serviceCatalogPortfolios', custom?.serviceCatalogPortfolios],
  ]
  for (const [key, list] of customLists) {
    for (const item of list ?? []) {
      sites.push({
        where: `${key}: ${item.name}`,
        configFile: 'customizations-config.yaml',
        view: 'customizations',
        targets: item.deploymentTargets,
      })
    }
  }

  // shareTargets follow the same shape and fail the same way — a TGW shared
  // with an OU that doesn't exist simply never reaches the spoke accounts.
  for (const tgw of network?.transitGateways ?? []) {
    sites.push({
      where: `transitGateways: ${tgw.name} (shareTargets)`,
      configFile: 'network-config.yaml',
      view: 'network',
      targets: tgw.shareTargets,
      nodeIds: [tgwNodeId(tgw.name)],
    })
  }
  for (const rule of network?.centralNetworkServices?.route53Resolver?.rules ?? []) {
    sites.push({
      where: `route53Resolver rules: ${rule.name} (shareTargets)`,
      configFile: 'network-config.yaml',
      view: 'network',
      targets: rule.shareTargets,
    })
  }

  for (const vault of global?.backup?.vaults ?? []) {
    sites.push({
      where: `backup vaults: ${vault.name}`,
      configFile: 'global-config.yaml',
      view: 'global',
      targets: vault.deploymentTargets as ExpandableTargets | undefined,
    })
  }

  return sites.filter((s) => s.targets != null)
}

/** A deployment target naming an OU or account that accounts-config and
 *  organization-config never declare. LZA fails the pipeline on these, but only
 *  once it gets that far — and the misspelling is invisible in a YAML diff. */
export const unknownDeploymentTarget: Rule = {
  id: 'unknown-deployment-target',
  title: 'Deployment target does not exist',
  run(ctx): RuleFinding[] {
    // Without both files there is nothing to check against, and reporting every
    // target as unknown would be noise rather than a finding.
    if (!ctx.configs.organization || !ctx.configs.accounts) return []

    const findings: RuleFinding[] = []
    for (const site of collectSites(ctx)) {
      const { unknownOus, unknownAccounts } = ctx.accounts.expand(site.targets)
      for (const ou of unknownOus) {
        findings.push({
          ruleId: 'unknown-deployment-target',
          severity: 'error',
          title: 'Deployment target does not exist',
          detail: `${site.where} targets the OU "${ou}", which organization-config.yaml does not declare.`,
          view: site.view,
          // The referenced OU has no node — it doesn't exist. Point at the
          // targeting object instead when it has one.
          nodeIds: site.nodeIds ?? [],
          configFile: site.configFile,
        })
      }
      for (const account of unknownAccounts) {
        findings.push({
          ruleId: 'unknown-deployment-target',
          severity: 'error',
          title: 'Deployment target does not exist',
          detail: `${site.where} targets the account "${account}", which accounts-config.yaml does not declare.`,
          view: site.view,
          nodeIds: site.nodeIds ?? [],
          configFile: site.configFile,
        })
      }
    }
    return findings
  },
}

/** A policy or stack that resolves to no account at all is dead config: it
 *  looks deployed in review, and silently does nothing. */
export const emptyDeploymentTarget: Rule = {
  id: 'empty-deployment-target',
  title: 'Deployment target matches no account',
  run(ctx): RuleFinding[] {
    if (!ctx.configs.organization || !ctx.configs.accounts) return []

    const findings: RuleFinding[] = []
    for (const site of collectSites(ctx)) {
      const expansion = ctx.accounts.expand(site.targets)
      if (expansion.accounts.length > 0) continue
      // A broken reference already reported by the rule above is the cause
      // here, not a separate problem — don't say it twice.
      if (expansion.unknownOus.length > 0 || expansion.unknownAccounts.length > 0) continue

      const named = [
        ...(site.targets?.organizationalUnits ?? []).map((o) => `OU ${o}`),
        ...(site.targets?.accounts ?? []).map((a) => `account ${a}`),
      ]
      findings.push({
        ruleId: 'empty-deployment-target',
        severity: 'warning',
        title: 'Deployment target matches no account',
        detail: named.length === 0
          ? `${site.where} has an empty deploymentTargets block, so it is never deployed anywhere.`
          : `${site.where} targets ${named.join(', ')}, which currently contain no accounts — it deploys nowhere.`,
        view: site.view,
        nodeIds: site.nodeIds ?? [],
        configFile: site.configFile,
      })
    }
    return findings
  },
}
