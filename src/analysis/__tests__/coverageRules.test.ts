import { describe, it, expect } from 'vitest'
import type { LzaConfigs, ViewKind } from '../../parser'
import { subnetNodeId, vpcNodeId } from '../../parser/nodeIds'
import { runValidation } from '..'

const of = (configs: LzaConfigs, ruleId: string) =>
  runValidation({ configs }).filter((f) => f.ruleId === ruleId)

// ── Route tables ─────────────────────────────────────────────────────────────

describe('unknown-subnet-route-table', () => {
  const vpcWith = (routeTables: { name: string; gatewayAssociation?: string }[] | undefined): LzaConfigs => ({
    network: {
      vpcFlowLogs: { trafficType: 'ALL' },
      vpcs: [{
        name: 'App-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/22'],
        routeTables,
        subnets: [
          { name: 'App-A', availabilityZone: 'a', routeTable: 'App-RT', ipv4CidrBlock: '10.0.0.0/24' },
          { name: 'App-B', availabilityZone: 'b', routeTable: 'App-RTT', ipv4CidrBlock: '10.0.1.0/24' },
        ],
      }],
    },
  })

  it('flags a subnet whose route table the VPC never declares', () => {
    const findings = of(vpcWith([{ name: 'App-RT' }]), 'unknown-subnet-route-table')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].detail).toContain('"App-RTT"')
    expect(findings[0].nodeIds[0]).toBe(subnetNodeId('App-VPC', 'Prod', 'App-B'))
  })

  it('says nothing when the VPC declares no route tables at all', () => {
    // Plenty of configs leave routing to defaults — flagging every subnet
    // there would be noise, not a finding.
    expect(of(vpcWith(undefined), 'unknown-subnet-route-table')).toHaveLength(0)
  })

  it('accepts a VPC where every reference resolves', () => {
    expect(of(vpcWith([{ name: 'App-RT' }, { name: 'App-RTT' }]), 'unknown-subnet-route-table')).toHaveLength(0)
  })
})

describe('unused-vpc-route-table', () => {
  const build = (routeTables: { name: string; gatewayAssociation?: string }[]): LzaConfigs => ({
    network: {
      vpcFlowLogs: { trafficType: 'ALL' },
      vpcs: [{
        name: 'App-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/22'],
        routeTables,
        subnets: [{ name: 'App-A', availabilityZone: 'a', routeTable: 'App-RT', ipv4CidrBlock: '10.0.0.0/24' }],
      }],
    },
  })

  it('flags a route table no subnet references', () => {
    const findings = of(build([{ name: 'App-RT' }, { name: 'Leftover-RT' }]), 'unused-vpc-route-table')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('info')
    expect(findings[0].detail).toContain('"Leftover-RT"')
  })

  it('leaves a gateway-associated table alone, since no subnet should point at it', () => {
    const findings = of(build([
      { name: 'App-RT' },
      { name: 'IGW-RT', gatewayAssociation: 'internetGateway' },
    ]), 'unused-vpc-route-table')
    expect(findings).toHaveLength(0)
  })
})

// ── Routing reachability ────────────────────────────────────────────────────
//
// These rules read route tables, never subnet names. LZA has no notion of a
// "private" subnet — a subnet is public exactly when its route table sends the
// default route to an internet gateway — so a rule keyed on naming convention
// would be right only for configs that happen to name things the way our
// samples do.

const routed = (
  routes: Record<string, { name: string; destination?: string; type?: string; target?: string }[]>,
  subnets: { name: string; availabilityZone?: string | number; routeTable?: string; mapPublicIpOnLaunch?: boolean }[],
  natGateways: { name: string; subnet: string }[] = [],
): LzaConfigs => ({
  network: {
    vpcFlowLogs: { trafficType: 'ALL' },
    vpcs: [{
      name: 'App-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/21'],
      natGateways,
      routeTables: Object.entries(routes).map(([name, r]) => ({ name, routes: r })),
      subnets: subnets.map((s) => ({ ipv4CidrBlock: '10.0.9.0/24', ...s })),
    }],
  },
})

