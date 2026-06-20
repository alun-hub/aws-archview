import type { AccountsConfig, GraphEdge, GraphModel, GraphNode, OUConfig, OrganizationConfig, SecurityConfig, IamConfig, SCP } from './types'

function collectOUs(
  ous: OUConfig[],
  parentId: string,
  nodes: GraphNode[],
  scps: SCP[],
) {
  for (const ou of ous) {
    if (ou.ignore) continue
    const id = `ou:${ou.name}`
    const attachedScps = scps
      .filter((s) => s.deploymentTargets?.organizationalUnits?.includes(ou.name))
      .map((s) => s.name)

    nodes.push({
      id,
      kind: 'ou',
      label: ou.name,
      data: {
        kind: 'ou',
        tags: ou.tags,
        scps: attachedScps.length > 0 ? attachedScps : undefined,
      },
      parentId,
    })
    if (ou.organizationalUnits?.length) {
      collectOUs(ou.organizationalUnits, id, nodes, scps)
    }
  }
}

export function parseOrganization(
  orgConfig: OrganizationConfig,
  accountsConfig: AccountsConfig,
  securityConfig?: SecurityConfig,
  iamConfig?: IamConfig,
): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Root is the top-level container
  const rootId = 'root'
  nodes.push({ id: rootId, kind: 'root', label: 'AWS Organization', data: { kind: 'ou' } })

  const scps = orgConfig.serviceControlPolicies ?? []

  if (orgConfig.organizationalUnits?.length) {
    collectOUs(orgConfig.organizationalUnits, rootId, nodes, scps)
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
      .map((s) => s.name)

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
      },
      parentId: nodeSet.has(parentId) ? parentId : rootId,
    })

    // Inject security services under the respective central accounts
    if (account.name === 'Audit' && securityConfig) {
      if (securityConfig.guardduty?.enable) {
        nodes.push({
          id: `guardduty:${account.name}`,
          kind: 'guardduty',
          label: 'GuardDuty',
          data: {},
          parentId: id,
        })
      }
      if (securityConfig.securityHub?.enable) {
        nodes.push({
          id: `security-hub:${account.name}`,
          kind: 'security-hub',
          label: 'Security Hub',
          data: {},
          parentId: id,
        })
      }
      if (securityConfig.macie?.enable) {
        nodes.push({
          id: `macie:${account.name}`,
          kind: 'macie',
          label: 'Macie',
          data: {},
          parentId: id,
        })
      }
      if (securityConfig.awsConfig?.enableConfigurationRecorder) {
        nodes.push({
          id: `config:${account.name}`,
          kind: 'config',
          label: 'AWS Config',
          data: {},
          parentId: id,
        })
      }
    }

    if (account.name === 'LogArchive' && securityConfig) {
      if (securityConfig.cloudtrail?.enable) {
        nodes.push({
          id: `cloudtrail:${account.name}`,
          kind: 'cloudtrail',
          label: 'CloudTrail',
          data: {},
          parentId: id,
        })
      }
    }

    if (account.name === 'Management' && iamConfig) {
      if (iamConfig.identityCenter?.enable) {
        nodes.push({
          id: `iam:${account.name}`,
          kind: 'iam',
          label: 'IAM Identity Center',
          data: {},
          parentId: id,
        })
      }
    }
  }

  return { nodes, edges }
}
