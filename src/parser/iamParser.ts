import type { IamConfig, AccountsConfig, GraphEdge, GraphModel, GraphNode } from './types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseIam(cfg: IamConfig, _accountsConfig?: AccountsConfig): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const rootId = 'iam:root'
  const icName = cfg.identityCenter?.name ?? 'IAM Identity Center'
  const delegatedAdmin = cfg.identityCenter?.delegatedAdminAccount

  nodes.push({
    id: rootId,
    kind: 'account',
    label: icName,
    data: {
      kind: 'account',
      delegatedAdminAccount: delegatedAdmin,
      enabled: cfg.identityCenter?.enable !== false,
    },
  })

  // Build assignment lookup: permissionSetName → list of targets
  const assignmentsByPs = new Map<string, string[]>()
  for (const a of cfg.identityCenterAssignments ?? []) {
    const targets: string[] = [
      ...(a.deploymentTargets.accounts ?? []).map(acc => `${a.principalType === 'GROUP' ? 'Group' : 'User'}: ${a.principalId} → ${acc}`),
      ...(a.deploymentTargets.organizationalUnits ?? []).map(ou => `${a.principalType === 'GROUP' ? 'Group' : 'User'}: ${a.principalId} → OU: ${ou}`),
    ]
    const existing = assignmentsByPs.get(a.permissionSetName) ?? []
    assignmentsByPs.set(a.permissionSetName, [...existing, ...targets])
  }

  // One node per permission set
  for (const ps of cfg.permissionSets ?? []) {
    const policies: string[] = []
    if (ps.awsManagedPolicies?.length) {
      policies.push(...ps.awsManagedPolicies.map(arn => arn.split('/').pop() ?? arn))
    }
    if (ps.customerManagedPolicies?.length) {
      policies.push(...ps.customerManagedPolicies.map(p => p.name))
    }

    const assignments = assignmentsByPs.get(ps.name) ?? []

    nodes.push({
      id: `iam:ps:${ps.name}`,
      kind: 'iam',
      label: ps.name,
      data: {
        description: ps.description,
        sessionDuration: ps.sessionDuration,
        policies: policies.length > 0 ? policies : undefined,
        assignments: assignments.length > 0 ? assignments : undefined,
        sublabel: ps.sessionDuration ?? (policies.length > 0 ? `${policies.length} policy` : undefined),
      },
      parentId: rootId,
    })
  }

  // If there are assignments for permission sets not in the permissionSets list, show them too
  for (const [psName, targets] of assignmentsByPs) {
    if (!cfg.permissionSets?.find(p => p.name === psName)) {
      nodes.push({
        id: `iam:ps:${psName}`,
        kind: 'iam',
        label: psName,
        data: {
          assignments: targets,
        },
        parentId: rootId,
      })
    }
  }

  return { nodes, edges }
}
