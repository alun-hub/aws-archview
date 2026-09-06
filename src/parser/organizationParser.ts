import type { AccountsConfig, GraphEdge, GraphModel, GraphNode, OUConfig, OrganizationConfig, SecurityConfig, IamConfig, SCP } from './types'
import { getNormalizedSecurityConfig } from './securityParser'
import { findFileContent } from './fileResolve'
import { parsePolicyStatements, type PolicyStatementEntry } from './policyParse'
import { accountNodeId, ouNodeId } from './nodeIds'
import { assignments, describePrincipals } from './identityCenter'
import { flattenOus } from './organizationalUnits'

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
  ous: OUConfig[] | undefined,
  rootId: string,
  nodes: GraphNode[],
  scps: SCP[],
  taggingPolicies: SCP[],
  backupPolicies: SCP[],
  loadedFiles: Record<string, string>,
  iamConfig?: IamConfig,
) {
  // LZA declares OUs flat, with the path in the name. `flattenOus` resolves
  // parentage from that path and also accepts the nested shape.
  const flat = flattenOus(ous).filter((ou) => !ou.ignore)
  const declared = new Set(flat.map((ou) => ou.path))

  for (const ou of flat) {
    const id = ouNodeId(ou.path)
    const policyAttachments = computePolicyAttachments('ou', ou.path, scps, taggingPolicies, backupPolicies, loadedFiles)

    const ouAssignments = assignments(iamConfig)
      .filter((a) => a.deploymentTargets?.organizationalUnits?.includes(ou.path))
      .map((a) => `${describePrincipals(a.principals)} → ${a.permissionSetName}`)

    nodes.push({
      id,
      kind: 'ou',
      label: ou.label,
      data: {
        kind: 'ou',
        path: ou.path,
        tags: ou.tags,
        ...policyAttachments,
        iamAssignments: ouAssignments.length > 0 ? ouAssignments : undefined,
      },
      // An ignored parent is not drawn, so its children attach to Root rather
      // than to a node that does not exist.
      parentId: ou.parentPath && declared.has(ou.parentPath) ? ouNodeId(ou.parentPath) : rootId,
    })
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
    const id = accountNodeId(account.name)
    // OU path may be nested like "Infrastructure/Network" — match the full
    // path against the OU node id (which now also keys on the full path)
    const ouPath = account.organizationalUnit ?? 'Root'
    const parentId = ouPath === 'Root' ? rootId : ouNodeId(ouPath)

    const policyAttachments = computePolicyAttachments('account', account.name, scps, taggingPolicies, backupPolicies, loadedFiles)

    const accountAssignments = assignments(iamConfig)
      .filter((a) => a.deploymentTargets?.accounts?.includes(account.name))
      .map((a) => `${describePrincipals(a.principals)} → ${a.permissionSetName}`)

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
