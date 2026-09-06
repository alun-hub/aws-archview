import { describe, it, expect } from 'vitest'
import type { LzaConfigs } from '../../parser'
import { buildAccountIndex, buildAccountProfile, runValidation } from '..'

const configs: LzaConfigs = {
  organization: {
    enable: true,
    organizationalUnits: [
      { name: 'Infrastructure' },
      { name: 'Workloads', organizationalUnits: [{ name: 'Production' }] },
    ],
    serviceControlPolicies: [
      { name: 'DenyRoot',       description: 'Everywhere',  deploymentTargets: { organizationalUnits: ['Root'] } },
      { name: 'RestrictRegions',                            deploymentTargets: { organizationalUnits: ['Workloads'] } },
      { name: 'ProdGuardrails',                             deploymentTargets: { accounts: ['Aurora-Prod'] } },
      { name: 'InfraOnly',                                  deploymentTargets: { organizationalUnits: ['Infrastructure'] } },
    ],
    backupPolicies: [
      { name: 'DailyBackup', deploymentTargets: { organizationalUnits: ['Workloads/Production'] } },
    ],
  },
  accounts: {
    mandatoryAccounts: [{ name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' }],
    workloadAccounts: [
      {
        name: 'Aurora-Prod', email: 'aurora@example.com', organizationalUnit: 'Workloads/Production',
        description: 'Finance production', tags: { CostCenter: '4711' },
      },
      { name: 'Network', email: 'net@example.com', organizationalUnit: 'Infrastructure' },
    ],
  },
  network: {
    vpcs: [
      {
        name: 'Aurora-Prod-VPC', account: 'Aurora-Prod', region: 'eu-west-1', cidrs: ['10.24.0.0/20'],
        subnets: [
          { name: 'App-A', availabilityZone: 'a', routeTable: 'App-RT', ipv4CidrBlock: '10.24.0.0/24' },
          { name: 'App-B', availabilityZone: 'b', routeTable: 'App-RT', ipv4CidrBlock: '10.24.1.0/24' },
        ],
        transitGatewayAttachments: [{
          name: 'Aurora-Att',
          transitGateway: { name: 'Main-TGW', account: 'Network' },
          routeTableAssociations: [{ routeTableName: 'Spoke-RT' }],
          routeTablePropagations: [{ routeTableName: 'Spoke-RT' }],
        }],
      },
      {
        name: 'Shared-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/20'],
        subnets: [
          {
            name: 'Shared-App-A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.4.0/24',
            shareTargets: { organizationalUnits: ['Workloads/Production'] },
          },
          { name: 'Private-A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.5.0/24' },
        ],
      },
    ],
  },
  iam: {
    roleSets: [
      { deploymentTargets: { organizationalUnits: ['Root'] }, roles: [{ name: 'BreakGlassRole' }] },
      { deploymentTargets: { accounts: ['Network'] },         roles: [{ name: 'NetworkAdminRole' }] },
    ],
    identityCenterAssignments: [{
      name: 'FinanceAdmins', permissionSetName: 'AdministratorAccess',
      principalType: 'GROUP', principalId: 'FinanceAdmins',
      deploymentTargets: { organizationalUnits: ['Workloads/Production'] },
    }],
  },
  customizations: {
    customizations: {
      cloudFormationStacks: [
        { name: 'ProdRemediations', regions: ['eu-west-1'], deploymentTargets: { organizationalUnits: ['Workloads/Production'] } },
        { name: 'InfraBaseline',                            deploymentTargets: { organizationalUnits: ['Infrastructure'] } },
        {
          name: 'ExcludedFromProd',
          deploymentTargets: { organizationalUnits: ['Workloads/Production'], excludedAccounts: ['Aurora-Prod'] },
        },
      ],
    },
  },
  global: {
    homeRegion: 'eu-west-1',
    backup: { vaults: [{ name: 'BackupVault-Prod', deploymentTargets: { organizationalUnits: ['Workloads/Production'] } }] },
  },
}

const index = buildAccountIndex(configs.organization, configs.accounts)
const profile = buildAccountProfile('Aurora-Prod', configs, index)!

describe('buildAccountProfile', () => {
  it('returns null for an account no config declares', () => {
    expect(buildAccountProfile('Nope', configs, index)).toBeNull()
  })

  it('carries the account identity and OU chain', () => {
    expect(profile.email).toBe('aurora@example.com')
    expect(profile.description).toBe('Finance production')
    expect(profile.ouPath).toBe('Workloads/Production')
    expect(profile.ouChain).toEqual(['Root', 'Workloads', 'Workloads/Production'])
    expect(profile.tags).toEqual({ CostCenter: '4711' })
  })
})

describe('policy inheritance', () => {
  it('names where each policy comes from, and excludes ones that miss', () => {
    expect(profile.policies.map((p) => [p.name, p.source])).toEqual([
      ['DenyRoot', 'Root'],
      ['RestrictRegions', 'Workloads'],
      ['ProdGuardrails', 'direct'],
      ['DailyBackup', 'Workloads/Production'],
    ])
    expect(profile.policies.map((p) => p.name)).not.toContain('InfraOnly')
  })

  it('tags the policy type', () => {
    expect(profile.policies.find((p) => p.name === 'DailyBackup')!.type).toBe('backup')
  })

  it('does not match an OU by a path segment alone', () => {
    // "Production" on its own is not this account's OU — only the full
    // "Workloads/Production" path is.
    const segmentOnly = buildAccountProfile('Aurora-Prod', {
      ...configs,
      organization: {
        ...configs.organization!,
        serviceControlPolicies: [{ name: 'Loose', deploymentTargets: { organizationalUnits: ['Production'] } }],
        backupPolicies: [],
      },
    }, index)!
    expect(segmentOnly.policies).toEqual([])
  })
})

describe('network', () => {
  it('lists VPCs the account owns, with AZs and attachments', () => {
    expect(profile.vpcs).toHaveLength(1)
    const vpc = profile.vpcs[0]
    expect(vpc.name).toBe('Aurora-Prod-VPC')
    expect(vpc.cidrs).toEqual(['10.24.0.0/20'])
    expect(vpc.subnets.map((s) => s.name)).toEqual(['App-A', 'App-B'])
    expect(vpc.availabilityZones).toEqual(['a', 'b'])
    expect(vpc.attachments[0]).toMatchObject({ tgw: 'Main-TGW', propagations: ['Spoke-RT'] })
    expect(vpc.link).toEqual({ view: 'network', nodeIds: ['vpc:Aurora-Prod-VPC:Aurora-Prod'] })
  })

  it('lists subnets another account shares with it, and only those', () => {
    expect(profile.sharedSubnets).toHaveLength(1)
    expect(profile.sharedSubnets[0]).toMatchObject({
      subnet: 'Shared-App-A',
      vpc: 'Shared-VPC',
      ownerAccount: 'Network',
      via: 'Workloads/Production',
    })
  })

  it('does not list the account\'s own VPC as a shared subnet', () => {
    expect(profile.sharedSubnets.map((s) => s.vpc)).not.toContain('Aurora-Prod-VPC')
  })
})

describe('IAM and deployables', () => {
  it('resolves role sets through the OU chain', () => {
    expect(profile.iam.roles.map((r) => r.name)).toEqual(['BreakGlassRole'])
    expect(buildAccountProfile('Network', configs, index)!.iam.roles.map((r) => r.name).sort())
      .toEqual(['BreakGlassRole', 'NetworkAdminRole'])
  })

  it('carries what each role actually grants', () => {
    const withPolicies = buildAccountProfile('Aurora-Prod', {
      ...configs,
      iam: {
        roleSets: [{
          deploymentTargets: { organizationalUnits: ['Root'] },
          roles: [{
            name: 'DeploymentRole',
            boundaryPolicy: 'Boundary',
            policies: { awsManaged: ['ReadOnlyAccess'], customerManaged: ['DeployPolicy'] },
          }],
        }],
      },
    }, index)!
    expect(withPolicies.iam.roles[0]).toEqual({
      name: 'DeploymentRole',
      boundaryPolicy: 'Boundary',
      awsManagedPolicies: ['ReadOnlyAccess'],
      customerManagedPolicies: ['DeployPolicy'],
    })
  })

  it('parses the policy document a policy points at', () => {
    // The name only hints at what a policy does; the statements are the answer.
    const withDoc = buildAccountProfile('Aurora-Prod', {
      ...configs,
      organization: {
        ...configs.organization!,
        serviceControlPolicies: [
          { name: 'DenyRoot', policy: 'policies/deny-root.json', deploymentTargets: { organizationalUnits: ['Root'] } },
        ],
        backupPolicies: [],
      },
    }, index, [], {
      'policies/deny-root.json': JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Sid: 'DenyRoot', Effect: 'Deny', Action: '*', Resource: '*' }],
      }),
    })!
    const scp = withDoc.policies.find((p) => p.name === 'DenyRoot')!
    expect(scp.policyFile).toBe('policies/deny-root.json')
    expect(scp.statements).toEqual([
      {
        name: 'DenyRoot [DenyRoot]', sid: 'DenyRoot', effect: 'Deny',
        action: '*', resource: '*', condition: '', principal: '',
      },
    ])
  })

  it('carries the condition, without which an SCP reads as far broader than it is', () => {
    // `Deny * on *` with a condition is a targeted rule; rendering it without
    // the condition says it denies everything for everyone.
    const withCondition = buildAccountProfile('Aurora-Prod', {
      ...configs,
      organization: {
        ...configs.organization!,
        serviceControlPolicies: [
          { name: 'DenyRoot', policy: 'p.json', deploymentTargets: { organizationalUnits: ['Root'] } },
        ],
        backupPolicies: [],
      },
    }, index, [], {
      'p.json': JSON.stringify({
        Statement: [{
          Effect: 'Deny', Action: '*', Resource: '*',
          Condition: { StringLike: { 'aws:PrincipalArn': 'arn:aws:iam::*:root' } },
        }],
      }),
    })!
    expect(withCondition.policies[0].statements![0].condition)
      .toBe('StringLike aws:PrincipalArn = arn:aws:iam::*:root')
  })

  it('reports how far a policy reaches beyond this account', () => {
    const scp = profile.policies.find((p) => p.name === 'DenyRoot')!
    expect(scp.targets.organizationalUnits).toEqual(['Root'])
    // Every account in the fixture, not just the one whose profile this is.
    expect(scp.targets.accountCount).toBe(3)
  })

  it('leaves statements undefined when the document is not loaded', () => {
    const scp = profile.policies.find((p) => p.name === 'DenyRoot')!
    expect(scp.statements).toBeUndefined()
  })

  it('resolves Identity Center assignments', () => {
    expect(profile.iam.ssoAssignments).toEqual([
      { principal: 'FinanceAdmins', principalType: 'GROUP', permissionSet: 'AdministratorAccess' },
    ])
  })

  it('honours excludedAccounts on a customizations stack', () => {
    const names = profile.deployables.map((d) => d.name)
    expect(names).toContain('ProdRemediations')
    expect(names).not.toContain('ExcludedFromProd')
    expect(names).not.toContain('InfraBaseline')
  })

  it('does not treat a parent OU as reaching a nested account', () => {
    // LZA resolves a deploymentTargets block by exact OU match, so a stack on
    // `Workloads` never lands in `Workloads/Production`. Policies do inherit,
    // which is exactly why the two are separated.
    const parentTargeted = buildAccountProfile('Aurora-Prod', {
      ...configs,
      customizations: {
        customizations: {
          cloudFormationStacks: [
            { name: 'ParentTargeted', deploymentTargets: { organizationalUnits: ['Workloads'] } },
          ],
        },
      },
    }, index)!
    expect(parentTargeted.deployables).toEqual([])
    // The SCP on Workloads still reaches it.
    expect(parentTargeted.policies.map((p) => p.name)).toContain('RestrictRegions')
  })

  it('resolves backup vaults', () => {
    expect(profile.backupVaults).toEqual(['BackupVault-Prod'])
  })
})

