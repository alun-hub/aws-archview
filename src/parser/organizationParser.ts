import type { AccountsConfig, GraphEdge, GraphModel, GraphNode, OUConfig, OrganizationConfig } from './types'

function collectOUs(
  ous: OUConfig[],
  parentId: string,
  nodes: GraphNode[],
) {
  for (const ou of ous) {
    if (ou.ignore) continue
    const id = `ou:${ou.name}`
    nodes.push({
      id,
      kind: 'ou',
      label: ou.name,
      data: { kind: 'ou', tags: ou.tags },
      parentId,
    })
    if (ou.organizationalUnits?.length) {
      collectOUs(ou.organizationalUnits, id, nodes)
    }
  }
}

export function parseOrganization(
  orgConfig: OrganizationConfig,
  accountsConfig: AccountsConfig,
): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Root is the top-level container
  const rootId = 'root'
  nodes.push({ id: rootId, kind: 'root', label: 'AWS Organization', data: { kind: 'ou' } })

  if (orgConfig.organizationalUnits?.length) {
    collectOUs(orgConfig.organizationalUnits, rootId, nodes)
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

    nodes.push({
      id,
      kind: 'account',
      label: account.name,
      data: {
        kind: 'account',
        email: account.email,
        description: account.description,
        tags: account.tags,
      },
      parentId: nodeSet.has(parentId) ? parentId : rootId,
    })
  }

  return { nodes, edges }
}
