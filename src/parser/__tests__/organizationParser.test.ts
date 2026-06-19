import { describe, it, expect } from 'vitest'
import { parseOrganization } from '../organizationParser'
import type { OrganizationConfig, AccountsConfig, SecurityConfig, IamConfig } from '../types'

describe('organizationParser', () => {
  it('should inject security services into central accounts', () => {
    const org: OrganizationConfig = {
      enable: true,
      organizationalUnits: [{ name: 'Security' }]
    }
    const accounts: AccountsConfig = {
      mandatoryAccounts: [
        { name: 'Audit', email: 'audit@test.com', organizationalUnit: 'Security' },
        { name: 'LogArchive', email: 'logs@test.com', organizationalUnit: 'Security' },
        { name: 'Management', email: 'mgmt@test.com', organizationalUnit: 'Root' }
      ]
    }
    const security: SecurityConfig = {
      guardduty: { enable: true },
      securityHub: { enable: true },
      macie: { enable: true },
      awsConfig: { enableConfigurationRecorder: true }
    }
    const iam: IamConfig = {
      identityCenter: { enable: true }
    }

    const model = parseOrganization(org, accounts, security, iam)
    
    const auditChildren = model.nodes.filter(n => n.parentId === 'account:Audit')
    expect(auditChildren.map(c => c.kind)).toContain('guardduty')
    expect(auditChildren.map(c => c.kind)).toContain('security-hub')
    expect(auditChildren.map(c => c.kind)).toContain('macie')
    expect(auditChildren.map(c => c.kind)).toContain('config')

    const logChildren = model.nodes.filter(n => n.parentId === 'account:LogArchive')
    expect(logChildren.map(c => c.kind)).toContain('cloudtrail')

    const mgmtChildren = model.nodes.filter(n => n.parentId === 'account:Management')
    expect(mgmtChildren.map(c => c.kind)).toContain('iam')
  })
})
