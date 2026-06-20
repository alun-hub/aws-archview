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
      awsConfig: { enableConfigurationRecorder: true },
      cloudtrail: { enable: true }
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
    // Verify that injected nodes do not override kind in data
    expect(auditChildren.find(c => c.kind === 'guardduty')?.data?.kind).toBeUndefined()

    const logChildren = model.nodes.filter(n => n.parentId === 'account:LogArchive')
    expect(logChildren.map(c => c.kind)).toContain('cloudtrail')
    expect(logChildren.find(c => c.kind === 'cloudtrail')?.data?.kind).toBeUndefined()

    const mgmtChildren = model.nodes.filter(n => n.parentId === 'account:Management')
    expect(mgmtChildren.map(c => c.kind)).toContain('iam')
    expect(mgmtChildren.find(c => c.kind === 'iam')?.data?.kind).toBeUndefined()
  })

  it('should parse and associate SCPs with OUs and accounts', () => {
    const org: OrganizationConfig = {
      enable: true,
      organizationalUnits: [{ name: 'Security' }],
      serviceControlPolicies: [
        {
          name: 'DenyOutsideEU',
          description: 'Restricts operations to EU regions',
          deploymentTargets: {
            organizationalUnits: ['Security']
          }
        },
        {
          name: 'ProtectLogBuckets',
          description: 'Prevents deletion of log buckets',
          deploymentTargets: {
            accounts: ['LogArchive']
          }
        }
      ]
    }
    const accounts: AccountsConfig = {
      mandatoryAccounts: [
        { name: 'Audit', email: 'audit@test.com', organizationalUnit: 'Security' },
        { name: 'LogArchive', email: 'logs@test.com', organizationalUnit: 'Security' },
        { name: 'Management', email: 'mgmt@test.com', organizationalUnit: 'Root' }
      ]
    }

    const model = parseOrganization(org, accounts)

    const ouNode = model.nodes.find(n => n.id === 'ou:Security')
    expect(ouNode?.data.scps).toEqual(['DenyOutsideEU - Restricts operations to EU regions'])

    const logAccountNode = model.nodes.find(n => n.id === 'account:LogArchive')
    expect(logAccountNode?.data.scps).toEqual(['ProtectLogBuckets - Prevents deletion of log buckets'])

    const auditAccountNode = model.nodes.find(n => n.id === 'account:Audit')
    expect(auditAccountNode?.data.scps).toBeUndefined()
  })

  it('should inject IAM Identity Center without explicit enable property', () => {
    const org: OrganizationConfig = { enable: true }
    const accounts: AccountsConfig = {
      mandatoryAccounts: [
        { name: 'Management', email: 'mgmt@test.com', organizationalUnit: 'Root' }
      ]
    }
    const iam: IamConfig = {
      identityCenter: {
        name: 'test-sso',
        delegatedAdminAccount: 'Audit'
      },
      permissionSets: [
        { name: 'AdminAccess', description: 'Administrator Access', sessionDuration: 'PT12H' }
      ]
    }

    const model = parseOrganization(org, accounts, undefined, iam)
    const mgmtChildren = model.nodes.filter(n => n.parentId === 'account:Management')
    expect(mgmtChildren.map(c => c.kind)).toContain('iam')
    const iamNode = mgmtChildren.find(c => c.kind === 'iam')
    expect(iamNode?.data.permissionSets).toEqual(['AdminAccess (Duration: PT12H) - Administrator Access'])
  })
})
