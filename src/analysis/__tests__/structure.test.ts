import { describe, it, expect } from 'vitest'
import type { LzaConfigs } from '../../parser'
import { runValidation } from '..'
import { editDistance, nearestKnownKey } from '../schema/nearMiss'
import { walkShape } from '../schema/walk'
import { NETWORK_SHAPE } from '../schema/shapes'

const of = (input: Parameters<typeof runValidation>[0], ruleId: string) =>
  runValidation(input).filter((f) => f.ruleId === ruleId)

describe('editDistance', () => {
  it('measures single edits', () => {
    expect(editDistance('cidr', 'cidrs', 2)).toBe(1)
    expect(editDistance('acount', 'account', 2)).toBe(1)
    expect(editDistance('regoin', 'region', 2)).toBe(2)
  })

  it('bails out past the cap instead of computing the true distance', () => {
    expect(editDistance('vpcs', 'transitGateways', 2)).toBeGreaterThan(2)
  })
})

describe('nearestKnownKey', () => {
  const known = ['name', 'account', 'region', 'cidrs', 'subnets', 'transitGatewayAttachments']

  it('catches a dropped plural', () => {
    expect(nearestKnownKey('cidr', known)).toBe('cidrs')
    expect(nearestKnownKey('subnet', known)).toBe('subnets')
  })

  it('catches a case slip', () => {
    expect(nearestKnownKey('Region', known)).toBe('region')
  })

  it('catches a transposition', () => {
    expect(nearestKnownKey('acount', known)).toBe('account')
  })

  it('stays silent on a key that is simply not modelled here', () => {
    // Real LZA fields this app does not describe must not be reported —
    // that would bury a valid config in warnings.
    expect(nearestKnownKey('ipamAllocations', known)).toBeNull()
    expect(nearestKnownKey('virtualPrivateGateway', known)).toBeNull()
    expect(nearestKnownKey('outposts', known)).toBeNull()
  })

  it('holds a tight budget for short keys', () => {
    // "vpc" is within 2 edits of both "name" and nothing useful — guessing
    // would produce a confidently wrong suggestion.
    expect(nearestKnownKey('xyz', known)).toBeNull()
  })

  it('refuses to guess between two equally close candidates', () => {
    expect(nearestKnownKey('pame', ['name', 'game'])).toBeNull()
  })
})

describe('walkShape', () => {
  it('descends into nested lists and names each item', () => {
    const visited = walkShape({
      vpcs: [{
        name: 'Prod-VPC',
        subnets: [{ name: 'App-A' }],
      }],
    }, NETWORK_SHAPE)

    const described = visited.map((v) => v.describe)
    expect(described).toContain('VPC "Prod-VPC"')
    expect(described).toContain('subnet "App-A"')
  })

  it('skips subtrees no shape describes rather than guessing at them', () => {
    const visited = walkShape({ somethingWeDoNotModel: { deeply: { nested: true } } }, NETWORK_SHAPE)
    expect(visited).toHaveLength(1)
  })

  it('falls back to the path when an item has no name', () => {
    const visited = walkShape({ vpcs: [{ account: 'Prod' }] }, NETWORK_SHAPE)
    expect(visited.map((v) => v.describe)).toContain('VPC at vpcs[0]')
  })
})

describe('unknown-key', () => {
  it('catches a singular CIDR key that would otherwise be ignored silently', () => {
    const findings = of({ configs: {
      network: { vpcs: [{ name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidr: '10.0.0.0/16' } as never] },
    } }, 'unknown-key')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('did you mean "cidrs"')
    expect(findings[0].severity).toBe('warning')
  })

  it('catches a singular routeTablePropagation on an attachment', () => {
    const findings = of({ configs: {
      network: {
        vpcs: [{
          name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/16'],
          transitGatewayAttachments: [{
            name: 'Att',
            transitGateway: { name: 'TGW', account: 'Network' },
            routeTablePropagation: [{ routeTableName: 'Spoke-RT' }],
          } as never],
        }],
      },
    } }, 'unknown-key')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('did you mean "routeTablePropagations"')
  })

  it('leaves a correct config alone', () => {
    const configs: LzaConfigs = {
      network: {
        vpcs: [{
          name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/16'],
          subnets: [{ name: 'A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.0.0/24' }],
        }],
      },
    }
    expect(of({ configs }, 'unknown-key')).toHaveLength(0)
  })
})

describe('missing-required-field', () => {
  it('flags a VPC with no account', () => {
    const findings = of({ configs: {
      network: { vpcs: [{ name: 'Orphan-VPC', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] } as never] },
    } }, 'missing-required-field')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('VPC "Orphan-VPC" has no "account"')
    expect(findings[0].severity).toBe('error')
  })

  it('treats an empty string as missing', () => {
    const findings = of({ configs: {
      accounts: { mandatoryAccounts: [{ name: 'Management', email: '', organizationalUnit: 'Root' }] },
    } }, 'missing-required-field')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('account "Management" has no "email"')
  })

  it('does not require cidrs, which IPAM-allocated VPCs legitimately omit', () => {
    const findings = of({ configs: {
      network: {
        vpcs: [{ name: 'Ipam-VPC', account: 'Prod', region: 'eu-west-1', ipamAllocations: [{ ipamPoolName: 'p' }] } as never],
      },
    } }, 'missing-required-field')
    expect(findings).toHaveLength(0)
  })
})

