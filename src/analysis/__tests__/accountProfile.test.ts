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
            shareTargets: { organizationalUnits: ['Workloads'] },
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
        { name: 'ProdRemediations', regions: ['eu-west-1'], deploymentTargets: { organizationalUnits: ['Workloads'] } },
        { name: 'InfraBaseline',                            deploymentTargets: { organizationalUnits: ['Infrastructure'] } },
        {
          name: 'ExcludedFromProd',
          deploymentTargets: { organizationalUnits: ['Workloads'], excludedAccounts: ['Aurora-Prod'] },
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
    expect(vpc.subnetCount).toBe(2)
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
      via: 'Workloads',
    })
  })

  it('does not list the account\'s own VPC as a shared subnet', () => {
    expect(profile.sharedSubnets.map((s) => s.vpc)).not.toContain('Aurora-Prod-VPC')
  })
})

describe('IAM and deployables', () => {
  it('resolves role sets through the OU chain', () => {
    expect(profile.iam.roles).toEqual(['BreakGlassRole'])
    expect(buildAccountProfile('Network', configs, index)!.iam.roles.sort())
      .toEqual(['BreakGlassRole', 'NetworkAdminRole'])
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
