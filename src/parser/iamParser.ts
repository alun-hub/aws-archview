import type { IamConfig, AccountsConfig, GraphEdge, GraphModel, GraphNode, DeploymentTargets } from './types'
import { findFileContent } from './fileResolve'
import { parsePolicyStatements, type PolicyStatementEntry } from './policyParse'

function formatTargets(dt?: DeploymentTargets): string | undefined {
  if (!dt) return undefined
  const parts = [
    ...(dt.accounts ?? []),
    ...(dt.organizationalUnits ?? []).map((ou) => `OU: ${ou}`),
  ]
  return parts.length > 0 ? parts.join(', ') : undefined
}

export function parseIam(cfg: IamConfig, _accountsConfig?: AccountsConfig, loadedFiles: Record<string, string> = {}): GraphModel {
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

  // ── Account-level IAM: policySets / roleSets / groupSets / userSets ──────────
  // Distinct from Identity Center above — these are IAM resources LZA
  // provisions directly inside member accounts.

  cfg.policySets?.forEach((ps, idx) => {
    const policyStatements: PolicyStatementEntry[] = []
    for (const p of ps.policies ?? []) {
      const content = findFileContent(p.policy, loadedFiles)
      if (content) policyStatements.push(...parsePolicyStatements(p.name, content))
    }
    nodes.push({
      id: `iam:policyset:${idx}`,
      kind: 'iam',
      label: ps.name ?? `Policy Set ${idx + 1}`,
      data: {
        sublabel: 'Policy Set',
        deploymentTargets: formatTargets(ps.deploymentTargets),
        policies: ps.policies?.map((p) => ({ name: p.name, policy: p.policy })),
        policyStatements: policyStatements.length > 0 ? policyStatements : undefined,
      },
      parentId: rootId,
    })
  })

  cfg.roleSets?.forEach((rs, idx) => {
    nodes.push({
      id: `iam:roleset:${idx}`,
      kind: 'iam',
      label: rs.name ?? `Role Set ${idx + 1}`,
      data: {
        sublabel: 'Role Set',
        deploymentTargets: formatTargets(rs.deploymentTargets),
        roles: rs.roles?.map((r) => ({
          name: r.name,
          assumedBy: r.assumedBy?.map((a) => `${a.type}${a.principal ? `:${a.principal}` : ''}`).join(', ') || undefined,
          policies: [...(r.policies?.awsManaged ?? []), ...(r.policies?.customerManaged ?? [])].join(', ') || undefined,
          boundaryPolicy: r.boundaryPolicy,
          instanceProfile: r.instanceProfile,
        })),
      },
      parentId: rootId,
    })
  })

  cfg.groupSets?.forEach((gs, idx) => {
    nodes.push({
      id: `iam:groupset:${idx}`,
      kind: 'iam',
      label: gs.name ?? `Group Set ${idx + 1}`,
      data: {
        sublabel: 'Group Set',
        deploymentTargets: formatTargets(gs.deploymentTargets),
        groups: gs.groups?.map((g) => ({
          name: g.name,
          policies: [...(g.policies?.awsManaged ?? []), ...(g.policies?.customerManaged ?? [])].join(', ') || undefined,
        })),
      },
      parentId: rootId,
    })
  })

  cfg.userSets?.forEach((us, idx) => {
    nodes.push({
      id: `iam:userset:${idx}`,
      kind: 'iam',
      label: us.name ?? `User Set ${idx + 1}`,
      data: {
        sublabel: 'User Set',
        deploymentTargets: formatTargets(us.deploymentTargets),
        users: us.users?.map((u) => ({
          name: u.username,
          group: u.group,
          boundaryPolicy: u.boundaryPolicy,
        })),
      },
      parentId: rootId,
    })
  })

  return { nodes, edges }
}
