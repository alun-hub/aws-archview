import { describe, it, expect } from 'vitest'
import type { LzaConfigs } from '../../parser'
import { subnetNodeId, vpcNodeId } from '../../parser/nodeIds'
import { runValidation, severityByNode } from '..'

const org: LzaConfigs['organization'] = {
  enable: true,
  organizationalUnits: [{ name: 'Infrastructure' }, { name: 'Workloads' }],
}

const accounts: LzaConfigs['accounts'] = {
  mandatoryAccounts: [{ name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' }],
  workloadAccounts: [
    { name: 'Network', email: 'n@example.com', organizationalUnit: 'Infrastructure' },
    { name: 'Prod', email: 'p@example.com', organizationalUnit: 'Workloads' },
  ],
}

const ids = (configs: LzaConfigs) => runValidation({ configs }).map((f) => f.ruleId)
const of = (configs: LzaConfigs, ruleId: string) => runValidation({ configs }).filter((f) => f.ruleId === ruleId)

describe('vpc-cidr-overlap', () => {
  const overlapping = (extra: Partial<NonNullable<LzaConfigs['network']>> = {}): LzaConfigs => ({
    network: {
      vpcs: [
        { name: 'A-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] },
        { name: 'B-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.128.0/17'] },
      ],
      ...extra,
    },
  })

  it('is an error when both VPCs hang off the same Transit Gateway', () => {
    const configs = overlapping()
    for (const vpc of configs.network!.vpcs!) {
      vpc.transitGatewayAttachments = [
        { name: `${vpc.name}-att`, transitGateway: { name: 'Main-TGW', account: 'Network' } },
      ]
    }
    const findings = of(configs, 'vpc-cidr-overlap')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].detail).toContain('share a Transit Gateway')
    expect(findings[0].nodeIds).toEqual([vpcNodeId('A-VPC', 'Network'), vpcNodeId('B-VPC', 'Prod')])
  })

  it('is an error when the two VPCs are peered', () => {
    const findings = of(overlapping({ vpcPeering: [{ name: 'A-B', vpcs: ['A-VPC', 'B-VPC'] }] }), 'vpc-cidr-overlap')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].detail).toContain('peered')
  })

  it('drops to a warning when nothing connects the two VPCs', () => {
    const findings = of(overlapping(), 'vpc-cidr-overlap')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
  })

  it('reports a VPC pair once even when several CIDRs collide', () => {
    const configs: LzaConfigs = {
      network: {
        vpcs: [
          { name: 'A-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/16', '10.1.0.0/16'] },
          { name: 'B-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/24', '10.1.0.0/24'] },
        ],
      },
    }
    expect(of(configs, 'vpc-cidr-overlap')).toHaveLength(1)
  })

  it('stays quiet on non-overlapping ranges', () => {
    const configs: LzaConfigs = {
      network: {
        vpcs: [
          { name: 'A-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] },
          { name: 'B-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.1.0.0/16'] },
        ],
      },
    }
    expect(of(configs, 'vpc-cidr-overlap')).toHaveLength(0)
  })
})

