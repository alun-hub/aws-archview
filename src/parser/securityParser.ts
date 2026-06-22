import type { SecurityConfig, GraphEdge, GraphModel, GraphNode } from './types'

export interface NormalizedSecurityConfig {
  enableDlpChecks?: boolean
  guardDuty?: { enable: boolean; s3Protection?: { enable: boolean } }
  securityHub?: { enable: boolean; standards?: (string | { name: string })[] }
  macie?: { enable: boolean; policyFindingsPublishingFrequency?: string }
  config?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
  cloudtrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
  cloudwatch?: { enable?: boolean }
  inspector?: { enable: boolean; enableScanTypes?: string[] }
  detective?: { enable: boolean }
  auditManager?: { enable: boolean }
  accessAnalyzer?: { enable: boolean }
}

interface LooseSecurityConfig {
  enableDlpChecks?: boolean
  centralSecurityServices?: {
    delegatedAdminAccount?: string
    macie?: { enable: boolean; policyFindingsPublishingFrequency?: string }
    guardDuty?: { enable: boolean; s3Protection?: { enable: boolean } }
    securityHub?: { enable: boolean; standards?: (string | { name: string })[] }
    config?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
    inspector?: { enable: boolean; enableScanTypes?: string[] }
    detective?: { enable: boolean }
    auditManager?: { enable: boolean }
    accessAnalyzer?: { enable: boolean }
    cloudtrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
    cloudTrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
    enableDlpChecks?: boolean
    cloudwatch?: { enable?: boolean }
    cloudWatch?: { enable?: boolean }
    auditmanager?: { enable: boolean }
    accessanalyzer?: { enable: boolean }
  }
  macie?: { enable: boolean; policyFindingsPublishingFrequency?: string }
  guardduty?: { enable: boolean; s3Protection?: { enable: boolean } }
  guardDuty?: { enable: boolean; s3Protection?: { enable: boolean } }
  securityHub?: { enable: boolean; standards?: (string | { name: string })[] }
  awsConfig?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
  config?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
  cloudwatch?: { enable?: boolean }
  cloudWatch?: { enable?: boolean }
  cloudtrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
  cloudTrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
  inspector?: { enable: boolean; enableScanTypes?: string[] }
  detective?: { enable: boolean }
  auditManager?: { enable: boolean }
  auditmanager?: { enable: boolean }
  accessAnalyzer?: { enable: boolean }
  accessanalyzer?: { enable: boolean }
}

export function getNormalizedSecurityConfig(cfg: SecurityConfig): NormalizedSecurityConfig {
  if (!cfg) return {}
  const loose = cfg as LooseSecurityConfig
  const css = loose.centralSecurityServices || {}
  
  return {
    enableDlpChecks: loose.enableDlpChecks !== undefined ? loose.enableDlpChecks : css.enableDlpChecks,
    guardDuty: css.guardDuty || loose.guardduty || loose.guardDuty,
    securityHub: css.securityHub || loose.securityHub,
    macie: css.macie || loose.macie,
    config: css.config || loose.awsConfig || loose.config,
    cloudtrail: css.cloudtrail || loose.cloudtrail || css.cloudTrail || loose.cloudTrail,
    cloudwatch: css.cloudwatch || loose.cloudwatch || css.cloudWatch || loose.cloudWatch,
    inspector: css.inspector || loose.inspector,
    detective: css.detective || loose.detective,
    auditManager: css.auditManager || loose.auditManager || css.auditmanager || loose.auditmanager,
    accessAnalyzer: css.accessAnalyzer || loose.accessAnalyzer || css.accessanalyzer || loose.accessanalyzer,
  }
}

export function parseSecurity(cfg: SecurityConfig): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const norm = getNormalizedSecurityConfig(cfg)

  const rootId = 'security:root'
  nodes.push({
    id: rootId,
    kind: 'account',
    label: 'Security Configuration',
    data: { kind: 'account', dlpChecks: norm.enableDlpChecks },
  })

  if (norm.guardDuty) {
    nodes.push({
      id: 'security:guardduty',
      kind: 'guardduty',
      label: 'GuardDuty',
      data: {
        enabled: norm.guardDuty.enable,
        s3Protection: norm.guardDuty.s3Protection?.enable !== false,
        sublabel: norm.guardDuty.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.securityHub) {
    const stds = norm.securityHub.standards?.map(s =>
      typeof s === 'string' ? s : (s as { name: string }).name
    )
    nodes.push({
      id: 'security:securityhub',
      kind: 'security-hub',
      label: 'Security Hub',
      data: {
        enabled: norm.securityHub.enable,
        standards: stds,
        sublabel: norm.securityHub.enable
          ? stds?.length ? `${stds.length} standard${stds.length > 1 ? 's' : ''}` : 'Enabled'
          : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.macie) {
    nodes.push({
      id: 'security:macie',
      kind: 'macie',
      label: 'Macie',
      data: {
        enabled: norm.macie.enable,
        publishingFrequency: norm.macie.policyFindingsPublishingFrequency,
        sublabel: norm.macie.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.config) {
    nodes.push({
      id: 'security:config',
      kind: 'config',
      label: 'AWS Config',
      data: {
        recorderEnabled: norm.config.enableConfigurationRecorder,
        deliveryChannel: norm.config.enableDeliveryChannel,
        sublabel: norm.config.enableConfigurationRecorder ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.cloudtrail) {
    nodes.push({
      id: 'security:cloudtrail',
      kind: 'cloudtrail',
      label: 'CloudTrail',
      data: {
        enabled: norm.cloudtrail.enable,
        organizationTrail: norm.cloudtrail.organizationTrail,
        s3BucketName: norm.cloudtrail.s3BucketName,
        sublabel: norm.cloudtrail.organizationTrail ? 'Org Trail' : norm.cloudtrail.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.cloudwatch) {
    nodes.push({
      id: 'security:cloudwatch',
      kind: 'cloudwatch',
      label: 'CloudWatch',
      data: {
        enabled: norm.cloudwatch.enable,
        sublabel: norm.cloudwatch.enable !== false ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.inspector) {
    nodes.push({
      id: 'security:inspector',
      kind: 'inspector',
      label: 'Inspector',
      data: {
        enabled: norm.inspector.enable,
        enableScanTypes: norm.inspector.enableScanTypes,
        sublabel: norm.inspector.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.detective) {
    nodes.push({
      id: 'security:detective',
      kind: 'detective',
      label: 'Detective',
      data: {
        enabled: norm.detective.enable,
        sublabel: norm.detective.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.auditManager) {
    nodes.push({
      id: 'security:auditmanager',
      kind: 'audit-manager',
      label: 'Audit Manager',
      data: {
        enabled: norm.auditManager.enable,
        sublabel: norm.auditManager.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  if (norm.accessAnalyzer) {
    nodes.push({
      id: 'security:accessanalyzer',
      kind: 'access-analyzer',
      label: 'Access Analyzer',
      data: {
        enabled: norm.accessAnalyzer.enable,
        sublabel: norm.accessAnalyzer.enable ? 'Enabled' : 'Disabled',
      },
      parentId: rootId,
    })
  }

  return { nodes, edges }
}

