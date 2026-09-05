// ─── Everything the config set says about one account ────────────────────────
//
// The views are organized per config file, which is the wrong axis for the
// question an architect actually asks: "what applies to Aurora-Prod?" Answering
// that by hand means opening six views and expanding every `deploymentTargets`
// block in your head. This module does that expansion once, in one place, using
// the same `accountResolver` the validation rules use — so the profile and the
// findings cannot disagree about who a policy reaches.

import type { LzaConfigs, ViewKind } from '../parser'
import { accountNodeId, subnetNodeId, vpcNodeId } from '../parser/nodeIds'
import type { SCP } from '../parser/types'
import { ROOT_OU, type AccountIndex } from './accountResolver'
import type { Finding } from './types'

/** A link back to where the fact lives on a diagram. */
export interface ProfileLink {
  view: ViewKind
  nodeIds: string[]
}

export interface PolicyAttachment {
  name: string
  description?: string
  type: 'scp' | 'tagging' | 'backup'
  /** 'direct' when the account is named outright, otherwise the OU path the
   *  attachment is inherited from. */
  source: 'direct' | string
}

export interface ProfileVpc {
  name: string
  region: string
  cidrs: string[]
  subnetCount: number
  availabilityZones: string[]
  attachments: { name: string; tgw?: string; associations: string[]; propagations: string[] }[]
  link: ProfileLink
}

export interface SharedSubnet {
  subnet: string
  vpc: string
  ownerAccount: string
  cidr?: string
  /** Whether the share names this account outright or reaches it via an OU. */
  via: 'direct' | string
  link: ProfileLink
}

export interface ProfileDeployable {
  name: string
  kind: 'CloudFormation stack' | 'CloudFormation stack set' | 'Service Catalog portfolio'
  regions?: string[]
  via: 'direct' | string
}

export interface AccountProfile {
  name: string
  email: string
  description?: string
  ouPath: string
  /** Root → … → the account's own OU, for showing where inheritance comes from. */
  ouChain: string[]
  tags?: Record<string, string>
  policies: PolicyAttachment[]
  vpcs: ProfileVpc[]
  sharedSubnets: SharedSubnet[]
  iam: {
    roles: string[]
    groups: string[]
    users: string[]
    policies: string[]
    ssoAssignments: { principal: string; principalType: string; permissionSet: string }[]
  }
  deployables: ProfileDeployable[]
  backupVaults: string[]
  /** Findings anchored on a node this account owns. */
  findings: Finding[]
  link: ProfileLink
}

/** Root → … → the account's own OU. `Root` is implicit in LZA and always
 *  first, since a policy on Root reaches every account. */
function ouChainFor(ouPath: string): string[] {
  if (ouPath === ROOT_OU) return [ROOT_OU]
  const parts = ouPath.split('/')
  const chain = [ROOT_OU]
  for (let i = 0; i < parts.length; i++) chain.push(parts.slice(0, i + 1).join('/'))
  return chain
}

/**
 * Which OU in the account's chain a targeting block reaches it through, or
 * 'direct' when the account is named outright, or null when it isn't reached.
 *
 * Deepest match wins: an SCP on `Workloads/Production` is more specific than
 * one on `Workloads`, and saying so is the point of showing the source at all.
 */
function reachedVia(
  targets: { organizationalUnits?: string[]; accounts?: string[]; excludedAccounts?: string[] } | undefined,
  accountName: string,
  ouChain: string[],
): 'direct' | string | null {
  if (!targets) return null
  if (targets.excludedAccounts?.includes(accountName)) return null
  if (targets.accounts?.includes(accountName)) return 'direct'
  for (let i = ouChain.length - 1; i >= 0; i--) {
    if (targets.organizationalUnits?.includes(ouChain[i])) return ouChain[i]
  }
  return null
}

function policyAttachments(
  policies: SCP[] | undefined,
  type: PolicyAttachment['type'],
  accountName: string,
  ouChain: string[],
): PolicyAttachment[] {
  const out: PolicyAttachment[] = []
  for (const p of policies ?? []) {
    const source = reachedVia(p.deploymentTargets, accountName, ouChain)
    if (source == null) continue
    out.push({ name: p.name, description: p.description, type, source })
  }
  return out
}

