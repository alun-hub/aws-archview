import type { SecurityConfig, GraphEdge, GraphModel, GraphNode } from './types'

export function parseSecurity(cfg: SecurityConfig): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const rootId = 'security:root'
  nodes.push({
    id: rootId,
    kind: 'account',
    label: 'Security Configuration',
    data: { kind: 'account', dlpChecks: cfg.enableDlpChecks },
  })

  if (cfg.guardduty) {
    nodes.push({
      id: 'security:guardduty',
      kind: 'guardduty',
      label: 'GuardDuty',
      data: {
        enabled: cfg.guardduty.enable,
        s3Protection: cfg.guardduty.s3Protection?.enable !== false,
        sublabel: cfg.guardduty.enable ? 'Aktiverad' : 'Inaktiverad',
      },
      parentId: rootId,
    })
  }

  if (cfg.securityHub) {
    const stds = cfg.securityHub.standards?.map(s =>
      typeof s === 'string' ? s : (s as { name: string }).name
    )
    nodes.push({
      id: 'security:securityhub',
      kind: 'security-hub',
      label: 'Security Hub',
      data: {
        enabled: cfg.securityHub.enable,
        standards: stds,
        sublabel: cfg.securityHub.enable
          ? stds?.length ? `${stds.length} standard${stds.length > 1 ? 's' : ''}` : 'Aktiverad'
          : 'Inaktiverad',
      },
      parentId: rootId,
    })
  }

  if (cfg.macie) {
    nodes.push({
      id: 'security:macie',
      kind: 'macie',
      label: 'Macie',
      data: {
        enabled: cfg.macie.enable,
        publishingFrequency: cfg.macie.policyFindingsPublishingFrequency,
        sublabel: cfg.macie.enable ? 'Aktiverad' : 'Inaktiverad',
      },
      parentId: rootId,
    })
  }

  if (cfg.awsConfig) {
    nodes.push({
      id: 'security:config',
      kind: 'config',
      label: 'AWS Config',
      data: {
        recorderEnabled: cfg.awsConfig.enableConfigurationRecorder,
        deliveryChannel: cfg.awsConfig.enableDeliveryChannel,
        sublabel: cfg.awsConfig.enableConfigurationRecorder ? 'Aktiverad' : 'Inaktiverad',
      },
      parentId: rootId,
    })
  }

  if (cfg.cloudtrail) {
    nodes.push({
      id: 'security:cloudtrail',
      kind: 'cloudtrail',
      label: 'CloudTrail',
      data: {
        enabled: cfg.cloudtrail.enable,
        organizationTrail: cfg.cloudtrail.organizationTrail,
        s3BucketName: cfg.cloudtrail.s3BucketName,
        sublabel: cfg.cloudtrail.organizationTrail ? 'Org Trail' : cfg.cloudtrail.enable ? 'Aktiverad' : 'Inaktiverad',
      },
      parentId: rootId,
    })
  }

  if (cfg.cloudwatch) {
    nodes.push({
      id: 'security:cloudwatch',
      kind: 'cloudwatch',
      label: 'CloudWatch',
      data: {
        enabled: cfg.cloudwatch.enable,
        sublabel: cfg.cloudwatch.enable !== false ? 'Aktiverad' : 'Inaktiverad',
      },
      parentId: rootId,
    })
  }

  return { nodes, edges }
}
