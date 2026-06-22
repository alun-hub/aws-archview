import { describe, it, expect } from 'vitest'
import { parseSecurity, getNormalizedSecurityConfig } from '../securityParser'
import type { SecurityConfig } from '../types'

describe('securityParser', () => {
  it('should normalize security configuration for both flat and nested layouts', () => {
    const flatCfg: SecurityConfig = {
      guardduty: { enable: true, s3Protection: { enable: false } },
      securityHub: { enable: true, standards: ['CIS'] },
      awsConfig: { enableConfigurationRecorder: true },
      cloudtrail: { enable: true, organizationTrail: true, s3BucketName: 'flat-bucket' }
    }

    const normFlat = getNormalizedSecurityConfig(flatCfg)
    expect(normFlat.guardDuty?.enable).toBe(true)
    expect(normFlat.securityHub?.enable).toBe(true)
    expect(normFlat.config?.enableConfigurationRecorder).toBe(true)
    expect(normFlat.cloudtrail?.s3BucketName).toBe('flat-bucket')

    const nestedCfg = {
      centralSecurityServices: {
        guardDuty: { enable: true, s3Protection: { enable: true } },
        securityHub: { enable: true, standards: ['PCI'] },
        config: { enableConfigurationRecorder: true },
        cloudtrail: { enable: true, organizationTrail: true, s3BucketName: 'nested-bucket' },
        inspector: { enable: true, enableScanTypes: ['EC2'] }
      }
    }

    const normNested = getNormalizedSecurityConfig(nestedCfg as unknown as SecurityConfig)
    expect(normNested.guardDuty?.enable).toBe(true)
    expect(normNested.securityHub?.enable).toBe(true)
    expect(normNested.config?.enableConfigurationRecorder).toBe(true)
    expect(normNested.cloudtrail?.s3BucketName).toBe('nested-bucket')
    expect(normNested.inspector?.enable).toBe(true)
  })

  it('should parse security config and generate correct nodes with English sublabels', () => {
    const nestedCfg = {
      centralSecurityServices: {
        guardDuty: { enable: true },
        securityHub: { enable: true, standards: ['CIS', 'PCI'] },
        config: { enableConfigurationRecorder: true },
        cloudtrail: { enable: true, organizationTrail: true },
        inspector: { enable: true },
        detective: { enable: true }
      }
    }

    const model = parseSecurity(nestedCfg as unknown as SecurityConfig)

    // Verify correct node kinds and labels
    const guardDutyNode = model.nodes.find(n => n.kind === 'guardduty')
    expect(guardDutyNode).toBeDefined()
    expect(guardDutyNode?.data.sublabel).toBe('Enabled')

    const shNode = model.nodes.find(n => n.kind === 'security-hub')
    expect(shNode?.data.sublabel).toBe('2 standards')

    const configNode = model.nodes.find(n => n.kind === 'config')
    expect(configNode?.data.sublabel).toBe('Enabled')

    const ctNode = model.nodes.find(n => n.kind === 'cloudtrail')
    expect(ctNode?.data.sublabel).toBe('Org Trail')

    const inspectorNode = model.nodes.find(n => n.kind === 'inspector')
    expect(inspectorNode?.data.sublabel).toBe('Enabled')

    const detectiveNode = model.nodes.find(n => n.kind === 'detective')
    expect(detectiveNode?.data.sublabel).toBe('Enabled')
  })
})