describe('findings attribution', () => {
  it('attaches only findings anchored on a node the account owns', () => {
    const broken: LzaConfigs = {
      ...configs,
      network: {
        vpcs: [
          {
            name: 'Aurora-Prod-VPC', account: 'Aurora-Prod', region: 'eu-west-1', cidrs: ['10.24.0.0/20'],
            subnets: [
              { name: 'A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.24.0.0/24' },
              { name: 'B', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.24.0.128/25' },
            ],
          },
          { name: 'Other-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.99.0.0/16'] },
        ],
      },
    }
    const findings = runValidation({ configs: broken })
    const p = buildAccountProfile('Aurora-Prod', broken, buildAccountIndex(broken.organization, broken.accounts), findings)!
    expect(p.findings.map((f) => f.ruleId)).toContain('subnet-cidr-overlap')

    // Every finding attached to this profile must name a node it owns.
    const otherAccountsNodes = p.findings.flatMap((f) => f.nodeIds).filter((id) => id.includes(':Network'))
    expect(otherAccountsNodes).toEqual([])

    const other = buildAccountProfile('Network', broken, buildAccountIndex(broken.organization, broken.accounts), findings)!
    expect(other.findings.every((f) => f.nodeIds.some((id) => id.includes('Network')))).toBe(true)
  })
})
