import { describe, it, expect } from 'vitest'
import { tracePath } from '../pathTrace'
import type { NetworkConfig, VpcConfig } from '../../parser/types'
import { parsedForKey, resolveConfigKey, type LzaConfigs } from '../../parser'
import { allVpcs } from '../../parser/vpcTemplates'
import { SAMPLE_CONFIGS } from '../../parser/sampleConfigs'

function vpc(overrides: Partial<VpcConfig> & Pick<VpcConfig, 'name' | 'account'>): VpcConfig {
  return { region: 'eu-west-1', ...overrides }
}

describe('tracePath — Transit Gateway', () => {
  const network: NetworkConfig = {
    transitGateways: [{ name: 'TGW', account: 'Network', region: 'eu-west-1' }],
  }

  it('reaches the destination when its attachment propagates into the same route table', () => {
    const vpcs = [
      vpc({
        name: 'Spoke-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-a', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Spoke-RT'], routeTablePropagations: ['Spoke-RT'] }],
      }),
      vpc({
        name: 'Spoke-B', account: 'B', cidrs: ['10.0.1.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-b', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Spoke-RT'], routeTablePropagations: ['Spoke-RT'] }],
      }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'Spoke-A', account: 'A' }, { vpcName: 'Spoke-B', account: 'B' })
    expect(result.forwardReachable).toBe(true)
    expect(result.returnReachable).toBe(true)
  })

  it('reaches the destination via a static route with no propagation at all — the inspection-VPC pattern', () => {
    const withStatic: NetworkConfig = {
      transitGateways: [{
        name: 'TGW', account: 'Network', region: 'eu-west-1',
        routeTables: [{ name: 'Spoke-RT', routes: [{ destinationCidrBlock: '0.0.0.0/0', attachment: { vpcName: 'Inspection', account: 'Network' } }] }],
      }],
    }
    const vpcs = [
      vpc({
        name: 'Spoke-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-a', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Spoke-RT'] }],
      }),
      vpc({
        name: 'Inspection', account: 'Network', cidrs: ['10.0.9.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-i', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Inspection-RT'], routeTablePropagations: [] }],
      }),
    ]
    const result = tracePath(withStatic, vpcs, { vpcName: 'Spoke-A', account: 'A' }, { vpcName: 'Inspection', account: 'Network' })
    expect(result.forwardReachable).toBe(true)
    expect(result.hops.some((h) => h.detail.includes('static route'))).toBe(true)
  })

  it('breaks when the destination neither propagates nor has a static route into the associated table', () => {
    const vpcs = [
      vpc({
        name: 'Spoke-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-a', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Spoke-RT'] }],
      }),
      vpc({
        name: 'Spoke-B', account: 'B', cidrs: ['10.0.1.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-b', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Other-RT'] }],
      }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'Spoke-A', account: 'A' }, { vpcName: 'Spoke-B', account: 'B' })
    expect(result.forwardReachable).toBe(false)
  })

  it('breaks at the attachment when the source VPC has no attachment to the named TGW', () => {
    const vpcs = [
      vpc({
        name: 'Spoke-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
      }),
      vpc({ name: 'Spoke-B', account: 'B', cidrs: ['10.0.1.0/24'] }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'Spoke-A', account: 'A' }, { vpcName: 'Spoke-B', account: 'B' })
    expect(result.forwardReachable).toBe(false)
    expect(result.hops.at(-1)!.detail).toMatch(/no transitGatewayAttachments entry/)
  })

  it('reports a one-directional path when the return route is missing', () => {
    const vpcs = [
      vpc({
        name: 'Spoke-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-a', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Spoke-RT'], routeTablePropagations: ['Spoke-RT'] }],
      }),
      vpc({
        name: 'Spoke-B', account: 'B', cidrs: ['10.0.1.0/24'],
        // No route table at all pointing back toward TGW — a one-way config.
        routeTables: [{ name: 'RT', routes: [] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att-b', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['Spoke-RT'], routeTablePropagations: ['Spoke-RT'] }],
      }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'Spoke-A', account: 'A' }, { vpcName: 'Spoke-B', account: 'B' })
    expect(result.forwardReachable).toBe(true)
    expect(result.returnReachable).toBe(false)
  })
})

describe('tracePath — VPC peering', () => {
  it('reaches the destination when the named peering connects both VPCs', () => {
    const network: NetworkConfig = { vpcPeering: [{ name: 'A-to-B', vpcs: ['Peer-A', 'Peer-B'] }] }
    const vpcs = [
      vpc({
        name: 'Peer-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '10.0.1.0/24', type: 'vpcPeering', target: 'A-to-B' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
      }),
      vpc({
        name: 'Peer-B', account: 'B', cidrs: ['10.0.1.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '10.0.0.0/24', type: 'vpcPeering', target: 'A-to-B' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
      }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'Peer-A', account: 'A' }, { vpcName: 'Peer-B', account: 'B' })
    expect(result.forwardReachable).toBe(true)
    expect(result.returnReachable).toBe(true)
  })

  it('breaks when the route names a peering connection that does not connect these two VPCs', () => {
    const network: NetworkConfig = { vpcPeering: [{ name: 'A-to-C', vpcs: ['Peer-A', 'Peer-C'] }] }
    const vpcs = [
      vpc({
        name: 'Peer-A', account: 'A', cidrs: ['10.0.0.0/24'],
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '10.0.1.0/24', type: 'vpcPeering', target: 'A-to-C' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
      }),
      vpc({ name: 'Peer-B', account: 'B', cidrs: ['10.0.1.0/24'] }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'Peer-A', account: 'A' }, { vpcName: 'Peer-B', account: 'B' })
    expect(result.forwardReachable).toBe(false)
  })
})

describe('tracePath — edge cases', () => {
  it('treats the same VPC as trivially reachable', () => {
    const vpcs = [vpc({ name: 'V', account: 'A', subnets: [{ name: 'Sub' }] })]
    const result = tracePath(undefined, vpcs, { vpcName: 'V', account: 'A' }, { vpcName: 'V', account: 'A' })
    expect(result.forwardReachable).toBe(true)
    expect(result.returnReachable).toBe(true)
  })

  it('reports failure to find an endpoint rather than throwing', () => {
    const result = tracePath(undefined, [], { vpcName: 'Nope', account: 'A' }, { vpcName: 'Also-Nope', account: 'B' })
    expect(result.ok).toBe(false)
  })

  it('breaks when the subnet references a route table the VPC does not declare', () => {
    const vpcs = [
      vpc({ name: 'A', account: 'X', subnets: [{ name: 'Sub', routeTable: 'Missing-RT' }] }),
      vpc({ name: 'B', account: 'Y' }),
    ]
    const result = tracePath(undefined, vpcs, { vpcName: 'A', account: 'X' }, { vpcName: 'B', account: 'Y' })
    expect(result.forwardReachable).toBe(false)
    expect(result.hops.at(-1)!.title).toBe('No route table')
  })

  it('flags an IPAM-allocated destination (no CIDR to match) as unverifiable rather than failing silently', () => {
    const network: NetworkConfig = { transitGateways: [{ name: 'TGW', account: 'Network', region: 'eu-west-1' }] }
    const vpcs = [
      vpc({
        name: 'A', account: 'X',
        routeTables: [{ name: 'RT', routes: [{ name: 'r', destination: '0.0.0.0/0', type: 'transitGateway', target: 'TGW' }] }],
        subnets: [{ name: 'Sub', routeTable: 'RT' }],
        transitGatewayAttachments: [{ name: 'att', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['RT'], routeTablePropagations: ['RT'] }],
      }),
      // No `cidrs` — allocated from IPAM instead.
      vpc({
        name: 'B', account: 'Y',
        transitGatewayAttachments: [{ name: 'att', transitGateway: { name: 'TGW', account: 'Network' }, routeTableAssociations: ['RT'], routeTablePropagations: ['RT'] }],
      }),
    ]
    const result = tracePath(network, vpcs, { vpcName: 'A', account: 'X' }, { vpcName: 'B', account: 'Y' })
    expect(result.hops.some((h) => h.status === 'caveat')).toBe(true)
  })
})

describe('tracePath — bundled sample config', () => {
  function loadSampleVpcs(): { network?: NetworkConfig; vpcs: VpcConfig[] } {
    const configs: LzaConfigs = {}
    for (const [name, content] of Object.entries(SAMPLE_CONFIGS)) {
      const key = resolveConfigKey(name)
      if (!key) continue
      Object.assign(configs, parsedForKey(key, content, SAMPLE_CONFIGS))
    }
    return { network: configs.network, vpcs: allVpcs(configs.network) }
  }

  it('traces Dev-VPC to SharedServices-VPC via the shared Spoke-RT propagation', () => {
    const { network, vpcs } = loadSampleVpcs()
    const result = tracePath(network, vpcs, { vpcName: 'Dev-VPC', account: 'Dev-Application' }, { vpcName: 'SharedServices-VPC', account: 'SharedServices' })
    expect(result.forwardReachable).toBe(true)
  })

  it('traces Dev-VPC to Inspection-VPC via the static route Spoke-RT carries with no propagation', () => {
    const { network, vpcs } = loadSampleVpcs()
    const result = tracePath(network, vpcs, { vpcName: 'Dev-VPC', account: 'Dev-Application' }, { vpcName: 'Inspection-VPC', account: 'Network' })
    expect(result.forwardReachable).toBe(true)
    expect(result.hops.some((h) => h.detail.includes('static route'))).toBe(true)
  })
})
