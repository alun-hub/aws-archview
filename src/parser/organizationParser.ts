import type { AccountsConfig, GraphEdge, GraphModel, GraphNode, OUConfig, OrganizationConfig, SecurityConfig, IamConfig, SCP } from './types'
import { getNormalizedSecurityConfig } from './securityParser'

function collectOUs(
  ous: OUConfig[],
  parentId: string,
  nodes: GraphNode[],
  scps: SCP[],
  iamConfig?: IamConfig,
) {
  for (const ou of ous) {
    if (ou.ignore) continue
    const id = `ou:${ou.name}`
    const attachedScps = scps
      .filter((s) => s.deploymentTargets?.organizationalUnits?.includes(ou.name))
      .map((s) => `${s.name}${s.policy ? ` (${s.policy})` : ''}${s.description ? ` - ${s.description}` : ''}`)

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
        scps: attachedScps.length > 0 ? attachedScps : undefined,
        iamAssignments: ouAssignments.length > 0 ? ouAssignments : undefined,
      },
      parentId,
    })
    if (ou.organizationalUnits?.length) {
      collectOUs(ou.organizationalUnits, id, nodes, scps, iamConfig)
    }
  }
}

export function parseOrganization(
  orgConfig: OrganizationConfig,
  accountsConfig: AccountsConfig,
  securityConfig?: SecurityConfig,
  iamConfig?: IamConfig,
): GraphModel {
  const normSecurity = securityConfig ? getNormalizedSecurityConfig(securityConfig) : null
  const delegatedAdmin = securityConfig?.centralSecurityServices?.delegatedAdminAccount ?? 'Audit'

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Root is the top-level container
  const rootId = 'root'
  nodes.push({ id: rootId, kind: 'root', label: 'AWS Organization', data: { kind: 'ou' } })

  const scps = orgConfig.serviceControlPolicies ?? []

  if (orgConfig.organizationalUnits?.length) {
    collectOUs(orgConfig.organizationalUnits, rootId, nodes, scps, iamConfig)
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

    const attachedScps = scps
      .filter((s) => s.deploymentTargets?.accounts?.includes(account.name))
      .map((s) => `${s.name}${s.policy ? ` (${s.policy})` : ''}${s.description ? ` - ${s.description}` : ''}`)

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
        scps: attachedScps.length > 0 ? attachedScps : undefined,
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
