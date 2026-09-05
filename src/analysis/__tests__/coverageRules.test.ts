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

// ── NAT coverage ─────────────────────────────────────────────────────────────

describe('private-subnet-without-nat', () => {
  const build = (natSubnets: string[]): LzaConfigs => ({
    network: {
      vpcFlowLogs: { trafficType: 'ALL' },
      vpcs: [{
        name: 'App-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/21'],
        natGateways: natSubnets.map((s, i) => ({ name: `NAT-${i}`, subnet: s })),
        subnets: [
          { name: 'NAT-Public-A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.0.0/24' },
          { name: 'NAT-Public-B', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.0.1.0/24' },
          { name: 'App-Private-A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.2.0/24' },
          { name: 'App-Private-B', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.0.3.0/24' },
          { name: 'TGW-Attach-B',  availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.0.4.0/28' },
        ],
      }],
    },
  })

  it('flags a private subnet in an AZ the NAT Gateways do not cover', () => {
    const findings = of(build(['NAT-Public-A']), 'private-subnet-without-nat')
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].detail).toContain('App-Private-B is in AZ b')
    expect(findings[0].nodeIds[0]).toBe(subnetNodeId('App-VPC', 'Prod', 'App-Private-B'))
  })

  it('does not flag TGW attachment subnets, which have no egress by design', () => {
    const findings = of(build(['NAT-Public-A']), 'private-subnet-without-nat')
    expect(findings.map((f) => f.detail).join(' ')).not.toContain('TGW-Attach-B')
  })

  it('stays quiet when every AZ has a NAT Gateway', () => {
    expect(of(build(['NAT-Public-A', 'NAT-Public-B']), 'private-subnet-without-nat')).toHaveLength(0)
  })

  it('stays quiet for a VPC with no NAT Gateways at all', () => {
    // Egress is handled elsewhere — a central inspection VPC, or not at all.
    // That is one design decision, not one finding per private subnet.
    expect(of(build([]), 'private-subnet-without-nat')).toHaveLength(0)
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
    expect(findings[0].severity).toBe('warning')
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