export function buildAccountProfile(
  accountName: string,
  configs: LzaConfigs,
  accounts: AccountIndex,
  findings: Finding[] = [],
): AccountProfile | null {
  const account = accounts.byName.get(accountName)
  if (!account) return null

  const ouChain = ouChainFor(account.ouPath)
  const org = configs.organization

  // ── Policies ──────────────────────────────────────────────────────────────
  const policies = [
    ...policyAttachments(org?.serviceControlPolicies, 'scp', accountName, ouChain),
    ...policyAttachments(org?.taggingPolicies, 'tagging', accountName, ouChain),
    ...policyAttachments(org?.backupPolicies, 'backup', accountName, ouChain),
  ]

  // ── Network ───────────────────────────────────────────────────────────────
  const vpcs: ProfileVpc[] = []
  const sharedSubnets: SharedSubnet[] = []

  for (const vpc of configs.network?.vpcs ?? []) {
    if (vpc.account === accountName) {
      const azs = [...new Set((vpc.subnets ?? []).map((s) => s.availabilityZone).filter(Boolean))].sort()
      vpcs.push({
        name: vpc.name,
        region: vpc.region,
        cidrs: vpc.cidrs ?? [],
        subnetCount: vpc.subnets?.length ?? 0,
        availabilityZones: azs,
        attachments: (vpc.transitGatewayAttachments ?? []).map((att) => ({
          name: att.name,
          tgw: typeof att.transitGateway === 'string' ? att.transitGateway : att.transitGateway?.name,
          associations: (att.routeTableAssociations ?? []).map((r) => r.routeTableName),
          propagations: (att.routeTablePropagations ?? []).map((r) => r.routeTableName),
        })),
        link: { view: 'network', nodeIds: [vpcNodeId(vpc.name, vpc.account)] },
      })
      continue
    }

    // Subnets another account owns but shares with this one.
    for (const subnet of vpc.subnets ?? []) {
      const via = reachedVia(subnet.shareTargets, accountName, ouChain)
      if (via == null) continue
      sharedSubnets.push({
        subnet: subnet.name,
        vpc: vpc.name,
        ownerAccount: vpc.account,
        cidr: subnet.ipv4CidrBlock,
        via,
        link: { view: 'network', nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name)] },
      })
    }
  }

  // ── IAM ───────────────────────────────────────────────────────────────────
  const roles: string[] = []
  for (const set of configs.iam?.roleSets ?? []) {
    if (reachedVia(set.deploymentTargets, accountName, ouChain) == null) continue
    for (const r of set.roles ?? []) roles.push(r.name)
  }
  const groups: string[] = []
  for (const set of configs.iam?.groupSets ?? []) {
    if (reachedVia(set.deploymentTargets, accountName, ouChain) == null) continue
    for (const g of set.groups ?? []) groups.push(g.name)
  }
  const users: string[] = []
  for (const set of configs.iam?.userSets ?? []) {
    if (reachedVia(set.deploymentTargets, accountName, ouChain) == null) continue
    for (const u of set.users ?? []) users.push(u.username)
  }
  const iamPolicies: string[] = []
  for (const set of configs.iam?.policySets ?? []) {
    if (reachedVia(set.deploymentTargets, accountName, ouChain) == null) continue
    for (const p of set.policies ?? []) iamPolicies.push(p.name)
  }
  const ssoAssignments = (configs.iam?.identityCenterAssignments ?? [])
    .filter((a) => reachedVia(a.deploymentTargets, accountName, ouChain) != null)
    .map((a) => ({ principal: a.principalId, principalType: a.principalType, permissionSet: a.permissionSetName }))

  // ── Customizations ────────────────────────────────────────────────────────
  const custom = configs.customizations?.customizations ?? configs.customizations
  const deployables: ProfileDeployable[] = []
  const deployableLists = [
    ['CloudFormation stack', custom?.cloudFormationStacks],
    ['CloudFormation stack set', custom?.cloudFormationStackSets],
    ['Service Catalog portfolio', custom?.serviceCatalogPortfolios],
  ] as const
  for (const [kind, list] of deployableLists) {
    for (const item of list ?? []) {
      const via = reachedVia(item.deploymentTargets, accountName, ouChain)
      if (via == null) continue
      deployables.push({ name: item.name, kind, regions: item.regions, via })
    }
  }

  // ── Global ────────────────────────────────────────────────────────────────
  const backupVaults = (configs.global?.backup?.vaults ?? [])
    .filter((v) => reachedVia(v.deploymentTargets as Parameters<typeof reachedVia>[0], accountName, ouChain) != null)
    .map((v) => v.name)

  // ── Findings ──────────────────────────────────────────────────────────────
  // Matched by node ownership rather than by a field on the finding: a rule
  // that anchors on this account's VPC is, by construction, about this account.
  // Findings with no node (a misspelled OU in a policy, say) are not attributed
  // here — they belong to the config file, not to one account.
  const ownedNodeIds = new Set<string>([accountNodeId(accountName)])
  for (const vpc of configs.network?.vpcs ?? []) {
    if (vpc.account !== accountName) continue
    ownedNodeIds.add(vpcNodeId(vpc.name, vpc.account))
    for (const s of vpc.subnets ?? []) ownedNodeIds.add(subnetNodeId(vpc.name, vpc.account, s.name))
  }
  const accountFindings = findings.filter((f) => f.nodeIds.some((id) => ownedNodeIds.has(id)))

  return {
    name: account.name,
    email: account.email,
    description: configs.accounts
      ? [...(configs.accounts.mandatoryAccounts ?? []), ...(configs.accounts.workloadAccounts ?? [])]
          .find((a) => a.name === accountName)?.description
      : undefined,
    ouPath: account.ouPath,
    ouChain,
    tags: [...(configs.accounts?.mandatoryAccounts ?? []), ...(configs.accounts?.workloadAccounts ?? [])]
      .find((a) => a.name === accountName)?.tags,
    policies,
    vpcs,
    sharedSubnets,
    iam: { roles, groups, users, policies: iamPolicies, ssoAssignments },
    deployables,
    backupVaults,
    findings: accountFindings,
    link: { view: 'organization', nodeIds: [accountNodeId(accountName)] },
  }
}