describe('nat-gateway-crosses-az', () => {
  const routes = {
    'Public-RT':  [{ name: 'Igw', destination: '0.0.0.0/0', type: 'internetGateway' }],
    'App-RT-A':   [{ name: 'Nat', destination: '0.0.0.0/0', type: 'natGateway', target: 'Nat-A' }],
    'App-RT-B':   [{ name: 'Nat', destination: '0.0.0.0/0', type: 'natGateway', target: 'Nat-B' }],
  }
  const subnets = [
    { name: 'Public-A', availabilityZone: 'a', routeTable: 'Public-RT' },
    { name: 'Public-B', availabilityZone: 'b', routeTable: 'Public-RT' },
    { name: 'Workload-A', availabilityZone: 'a', routeTable: 'App-RT-A' },
    { name: 'Workload-B', availabilityZone: 'b', routeTable: 'App-RT-A' },
  ]

  it('flags a subnet whose default route targets a NAT in another AZ', () => {
    const findings = of(routed(routes, subnets, [{ name: 'Nat-A', subnet: 'Public-A' }]), 'nat-gateway-crosses-az')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].detail).toContain('Workload-B is in AZ b')
    expect(findings[0].detail).toContain('"Nat-A" in AZ a')
    expect(findings[0].nodeIds[0]).toBe(subnetNodeId('App-VPC', 'Prod', 'Workload-B'))
  })

  it('stays quiet when each AZ routes to its own NAT Gateway', () => {
    const perAz = subnets.map((s) => s.name === 'Workload-B' ? { ...s, routeTable: 'App-RT-B' } : s)
    const findings = of(
      routed(routes, perAz, [{ name: 'Nat-A', subnet: 'Public-A' }, { name: 'Nat-B', subnet: 'Public-B' }]),
      'nat-gateway-crosses-az',
    )
    expect(findings).toHaveLength(0)
  })

  it('does not judge a subnet by its name', () => {
    // Named "Private" but routed to an internet gateway: a name-based rule
    // would report it, a route-based one correctly says nothing.
    const findings = of(routed(routes, [
      { name: 'Private-Looking-Subnet', availabilityZone: 'b', routeTable: 'Public-RT' },
    ], [{ name: 'Nat-A', subnet: 'Public-A' }]), 'nat-gateway-crosses-az')
    expect(findings).toHaveLength(0)
  })

  it('says nothing when the NAT target does not resolve', () => {
    // A dangling target is a reference problem, not an AZ problem — guessing
    // at the AZ would invent a finding.
    expect(of(routed(routes, subnets, [{ name: 'Nat-Z', subnet: 'Public-A' }]), 'nat-gateway-crosses-az'))
      .toHaveLength(0)
  })
})

describe('subnet-without-default-route', () => {
  it('flags a subnet whose route table has no default route', () => {
    const findings = of(routed({
      'App-RT':      [{ name: 'Nat', destination: '0.0.0.0/0', type: 'natGateway', target: 'Nat-A' }],
      'Isolated-RT': [{ name: 'Local', destination: '10.1.0.0/16', type: 'transitGateway', target: 'Tgw' }],
    }, [
      { name: 'Workload-A', availabilityZone: 'a', routeTable: 'App-RT' },
      { name: 'Data-A', availabilityZone: 'a', routeTable: 'Isolated-RT' },
    ]), 'subnet-without-default-route')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('info')
    expect(findings[0].detail).toContain('Data-A')
  })

  it('counts a Transit Gateway default route as a way out', () => {
    expect(of(routed({
      'Tgw-RT': [{ name: 'Tgw', destination: '0.0.0.0/0', type: 'transitGateway', target: 'Main' }],
    }, [{ name: 'Workload-A', availabilityZone: 'a', routeTable: 'Tgw-RT' }]),
      'subnet-without-default-route')).toHaveLength(0)
  })

  it('does not count a gateway endpoint as general egress', () => {
    const findings = of(routed({
      'S3-RT': [{ name: 'S3', type: 'gatewayEndpoint', target: 's3' },
                { name: 'Local', destination: '10.1.0.0/16', type: 'transitGateway', target: 'Tgw' }],
    }, [{ name: 'Workload-A', availabilityZone: 'a', routeTable: 'S3-RT' }]),
      'subnet-without-default-route')
    expect(findings).toHaveLength(1)
  })

  it('says nothing when no route table carries routes', () => {
    // No evidence either way — and guessing from names is what this replaced.
    expect(of(routed({ 'App-RT': [] }, [
      { name: 'Workload-A', availabilityZone: 'a', routeTable: 'App-RT' },
    ]), 'subnet-without-default-route')).toHaveLength(0)
  })
})

