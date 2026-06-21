import type { GlobalConfig, GraphEdge, GraphModel, GraphNode } from './types'

export function parseGlobal(cfg: GlobalConfig): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const rootId = 'global:root'
  const regions = cfg.enabledRegions ?? [cfg.homeRegion]

  nodes.push({
    id: rootId,
    kind: 'account',
    label: 'AWS Global Config',
    data: {
      kind: 'account',
      homeRegion: cfg.homeRegion,
      enabledRegions: regions,
      logRetentionDays: cfg.cloudwatchLogRetentionInDays,
      managementRole: cfg.managementAccountAccessRole,
      mandatoryTags: cfg.tags?.map(t => `${t.key}: ${t.value}`),
    },
  })

  // Control Tower
  if (cfg.controlTower) {
    nodes.push({
      id: 'global:ct',
      kind: 'control-tower',
      label: 'Control Tower',
      data: {
        kind: 'control-tower',
        enabled: cfg.controlTower.enable,
        sublabel: cfg.controlTower.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  // CloudTrail
  const ct = cfg.logging?.cloudtrail
  if (!ct || ct.enable !== false) {
    nodes.push({
      id: 'global:cloudtrail',
      kind: 'cloudtrail',
      label: 'CloudTrail',
      data: {
        kind: 'cloudtrail',
        organizationTrail: ct?.organizationTrail,
        sublabel: ct?.organizationTrail ? 'Org Trail' : ct?.enable === false ? 'Disabled' : undefined,
      },
      parentId: rootId,
    })
  }

  // Central logging S3
  if (cfg.logging) {
    nodes.push({
      id: 'global:s3-log',
      kind: 's3',
      label: 'Central Log',
      data: {
        kind: 's3',
        account: cfg.logging.account,
        sublabel: cfg.logging.account ?? 'Log Archive',
      },
      parentId: rootId,
    })
  }

  // Backup vaults
  if (cfg.backup?.vaults?.length) {
    nodes.push({
      id: 'global:backup',
      kind: 'backup',
      label: 'AWS Backup',
      data: {
        kind: 'backup',
        vaults: cfg.backup.vaults.map(v => v.name),
        sublabel: `${cfg.backup.vaults.length} vault${cfg.backup.vaults.length !== 1 ? 's' : ''}`,
      },
      parentId: rootId,
    })
  }

  // Mandatory tags
  if (cfg.tags?.length) {
    nodes.push({
      id: 'global:tags',
      kind: 'config',
      label: 'Mandatory Tags',
      data: {
        kind: 'config',
        tags: cfg.tags.map(t => `${t.key}: ${t.value}`),
        sublabel: `${cfg.tags.length} tag${cfg.tags.length !== 1 ? 's' : ''}`,
      },
      parentId: rootId,
    })
  }

  // Budgets
  const budgets = cfg.reports?.budgets
  if (budgets?.length) {
    nodes.push({
      id: 'global:budgets',
      kind: 'cloudwatch',
      label: 'Budgets',
      data: {
        kind: 'cloudwatch',
        budgets: budgets.map(b => `${b.name}: ${b.amount} ${b.unit}`),
        sublabel: `${budgets.length} budget${budgets.length !== 1 ? 's' : ''}`,
      },
      parentId: rootId,
    })
  }

  return { nodes, edges }
}
