import type { AccountsConfig, OrganizationConfig, OUConfig, SCP } from './types'
import { accountNodeId, ouNodeId } from './nodeIds'
import { flattenOus } from './organizationalUnits'

export type PolicyMatrixCellState = 'direct' | 'inherited' | 'none'

export type PolicyColumnType = 'scp' | 'rcp' | 'tagging' | 'backup'

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
  // Full org-tree path (e.g. "Infrastructure/Network") for OUs; equals label
  // for accounts, which don't nest. Two OUs in different branches can share
  // a name, so the path — not the label — is what uniquely identifies an OU.
  path: string
  kind: 'ou' | 'account'
  children: TreeNode[]
}

/** OUs as a tree, built from the path in each name — see `flattenOus`. */
function buildOuTree(ous: OUConfig[] | undefined): TreeNode[] {
  const byPath = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const ou of flattenOus(ous)) {
    if (ou.ignore) continue
    const node: TreeNode = { id: ouNodeId(ou.path), label: ou.label, path: ou.path, kind: 'ou', children: [] }
    byPath.set(ou.path, node)
    const parent = ou.parentPath ? byPath.get(ou.parentPath) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
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
    const parent = ouPath === 'Root' ? root : (ouChildren.get(ouPath) ?? root)
    parent.children.push({ id: accountNodeId(account.name), label: account.name, path: account.name, kind: 'account', children: [] })
  }
}

function indexOus(nodes: TreeNode[], map: Map<string, TreeNode>) {
  for (const n of nodes) {
    if (n.kind === 'ou') map.set(n.path, n)
    indexOus(n.children, map)
  }
}

export function buildPolicyMatrix(
  orgConfig: OrganizationConfig | undefined,
  accountsConfig: AccountsConfig | undefined,
): PolicyMatrix | null {
  if (!orgConfig || !accountsConfig) return null

  const scps = orgConfig.serviceControlPolicies ?? []
  // Resource control policies target OUs and accounts exactly as SCPs do, so
  // they belong in the same matrix rather than being invisible in it.
  const rcps = orgConfig.resourceControlPolicies ?? []
  const tagging = orgConfig.taggingPolicies ?? []
  const backup = orgConfig.backupPolicies ?? []
  if (scps.length + rcps.length + tagging.length + backup.length === 0) return null

  const columns: PolicyColumn[] = [
    ...scps.map((p) => ({ key: `scp:${p.name}`, name: p.name, type: 'scp' as const })),
    ...rcps.map((p) => ({ key: `rcp:${p.name}`, name: p.name, type: 'rcp' as const })),
    ...tagging.map((p) => ({ key: `tag:${p.name}`, name: p.name, type: 'tagging' as const })),
    ...backup.map((p) => ({ key: `backup:${p.name}`, name: p.name, type: 'backup' as const })),
  ]
  const policyByKey = new Map<string, SCP>([
    ...scps.map((p) => [`scp:${p.name}`, p] as const),
    ...rcps.map((p) => [`rcp:${p.name}`, p] as const),
    ...tagging.map((p) => [`tag:${p.name}`, p] as const),
    ...backup.map((p) => [`backup:${p.name}`, p] as const),
  ])

  const root: TreeNode = { id: 'root', label: 'Root', path: 'Root', kind: 'ou', children: buildOuTree(orgConfig.organizationalUnits) }
  const ouChildren = new Map<string, TreeNode>()
  indexOus([root], ouChildren)
  attachAccounts(root, ouChildren, accountsConfig)

  const rows: PolicyMatrixRow[] = []

  function visit(node: TreeNode, depth: number, ancestorDirect: ReadonlySet<string>) {
    const directKeys = new Set<string>()
    for (const col of columns) {
      const policy = policyByKey.get(col.key)!
      if (matchesTarget(policy, node.kind, node.path)) directKeys.add(col.key)
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