describe('public-subnet-auto-assigns-ips', () => {
  it('flags a subnet that both routes to an IGW and auto-assigns public IPs', () => {
    const findings = of(routed({
      'Public-RT': [{ name: 'Igw', destination: '0.0.0.0/0', type: 'internetGateway' }],
    }, [{ name: 'Edge-A', availabilityZone: 'a', routeTable: 'Public-RT', mapPublicIpOnLaunch: true }]),
      'public-subnet-auto-assigns-ips')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('info')
  })

  it('ignores mapPublicIpOnLaunch on a subnet with no route to an IGW', () => {
    expect(of(routed({
      'App-RT': [{ name: 'Nat', destination: '0.0.0.0/0', type: 'natGateway', target: 'Nat-A' }],
    }, [{ name: 'Edge-A', availabilityZone: 'a', routeTable: 'App-RT', mapPublicIpOnLaunch: true }]),
      'public-subnet-auto-assigns-ips')).toHaveLength(0)
  })
})

// ── Flow logs ────────────────────────────────────────────────────────────────

describe('vpc-without-flow-logs', () => {
  const vpcs = [
    { name: 'A-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] },
    { name: 'B-VPC', account: 'Dev', region: 'eu-west-1', cidrs: ['10.1.0.0/16'] },
  ]

  it('flags every VPC when nothing configures flow logs', () => {
    const findings = of({ network: { vpcs } }, 'vpc-without-flow-logs')
    expect(findings).toHaveLength(2)
    // Info, not a warning: nothing is broken, an option is simply not on, and
    // it may well be handled outside the LZA configs this app can see.
    expect(findings[0].severity).toBe('info')
    expect(findings[0].nodeIds).toEqual([vpcNodeId('A-VPC', 'Prod')])
  })

  it('stays silent when network-config sets a default for every VPC', () => {
    expect(of({ network: { vpcFlowLogs: { trafficType: 'ALL' }, vpcs } }, 'vpc-without-flow-logs')).toHaveLength(0)
  })

  it('only flags the VPCs that lack their own block', () => {
    const findings = of({
      network: { vpcs: [{ ...vpcs[0], vpcFlowLogs: { trafficType: 'ALL' } }, vpcs[1]] },
    }, 'vpc-without-flow-logs')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('B-VPC')
  })
})

// ── Security service regions ─────────────────────────────────────────────────

describe('security-service-excluded-region', () => {
  const global: LzaConfigs['global'] = { homeRegion: 'eu-west-1', enabledRegions: ['eu-west-1', 'eu-north-1'] }

  it('flags a service that opts out of a region the organization runs in', () => {
    const findings = of({
      global,
      security: { guardduty: { enable: true, excludeRegions: ['eu-north-1'] } },
    }, 'security-service-excluded-region')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].detail).toContain('GuardDuty is enabled but excludes eu-north-1')
    expect(findings[0].view).toBe<ViewKind>('security')
  })

  it('reads services under centralSecurityServices too', () => {
    const findings = of({
      global,
      security: { centralSecurityServices: { securityHub: { enable: true, excludeRegions: ['eu-west-1'] } } },
    }, 'security-service-excluded-region')
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('Security Hub')
  })

  it('ignores exclusions on a service that is switched off anyway', () => {
    expect(of({
      global,
      security: { guardduty: { enable: false, excludeRegions: ['eu-north-1'] } },
    }, 'security-service-excluded-region')).toHaveLength(0)
  })

  it('needs global-config to have something to check against', () => {
    expect(of({
      security: { guardduty: { enable: true, excludeRegions: ['eu-north-1'] } },
    }, 'security-service-excluded-region')).toHaveLength(0)
  })
})

