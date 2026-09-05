import type { SecurityConfig, SecurityService } from '../../parser/types'
import type { Rule, RuleFinding } from '../types'

/** LZA accepts these services either under `centralSecurityServices` or at the
 *  top level of security-config; both shapes appear in real configs. */
function services(security: SecurityConfig): { label: string; service?: SecurityService }[] {
  const central = security.centralSecurityServices
  return [
    { label: 'GuardDuty',       service: central?.guardDuty     ?? security.guardduty },
    { label: 'Security Hub',    service: central?.securityHub   ?? security.securityHub },
    { label: 'Macie',           service: central?.macie         ?? security.macie },
    { label: 'AWS Config',      service: central?.config        ?? security.awsConfig },
    { label: 'CloudTrail',      service: central?.cloudtrail    ?? security.cloudtrail },
    { label: 'Inspector',       service: central?.inspector },
    { label: 'Detective',       service: central?.detective },
    { label: 'Audit Manager',   service: central?.auditManager },
    { label: 'Access Analyzer', service: central?.accessAnalyzer },
  ]
}

/**
 * A security service switched on org-wide but opted out of a region the
 * landing zone actually operates in.
 *
 * LZA enables a service globally and lists the regions to skip, so the gap only
 * shows when `security-config.yaml`'s `excludeRegions` is held against
 * `global-config.yaml`'s `enabledRegions` — two files, neither of which is
 * wrong on its own. An exclusion naming a region the org doesn't enable is
 * harmless but stale, and worth saying so separately.
 */
export const securityServiceExcludedRegion: Rule = {
  id: 'security-service-excluded-region',
  title: 'Security service disabled in an enabled region',
  run(ctx): RuleFinding[] {
    const security = ctx.configs.security
    const enabledRegions = ctx.configs.global?.enabledRegions
    if (!security || !enabledRegions || enabledRegions.length === 0) return []

    const findings: RuleFinding[] = []
    for (const { label, service } of services(security)) {
      if (!service?.enable) continue
      for (const region of service.excludeRegions ?? []) {
        if (!enabledRegions.includes(region)) continue
        findings.push({
          ruleId: 'security-service-excluded-region',
          severity: 'warning',
          title: 'Security service disabled in an enabled region',
          detail: `${label} is enabled but excludes ${region}, which global-config.yaml lists as an enabled region — resources deployed there are not covered.`,
          view: 'security',
          nodeIds: [],
          configFile: 'security-config.yaml',
        })
      }
    }
    return findings
  },
}

/** An `excludeRegions` entry naming a region the organization never enables.
 *  Nothing breaks; the exclusion simply does nothing, and usually survives from
 *  a region that was dropped. */
export const staleRegionExclusion: Rule = {
  id: 'stale-region-exclusion',
  title: 'Region exclusion has no effect',
  run(ctx): RuleFinding[] {
    const security = ctx.configs.security
    const enabledRegions = ctx.configs.global?.enabledRegions
    if (!security || !enabledRegions || enabledRegions.length === 0) return []

    const findings: RuleFinding[] = []
    for (const { label, service } of services(security)) {
      if (!service?.enable) continue
      for (const region of service.excludeRegions ?? []) {
        if (enabledRegions.includes(region)) continue
        findings.push({
          ruleId: 'stale-region-exclusion',
          severity: 'info',
          title: 'Region exclusion has no effect',
          detail: `${label} excludes ${region}, which is not among the organization's enabled regions (${enabledRegions.join(', ')}) — the exclusion does nothing.`,
          view: 'security',
          nodeIds: [],
          configFile: 'security-config.yaml',
        })
      }
    }
    return findings
  },
}
