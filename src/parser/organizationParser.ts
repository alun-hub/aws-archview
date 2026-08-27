import type { AccountsConfig, GraphEdge, GraphModel, GraphNode, OUConfig, OrganizationConfig, SecurityConfig, IamConfig, SCP } from './types'
import { getNormalizedSecurityConfig } from './securityParser'
import { findFileContent } from './fileResolve'
import { parsePolicyStatements, type PolicyStatementEntry } from './policyParse'

function formatPolicyEntry(p: SCP): string {
  return `${p.name}${p.policy ? ` (${p.policy})` : ''}${p.description ? ` - ${p.description}` : ''}`
}

function matchesTarget(p: SCP, kind: 'ou' | 'account', name: string): boolean {
  return kind === 'ou'
    ? !!p.deploymentTargets?.organizationalUnits?.includes(name)
    : !!p.deploymentTargets?.accounts?.includes(name)
}

// Resolves everything a single OU/account attaches to it: formatted SCP list,
// raw SCP names (for the highlight-on-click feature), parsed SCP statements
// (when the policy file was loaded), and tagging/backup policy lists.
function computePolicyAttachments(
  targetKind: 'ou' | 'account',
  targetName: string,
  scps: SCP[],
  taggingPolicies: SCP[],
  backupPolicies: SCP[],
  loadedFiles: Record<string, string>,
) {
  const matchedScps = scps.filter((p) => matchesTarget(p, targetKind, targetName))
  const matchedTagging = taggingPolicies.filter((p) => matchesTarget(p, targetKind, targetName))
  const matchedBackup = backupPolicies.filter((p) => matchesTarget(p, targetKind, targetName))

  const scpStatements: PolicyStatementEntry[] = []
  for (const p of matchedScps) {
    if (!p.policy) continue
    const content = findFileContent(p.policy, loadedFiles)
    if (content) scpStatements.push(...parsePolicyStatements(p.name, content))
  }

  return {
    scps: matchedScps.length > 0 ? matchedScps.map(formatPolicyEntry) : undefined,
    scpNames: matchedScps.length > 0 ? matchedScps.map((p) => p.name) : undefined,
    scpStatements: scpStatements.length > 0 ? scpStatements : undefined,
    taggingPolicies: matchedTagging.length > 0 ? matchedTagging.map(formatPolicyEntry) : undefined,
    backupPolicies: matchedBackup.length > 0 ? matchedBackup.map(formatPolicyEntry) : undefined,
  }
}

function collectOUs(
  ous: OUConfig[],
  parentId: string,
  nodes: GraphNode[],
  scps: SCP[],
  taggingPolicies: SCP[],
  backupPolicies: SCP[],
  loadedFiles: Record<string, string>,
  iamConfig?: IamConfig,
) {
  for (const ou of ous) {
    if (ou.ignore) continue
    const id = `ou:${ou.name}`
    const policyAttachments = computePolicyAttachments('ou', ou.name, scps, taggingPolicies, backupPolicies, loadedFiles)

    const ouAssignments = iamConfig?.identityCenterAssignments
      ?.filter((a) => a.deploymentTargets?.organizationalUnits?.includes(ou.name))
      ?.map((a) => `${a.principalType === 'GROUP' ? 'Group' : 'User'}: ${a.principalId} → ${a.permissionSetName}`) ?? []

    nodes.push({
      id,
      kind: 'ou',
      label: ou.name,
      data: {
        kind: 'ou',
        tags: ou.tags,
        ...policyAttachments,
        iamAssignments: ouAssignments.length > 0 ? ouAssignments : undefined,
      },
      parentId,
    })
    if (ou.organizationalUnits?.length) {
      collectOUs(ou.organizationalUnits, id, nodes, scps, taggingPolicies, backupPolicies, loadedFiles, iamConfig)
    }
  }
}