describe('subnet CIDR rules', () => {
  const vpc = (subnets: { name: string; availabilityZone: string; routeTable: string; ipv4CidrBlock: string }[]): LzaConfigs => ({
    network: {
      vpcs: [{ name: 'App-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/22'], subnets }],
    },
  })

  it('flags a subnet outside every VPC CIDR', () => {
    const findings = of(vpc([
      { name: 'Good', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.1.0/24' },
      { name: 'Typo', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.1.0.0/24' },
    ]), 'subnet-cidr-outside-vpc')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].nodeIds[0]).toBe(subnetNodeId('App-VPC', 'Prod', 'Typo'))
  })

  it('flags two subnets sharing addresses', () => {
    const findings = of(vpc([
      { name: 'A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.0.0/24' },
      { name: 'B', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.0.0.128/25' },
    ]), 'subnet-cidr-overlap')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('A (10.0.0.0/24, AZ a)')
  })

  it('accepts a correctly carved VPC', () => {
    const configs = vpc([
      { name: 'A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.0.0/24' },
      { name: 'B', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.0.1.0/24' },
    ])
    expect(ids(configs).filter((r) => r.startsWith('subnet-cidr'))).toEqual([])
  })
})

describe('unknown-deployment-target', () => {
  it('catches a misspelled OU in an SCP', () => {
    const findings = of({
      organization: {
        ...org!,
        serviceControlPolicies: [
          { name: 'Guardrails', deploymentTargets: { organizationalUnits: ['Workload'] } },
        ],
      },
      accounts,
    }, 'unknown-deployment-target')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('the OU "Workload"')
    expect(findings[0].configFile).toBe('organization-config.yaml')
  })

  it('catches a misspelled account in a customizations stack', () => {
    const findings = of({
      organization: org,
      accounts,
      customizations: {
        customizations: {
          cloudFormationStacks: [
            { name: 'Baseline', deploymentTargets: { accounts: ['Prod', 'Prood'] } },
          ],
        },
      },
    }, 'unknown-deployment-target')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('the account "Prood"')
    expect(findings[0].view).toBe('customizations')
  })

  it('catches a Transit Gateway shared with an OU that does not exist', () => {
    const findings = of({
      organization: org,
      accounts,
      network: {
        transitGateways: [{
          name: 'Main-TGW', account: 'Network', region: 'eu-west-1',
          shareTargets: { organizationalUnits: ['Infrastructure', 'Sandbox'] },
        }],
      },
    }, 'unknown-deployment-target')
    expect(findings).toHaveLength(1)
    expect(findings[0].nodeIds).toEqual(['tgw:Main-TGW'])
  })

  it('says nothing without organization and accounts configs to check against', () => {
    const findings = of({
      customizations: { cloudFormationStacks: [{ name: 'X', deploymentTargets: { accounts: ['Nope'] } }] },
    }, 'unknown-deployment-target')
    expect(findings).toHaveLength(0)
  })
})

describe('empty-deployment-target', () => {
  it('flags a policy targeting an OU that holds no accounts', () => {
    const findings = of({
      organization: {
        enable: true,
        organizationalUnits: [{ name: 'Sandbox' }],
        serviceControlPolicies: [{ name: 'Unused', deploymentTargets: { organizationalUnits: ['Sandbox'] } }],
      },
      accounts,
    }, 'empty-deployment-target')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
  })

  it('does not double-report a target that is already a broken reference', () => {
    const findings = runValidation({ configs: {
      organization: {
        ...org!,
        serviceControlPolicies: [{ name: 'Broken', deploymentTargets: { organizationalUnits: ['Nope'] } }],
      },
      accounts,
    } })
    // The broken reference is reported once, by the rule that owns it —
    // `empty-deployment-target` must not also claim it resolved to nothing.
    expect(findings.map((f) => f.ruleId)).toContain('unknown-deployment-target')
    expect(findings.map((f) => f.ruleId)).not.toContain('empty-deployment-target')
  })

  it('reports an object with no deploymentTargets block at all', () => {
    const findings = of({
      organization: {
        ...org!,
        serviceControlPolicies: [{ name: 'Orphan' }],
      },
      accounts,
    }, 'empty-deployment-target')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('declares no deploymentTargets at all')
  })
})

describe('TGW routing rules', () => {
  const base = (overrides: Partial<NonNullable<LzaConfigs['network']>>): LzaConfigs => ({
    network: {
      transitGateways: [{
        name: 'Main-TGW', account: 'Network', region: 'eu-west-1',
        defaultRouteTablePropagation: 'disable',
      }],
      transitGatewayRouteTables: [
        { name: 'Spoke-RT', transitGateway: { name: 'Main-TGW', account: 'Network' } },
        { name: 'Ingress-RT', transitGateway: { name: 'Main-TGW', account: 'Network' } },
      ],
      ...overrides,
    },
  })

  it('flags an attachment that associates but never propagates', () => {
    const findings = of(base({
      vpcs: [{
        name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.2.0.0/16'],
        transitGatewayAttachments: [{
          name: 'Prod-Att',
          transitGateway: { name: 'Main-TGW', account: 'Network' },
          routeTableAssociations: [{ routeTableName: 'Spoke-RT' }],
        }],
      }],
    }), 'tgw-attachment-no-propagation')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('nothing on Main-TGW learns how to reach it')
    expect(findings[0].nodeIds).toEqual([vpcNodeId('Prod-VPC', 'Prod')])
  })

  it('stays quiet when the Transit Gateway propagates by default', () => {
    const configs = base({
      transitGateways: [{
        name: 'Main-TGW', account: 'Network', region: 'eu-west-1',
        defaultRouteTablePropagation: 'enable',
      }],
      vpcs: [{
        name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.2.0.0/16'],
        transitGatewayAttachments: [{
          name: 'Prod-Att',
          transitGateway: { name: 'Main-TGW', account: 'Network' },
          routeTableAssociations: [{ routeTableName: 'Spoke-RT' }],
        }],
      }],
    })
    expect(of(configs, 'tgw-attachment-no-propagation')).toHaveLength(0)
  })

  it('flags a route table name that is not declared', () => {
    const findings = of(base({
      customerGateways: [{
        name: 'OnPrem-CGW', account: 'Network', region: 'eu-west-1', ipAddress: '203.0.113.10', asn: 65000,
        vpnConnections: [{
          name: 'OnPrem-VPN',
          transitGateway: 'Main-TGW',
          routeTableAssociations: [{ routeTableName: 'VPN-RT' }],
          routeTablePropagations: [{ routeTableName: 'Spoke-RT' }],
        }],
      }],
    }), 'unknown-tgw-route-table')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('VPN "OnPrem-VPN" associates with "VPN-RT"')
    expect(findings[0].severity).toBe('error')
  })
})

describe('unresolved-replacement', () => {
  it('reports a token an !include path uses but replacements-config never defines', () => {
    const findings = runValidation({ configs: {}, loadedFiles: {
      'network-config.yaml': 'vpcs:\n  - !include "vpcs/{{ Stage }}-vpc.yaml"\n',
    } }).filter((f) => f.ruleId === 'unresolved-replacement')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('{{ Stage }}')
  })

  it('stays quiet once the token resolves', () => {
    const findings = runValidation({ configs: {}, loadedFiles: {
      'network-config.yaml': 'vpcs:\n  - !include "vpcs/{{ Stage }}-vpc.yaml"\n',
      'replacements-config.yaml': 'globalReplacements:\n  - key: Stage\n    type: String\n    value: prod\n',
    } }).filter((f) => f.ruleId === 'unresolved-replacement')
    expect(findings).toHaveLength(0)
  })
})

describe('runValidation', () => {
  it('sorts errors ahead of warnings', () => {
    const findings = runValidation({ configs: {
      organization: {
        ...org!,
        serviceControlPolicies: [{ name: 'Broken', deploymentTargets: { organizationalUnits: ['Nope'] } }],
      },
      accounts,
      network: {
        vpcs: [
          { name: 'A-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] },
          { name: 'B-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/24'] },
        ],
      },
    } })
    // Severity ordering holds across the whole set, whichever rules fire.
    const severities = findings.map((f) => f.severity)
    expect(severities).toEqual([...severities].sort((a, b) =>
      ({ error: 0, warning: 1, info: 2 })[a] - ({ error: 0, warning: 1, info: 2 })[b]))
    expect(findings.filter((f) => f.severity === 'error').map((f) => f.ruleId))
      .toEqual(['unknown-deployment-target'])
    expect(findings.map((f) => f.ruleId)).toContain('vpc-cidr-overlap')
  })

  it('finds nothing in an empty config set', () => {
    expect(runValidation({ configs: {} })).toEqual([])
  })

  it('keeps going when one rule throws', () => {
    const boom = { id: 'boom', title: 'Boom', run() { throw new Error('nope') } }
    const findings = runValidation({ configs: {}, loadedFiles: {
      'network-config.yaml': 'vpcs:\n  - !include "{{ Stage }}.yaml"\n',
    } }, [boom, { id: 'noop', title: 'None', run: () => [] }])
    expect(findings).toEqual([])
  })
})

describe('severityByNode', () => {
  it('keeps the worst severity when a node collects findings from several rules', () => {
    const map = severityByNode([
      { id: 'a', ruleId: 'r1', severity: 'warning', title: 'w', detail: 'w', view: 'network', nodeIds: ['vpc:X:Y'] },
      { id: 'b', ruleId: 'r2', severity: 'error', title: 'e', detail: 'e', view: 'network', nodeIds: ['vpc:X:Y'] },
      { id: 'c', ruleId: 'r3', severity: 'info', title: 'i', detail: 'i', view: 'network', nodeIds: ['vpc:X:Y'] },
    ])
    expect(map.get('vpc:X:Y')).toBe('error')
  })
})