describe('stale-region-exclusion', () => {
  it('flags an exclusion for a region the organization never enables', () => {
    const findings = of({
      global: { homeRegion: 'eu-west-1', enabledRegions: ['eu-west-1'] },
      security: { guardduty: { enable: true, excludeRegions: ['ap-south-1'] } },
    }, 'stale-region-exclusion')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('info')
    expect(findings[0].detail).toContain('the exclusion does nothing')
  })
})

// ── OU coverage ──────────────────────────────────────────────────────────────

describe('ou-without-scp', () => {
  const accounts: LzaConfigs['accounts'] = {
    mandatoryAccounts: [{ name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' }],
    workloadAccounts: [{ name: 'Prod-1', email: 'p@example.com', organizationalUnit: 'Workloads/Prod' }],
  }

  it('flags an OU no SCP reaches, and counts the accounts left uncovered', () => {
    const findings = of({
      accounts,
      organization: {
        enable: true,
        organizationalUnits: [
          { name: 'Workloads', organizationalUnits: [{ name: 'Prod' }] },
          { name: 'Sandbox' },
        ],
        serviceControlPolicies: [{ name: 'Guard', deploymentTargets: { organizationalUnits: ['Sandbox'] } }],
      },
    }, 'ou-without-scp')
    // Only the topmost uncovered OU is reported: attaching a policy to
    // Workloads covers Workloads/Prod too, so naming both is one problem
    // stated twice.
    expect(findings.map((f) => f.detail)).toEqual([
      'No service control policy targets the OU "Workloads" or any OU above it, leaving its 1 account without guardrails.',
    ])
    expect(findings[0].severity).toBe('info')
  })

  it('treats a policy on a parent OU as covering everything beneath it', () => {
    expect(of({
      accounts,
      organization: {
        enable: true,
        organizationalUnits: [{ name: 'Workloads', organizationalUnits: [{ name: 'Prod' }] }],
        serviceControlPolicies: [{ name: 'Guard', deploymentTargets: { organizationalUnits: ['Workloads'] } }],
      },
    }, 'ou-without-scp')).toHaveLength(0)
  })

  it('treats a policy on Root as covering every OU', () => {
    expect(of({
      accounts,
      organization: {
        enable: true,
        organizationalUnits: [{ name: 'Workloads', organizationalUnits: [{ name: 'Prod' }] }, { name: 'Sandbox' }],
        serviceControlPolicies: [{ name: 'Guard', deploymentTargets: { organizationalUnits: ['Root'] } }],
      },
    }, 'ou-without-scp')).toHaveLength(0)
  })

  it('skips an OU LZA does not manage', () => {
    const findings = of({
      accounts,
      organization: {
        enable: true,
        organizationalUnits: [{ name: 'Suspended', ignore: true }, { name: 'Sandbox' }],
        serviceControlPolicies: [{ name: 'Guard', deploymentTargets: { organizationalUnits: ['Sandbox'] } }],
      },
    }, 'ou-without-scp')
    expect(findings).toHaveLength(0)
  })

  it('says nothing when the config declares no SCPs at all', () => {
    expect(of({
      accounts,
      organization: { enable: true, organizationalUnits: [{ name: 'Workloads' }] },
    }, 'ou-without-scp')).toHaveLength(0)
  })
})