export function parseOrganization(
  orgConfig: OrganizationConfig,
  accountsConfig: AccountsConfig,
  securityConfig?: SecurityConfig,
  iamConfig?: IamConfig,
  loadedFiles: Record<string, string> = {},
): GraphModel {
  const normSecurity = securityConfig ? getNormalizedSecurityConfig(securityConfig) : null
  const delegatedAdmin = securityConfig?.centralSecurityServices?.delegatedAdminAccount ?? 'Audit'

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Root is the top-level container
  const rootId = 'root'
  nodes.push({ id: rootId, kind: 'root', label: 'AWS Organization', data: { kind: 'ou' } })

  const scps = orgConfig.serviceControlPolicies ?? []
  const taggingPolicies = orgConfig.taggingPolicies ?? []
  const backupPolicies = orgConfig.backupPolicies ?? []

  if (orgConfig.organizationalUnits?.length) {
    collectOUs(orgConfig.organizationalUnits, rootId, nodes, scps, taggingPolicies, backupPolicies, loadedFiles, iamConfig)
  }

  const nodeSet = new Set(nodes.map((n) => n.id))

  const allAccounts = [
    ...(accountsConfig.mandatoryAccounts ?? []),
    ...(accountsConfig.workloadAccounts ?? []),
  ]

  for (const account of allAccounts) {
    const id = `account:${account.name}`
    // OU path may be nested like "Infrastructure/Network" — map to the leaf OU
    const ouPath = account.organizationalUnit ?? 'Root'
    const leafOU = ouPath.split('/').pop() ?? ouPath
    const parentId = leafOU === 'Root' ? rootId : `ou:${leafOU}`

    const policyAttachments = computePolicyAttachments('account', account.name, scps, taggingPolicies, backupPolicies, loadedFiles)

    const accountAssignments = iamConfig?.identityCenterAssignments
      ?.filter((a) => a.deploymentTargets?.accounts?.includes(account.name))
      ?.map((a) => `${a.principalType === 'GROUP' ? 'Group' : 'User'}: ${a.principalId} → ${a.permissionSetName}`) ?? []

    nodes.push({
      id,
      kind: 'account',
      label: account.name,
      data: {
        kind: 'account',
        email: account.email,
        description: account.description,
        tags: account.tags,
        ...policyAttachments,
        iamAssignments: accountAssignments.length > 0 ? accountAssignments : undefined,
      },
      parentId: nodeSet.has(parentId) ? parentId : rootId,
    })

    // Inject security services under the respective central accounts
    if (account.name === delegatedAdmin && normSecurity) {
      if (normSecurity.guardDuty?.enable) {
        nodes.push({
          id: `guardduty:${account.name}`,
          kind: 'guardduty',
          label: 'GuardDuty',
          data: {
            s3Protection: normSecurity.guardDuty.s3Protection?.enable !== false,
          },
          parentId: id,
        })
      }
      if (normSecurity.securityHub?.enable) {
        const stds = normSecurity.securityHub.standards?.map((s) => {
          if (typeof s === 'string') return s
          if (s && typeof s === 'object' && 'name' in s) return String(s.name)
          return String(s)
        })
        nodes.push({
          id: `security-hub:${account.name}`,
          kind: 'security-hub',
          label: 'Security Hub',
          data: {
            standards: stds?.length ? stds : undefined,
          },
          parentId: id,
        })
      }
      if (normSecurity.macie?.enable) {
        nodes.push({
          id: `macie:${account.name}`,
          kind: 'macie',
          label: 'Macie',
          data: {
            publishingFrequency: normSecurity.macie.policyFindingsPublishingFrequency,
          },
          parentId: id,
        })
      }
      if (normSecurity.config?.enableConfigurationRecorder) {
        nodes.push({
          id: `config:${account.name}`,
          kind: 'config',
          label: 'AWS Config',
          data: {
            recorderEnabled: normSecurity.config.enableConfigurationRecorder,
            deliveryChannel: normSecurity.config.enableDeliveryChannel,
          },
          parentId: id,
        })
      }
      if (normSecurity.inspector?.enable) {
        nodes.push({
          id: `inspector:${account.name}`,
          kind: 'inspector',
          label: 'Inspector',
          data: {
            enableScanTypes: normSecurity.inspector.enableScanTypes,
          },
          parentId: id,
        })
      }
      if (normSecurity.detective?.enable) {
        nodes.push({
          id: `detective:${account.name}`,
          kind: 'detective',
          label: 'Detective',
          data: {},
          parentId: id,
        })
      }
      if (normSecurity.auditManager?.enable) {
        nodes.push({
          id: `audit-manager:${account.name}`,
          kind: 'audit-manager',
          label: 'Audit Manager',
          data: {},
          parentId: id,
        })
      }
      if (normSecurity.accessAnalyzer?.enable) {
        nodes.push({
          id: `access-analyzer:${account.name}`,
          kind: 'access-analyzer',
          label: 'Access Analyzer',
          data: {},
          parentId: id,
        })
      }
    }

    if (account.name === 'LogArchive' && normSecurity) {
      if (normSecurity.cloudtrail?.enable) {
        nodes.push({
          id: `cloudtrail:${account.name}`,
          kind: 'cloudtrail',
          label: 'CloudTrail',
          data: {
            trailEnabled: normSecurity.cloudtrail.enable,
            organizationTrail: normSecurity.cloudtrail.organizationTrail,
            s3BucketName: normSecurity.cloudtrail.s3BucketName,
          },
          parentId: id,
        })
      }
    }

    if (account.name === 'Management' && iamConfig) {
      if (iamConfig.identityCenter && iamConfig.identityCenter.enable !== false) {
        const pSets = iamConfig.permissionSets?.map((p) => {
          const policiesList: string[] = []
          if (p.awsManagedPolicies?.length) {
            policiesList.push(`AWS Managed: ${p.awsManagedPolicies.map(arn => arn.split('/').pop()).join(', ')}`)
          }
          if (p.customerManagedPolicies?.length) {
            policiesList.push(`Customer Managed: ${p.customerManagedPolicies.map(c => c.name).join(', ')}`)
          }
          const policiesStr = policiesList.length > 0 ? ` [Policies: ${policiesList.join(' | ')}]` : ''
          return `${p.name}${p.sessionDuration ? ` (Duration: ${p.sessionDuration})` : ''}${policiesStr}${p.description ? ` - ${p.description}` : ''}`
        }) ?? []
        nodes.push({
          id: `iam:${account.name}`,
          kind: 'iam',
          label: 'IAM Identity Center',
          data: {
            permissionSets: pSets.length > 0 ? pSets : undefined,
          },
          parentId: id,
        })
      }
    }
  }

  return { nodes, edges }
}
