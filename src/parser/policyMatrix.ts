import type { AccountsConfig, OrganizationConfig, OUConfig, SCP } from './types'

export type PolicyMatrixCellState = 'direct' | 'inherited' | 'none'

export type PolicyColumnType = 'scp' | 'tagging' | 'backup'

export interface PolicyColumn {
  key: string
  name: string
  type: PolicyColumnType
}

export interface PolicyMatrixRow {
  id: string
  label: string
  kind: 'ou' | 'account'
  depth: number
  cells: Record<string, PolicyMatrixCellState>
}

export interface PolicyMatrix {
  columns: PolicyColumn[]
  rows: PolicyMatrixRow[]
}

function matchesTarget(p: SCP, kind: 'ou' | 'account', name: string): boolean {
  return kind === 'ou'
    ? !!p.deploymentTargets?.organizationalUnits?.includes(name)
    : !!p.deploymentTargets?.accounts?.includes(name)
}

interface TreeNode {
  id: string
  label: string
  kind: 'ou' | 'account'
  children: TreeNode[]
}

function buildOuTree(ous: OUConfig[]): TreeNode[] {
  return ous
    .filter((ou) => !ou.ignore)
    .map((ou) => ({
      id: `ou:${ou.name}`,
      label: ou.name,
      kind: 'ou' as const,
      children: buildOuTree(ou.organizationalUnits ?? []),
    }))
}

// AWS Organizations (and LZA) always name the top-level OU "Root" — match
// policy `deploymentTargets.organizationalUnits: [Root]` against that literal
// name, independent of whatever label other views use for the root node.
function attachAccounts(root: TreeNode, ouChildren: Map<string, TreeNode>, accountsConfig: AccountsConfig) {
  const allAccounts = [
    ...(accountsConfig.mandatoryAccounts ?? []),
    ...(accountsConfig.workloadAccounts ?? []),
  ]
  for (const account of allAccounts) {
    const ouPath = account.organizationalUnit ?? 'Root'
    const leafOU = ouPath.split('/').pop() ?? ouPath
    const parent = leafOU === 'Root' ? root : (ouChildren.get(leafOU) ?? root)
    parent.children.push({ id: `account:${account.name}`, label: account.name, kind: 'account', children: [] })
  }
}

function indexOus(nodes: TreeNode[], map: Map<string, TreeNode>) {
  for (const n of nodes) {
    if (n.kind === 'ou') map.set(n.label, n)
    indexOus(n.children, map)
  }
}

export function buildPolicyMatrix(
  orgConfig: OrganizationConfig | undefined,
  accountsConfig: AccountsConfig | undefined,
): PolicyMatrix | null {
  if (!orgConfig || !accountsConfig) return null

  const scps = orgConfig.serviceControlPolicies ?? []
  const tagging = orgConfig.taggingPolicies ?? []
  const backup = orgConfig.backupPolicies ?? []
  if (scps.length + tagging.length + backup.length === 0) return null

  const columns: PolicyColumn[] = [
    ...scps.map((p) => ({ key: `scp:${p.name}`, name: p.name, type: 'scp' as const })),
    ...tagging.map((p) => ({ key: `tag:${p.name}`, name: p.name, type: 'tagging' as const })),
    ...backup.map((p) => ({ key: `backup:${p.name}`, name: p.name, type: 'backup' as const })),
  ]
  const policyByKey = new Map<string, SCP>([
    ...scps.map((p) => [`scp:${p.name}`, p] as const),
    ...tagging.map((p) => [`tag:${p.name}`, p] as const),
    ...backup.map((p) => [`backup:${p.name}`, p] as const),
  ])

  const root: TreeNode = { id: 'root', label: 'Root', kind: 'ou', children: buildOuTree(orgConfig.organizationalUnits ?? []) }
  const ouChildren = new Map<string, TreeNode>()
  indexOus([root], ouChildren)
  attachAccounts(root, ouChildren, accountsConfig)

  const rows: PolicyMatrixRow[] = []

  function visit(node: TreeNode, depth: number, ancestorDirect: ReadonlySet<string>) {
    const directKeys = new Set<string>()
    for (const col of columns) {
      const policy = policyByKey.get(col.key)!
      if (matchesTarget(policy, node.kind, node.label)) directKeys.add(col.key)
    }
    const cells: Record<string, PolicyMatrixCellState> = {}
    for (const col of columns) {
      cells[col.key] = directKeys.has(col.key) ? 'direct' : ancestorDirect.has(col.key) ? 'inherited' : 'none'
    }
    rows.push({ id: node.id, label: node.label, kind: node.kind, depth, cells })

    if (node.kind !== 'ou') return
    const combined = new Set([...ancestorDirect, ...directKeys])
    const sorted = [...node.children].sort((a, b) =>
      a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'ou' ? -1 : 1,
    )
    for (const child of sorted) visit(child, depth + 1, combined)
  }

  visit(root, 0, new Set())

  return { columns, rows }
}