describe('missing-include', () => {
  const content = 'vpcs:\n  - !include "vpcs/prod-vpc.yaml"\n'

  it('reports an include whose file was never loaded', () => {
    const findings = of({ configs: {}, loadedFiles: { 'network-config.yaml': content } }, 'missing-include')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].detail).toContain('silently missing from the diagram')
  })

  it('names every file that wanted the same missing include, once', () => {
    const findings = of({ configs: {}, loadedFiles: {
      'network-config.yaml': content,
      'customizations-config.yaml': content,
    } }, 'missing-include')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('customizations-config.yaml, network-config.yaml')
  })

  it('matches an include by basename, as the parser does', () => {
    const findings = of({ configs: {}, loadedFiles: {
      'network-config.yaml': content,
      'MyLZA/prod-vpc.yaml': 'name: Prod-VPC\n',
    } }, 'missing-include')
    expect(findings).toHaveLength(0)
  })
})

describe('yaml-parse-failure', () => {
  it('surfaces a store parse error as a finding', () => {
    const findings = of({
      configs: {},
      parseErrors: { 'network-config.yaml': 'bad indentation at line 4' },
    }, 'yaml-parse-failure')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].view).toBe('network')
    expect(findings[0].detail).toContain('bad indentation at line 4')
  })
})

describe('key lists against the LZA schema', () => {
  // Verified against the v1.14.1 typedocs. A key missing here is not harmless:
  // `unknown-key` would offer a near-miss suggestion for a perfectly valid
  // field, which is worse than saying nothing.
  const has = (shape: { keys: string[] }, keys: string[]) =>
    keys.filter((k) => !shape.keys.includes(k))

  it('covers every documented IVpcConfig property', () => {
    expect(has(NETWORK_SHAPE.children!.vpcs.shape, [
      'account', 'cidrs', 'defaultSecurityGroupRulesDeletion', 'dhcpOptions',
      'dnsFirewallRuleGroups', 'egressOnlyIgw', 'enableDnsHostnames', 'enableDnsSupport',
      'gatewayEndpoints', 'instanceTenancy', 'interfaceEndpoints', 'internetGateway',
      'ipamAllocations', 'ipv6Cidrs', 'loadBalancers', 'name', 'natGateways',
      'networkAcls', 'outposts', 'queryLogs', 'region', 'resolverRules', 'routeTables',
      'securityGroups', 'subnets', 'tags', 'targetGroups', 'transitGatewayAttachments',
      'useCentralEndpoints', 'virtualPrivateGateway', 'vpcFlowLogs', 'vpcRoute53Resolver',
    ])).toEqual([])
  })

  it('covers every documented INetworkConfig property', () => {
    expect(has(NETWORK_SHAPE, [
      'accountVpcEndpointIds', 'accountVpcIds', 'centralNetworkServices', 'certificates',
      'customerGateways', 'defaultVpc', 'dhcpOptions', 'directConnectGateways',
      'elbAccountIds', 'endpointPolicies', 'firewallManagerService', 'homeRegion',
      'prefixLists', 'transitGatewayConnects', 'transitGatewayPeering', 'transitGateways',
      'vpcFlowLogs', 'vpcPeering', 'vpcs', 'vpcTemplates',
    ])).toEqual([])
  })

  it('covers every documented ITransitGatewayConfig property', () => {
    expect(has(NETWORK_SHAPE.children!.transitGateways.shape, [
      'account', 'asn', 'autoAcceptSharingAttachments', 'defaultRouteTableAssociation',
      'defaultRouteTablePropagation', 'dnsSupport', 'name', 'region', 'routeTables',
      'shareTargets', 'tags', 'transitGatewayCidrBlocks', 'transitGatewayIpv6CidrBlocks',
    ])).toEqual([])
  })

  it('covers every documented ISubnetConfig property', () => {
    expect(has(NETWORK_SHAPE.children!.vpcs.shape.children!.subnets.shape, [
      'assignIpv6OnCreation', 'availabilityZone', 'enableDns64', 'ipamAllocation',
      'ipv4CidrBlock', 'ipv6CidrBlock', 'localZone', 'mapPublicIpOnLaunch', 'name',
      'outpost', 'privateDnsOptions', 'routeTable', 'shareTargets', 'tags',
    ])).toEqual([])
  })

  it('treats a VPC template as targeting OUs rather than naming an account', () => {
    const template = NETWORK_SHAPE.children!.vpcTemplates.shape
    expect(template.keys).toContain('deploymentTargets')
    expect(template.keys).not.toContain('account')
    expect(template.required).toEqual(['name', 'deploymentTargets'])
  })
})

describe('resource control policies', () => {
  const configs: LzaConfigs = {
    organization: {
      enable: true,
      organizationalUnits: [{ name: 'Workloads' }],
      serviceControlPolicies: [{ name: 'Guard', deploymentTargets: { organizationalUnits: ['Workloads'] } }],
      resourceControlPolicies: [{ name: 'HttpsOnly', deploymentTargets: { organizationalUnits: ['Nope'] } }],
    },
    accounts: {
      mandatoryAccounts: [{ name: 'Prod', email: 'p@example.com', organizationalUnit: 'Workloads' }],
    },
  }

  it('checks their deployment targets like any other policy', () => {
    const findings = of({ configs }, 'unknown-deployment-target')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('resourceControlPolicies: HttpsOnly')
  })
})
