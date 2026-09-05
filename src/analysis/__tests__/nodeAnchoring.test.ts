import { describe, it, expect } from 'vitest'
import { buildNetworkGraph, type LzaConfigs } from '../../parser'
import { runValidation } from '..'

/** A finding's whole value in the UI is that clicking it lands on the node.
 *  The rules mint ids through `parser/nodeIds` and the parsers now consume the
 *  same builders, but nothing enforces that at compile time — so assert it
 *  against a real graph instead. */
const configs: LzaConfigs = {
  organization: {
    enable: true,
    organizationalUnits: [{ name: 'Infrastructure' }, { name: 'Workloads' }],
  },
  accounts: {
    mandatoryAccounts: [{ name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' }],
    workloadAccounts: [
      { name: 'Network', email: 'n@example.com', organizationalUnit: 'Infrastructure' },
      { name: 'Prod', email: 'p@example.com', organizationalUnit: 'Workloads' },
    ],
  },
  network: {
    transitGateways: [{
      name: 'Main-TGW', account: 'Network', region: 'eu-west-1',
      defaultRouteTablePropagation: 'disable',
      // targets an OU that does not exist → finding anchored on the TGW node
      shareTargets: { organizationalUnits: ['Workloads', 'Sandbox'] },
    }],
    transitGatewayRouteTables: [
      { name: 'Spoke-RT', transitGateway: { name: 'Main-TGW', account: 'Network' } },
    ],
    customerGateways: [{
      name: 'OnPrem-CGW', account: 'Network', region: 'eu-west-1', ipAddress: '203.0.113.10', asn: 65000,
      vpnConnections: [{
        name: 'OnPrem-VPN',
        transitGateway: 'Main-TGW',
        // names a route table that isn't declared → finding anchored on the VPN
        routeTableAssociations: [{ routeTableName: 'VPN-RT' }],
      }],
    }],
    vpcs: [
      {
        name: 'Hub-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/16'],
        subnets: [
          { name: 'A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.0.0.0/24' },
          // overlaps A, and the second one sits outside the VPC entirely
          { name: 'B', availabilityZone: 'b', routeTable: 'RT', ipv4CidrBlock: '10.0.0.128/25' },
          { name: 'C', availabilityZone: 'c', routeTable: 'RT', ipv4CidrBlock: '10.9.0.0/24' },
        ],
        transitGatewayAttachments: [{
          name: 'Hub-Att',
          transitGateway: { name: 'Main-TGW', account: 'Network' },
          routeTableAssociations: [{ routeTableName: 'Spoke-RT' }],
        }],
      },
      {
        // overlaps Hub-VPC across a shared Transit Gateway
        name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.0.0.0/17'],
        transitGatewayAttachments: [{
          name: 'Prod-Att',
          transitGateway: { name: 'Main-TGW', account: 'Network' },
          routeTableAssociations: [{ routeTableName: 'Spoke-RT' }],
          routeTablePropagations: [{ routeTableName: 'Spoke-RT' }],
        }],
      },
    ],
  },
}

describe('finding node anchoring', () => {
  const findings = runValidation({ configs })
  const graph = buildNetworkGraph(configs)!
  const graphIds = new Set(graph.nodes.map((n) => n.id))

  it('produces findings across the rules under test', () => {
    expect(new Set(findings.map((f) => f.ruleId))).toEqual(new Set([
      'vpc-cidr-overlap',
      'subnet-cidr-outside-vpc',
      'subnet-cidr-overlap',
      'unknown-deployment-target',
      'unknown-tgw-route-table',
      'tgw-attachment-no-propagation',
    ]))
  })

  it('names only nodes the network graph actually contains', () => {
    const dangling = findings
      .filter((f) => f.view === 'network')
      .flatMap((f) => f.nodeIds)
      .filter((id) => !graphIds.has(id))
    expect(dangling).toEqual([])
  })

  it('anchors the VPN and Transit Gateway findings on their own nodes', () => {
    const vpn = findings.find((f) => f.ruleId === 'unknown-tgw-route-table')!
    expect(vpn.nodeIds).toContain('vpn:OnPrem-VPN')

    const share = findings.find((f) => f.ruleId === 'unknown-deployment-target')!
    expect(share.nodeIds).toEqual(['tgw:Main-TGW'])
  })
})
