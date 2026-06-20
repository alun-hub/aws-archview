import { describe, it, expect } from 'vitest'
import { parseNetwork } from '../networkParser'
import type { NetworkConfig } from '../types'

describe('networkParser', () => {
  it('should parse individual subnets instead of grouping them', () => {
    const config: NetworkConfig = {
      vpcs: [{
        name: 'Dev-VPC',
        account: 'Dev',
        region: 'eu-west-1',
        cidrs: ['10.0.0.0/22'],
        subnets: [
          { name: 'App-Private-Subnet-A', availabilityZone: 'a', routeTable: 'App-RT', ipv4CidrBlock: '10.0.0.0/24' },
          { name: 'Public-Subnet-B', availabilityZone: 'b', routeTable: 'Public-RT', ipv4CidrBlock: '10.0.1.0/24' },
          { name: 'Firewall-Subnet-A', availabilityZone: 'a', routeTable: 'Firewall-RT', ipv4CidrBlock: '10.0.2.0/24' },
          { name: 'NAT-Public-Subnet-A', availabilityZone: 'a', routeTable: 'NAT-RT', ipv4CidrBlock: '10.0.3.0/24' }
        ]
      }]
    }

    const model = parseNetwork(config)

    const regionNode = model.nodes.find(n => n.kind === 'region')
    expect(regionNode).toBeDefined()
    expect(regionNode?.id).toBe('region:Dev:eu-west-1')
    expect(regionNode?.parentId).toBe('account:Dev')

    const vpcNode = model.nodes.find(n => n.kind === 'vpc')
    expect(vpcNode?.parentId).toBe('region:Dev:eu-west-1')
    
    const subnets = model.nodes.filter(n => n.parentId === 'vpc:Dev-VPC:Dev')
    expect(subnets.length).toBe(4)
    
    const subA = subnets.find(s => s.label === 'App-Private-Subnet-A')
    expect(subA).toBeDefined()
    expect(subA?.id).toBe('subnet:vpc:Dev-VPC:Dev:App-Private-Subnet-A')
    expect(subA?.kind).toBe('subnet-private')
    expect(subA?.data.cidr).toBe('10.0.0.0/24')
    expect(subA?.data.sublabel).toBe('10.0.0.0/24')
    expect(subA?.data.az).toBe('a')

    const subB = subnets.find(s => s.label === 'Public-Subnet-B')
    expect(subB?.id).toBe('subnet:vpc:Dev-VPC:Dev:Public-Subnet-B')
    expect(subB?.kind).toBe('subnet-public')
    expect(subB?.data.cidr).toBe('10.0.1.0/24')
    expect(subB?.data.sublabel).toBe('10.0.1.0/24')
    expect(subB?.data.az).toBe('b')

    const subF = subnets.find(s => s.label === 'Firewall-Subnet-A')
    expect(subF?.id).toBe('subnet:vpc:Dev-VPC:Dev:Firewall-Subnet-A')
    expect(subF?.kind).toBe('subnet-firewall')
    expect(subF?.data.cidr).toBe('10.0.2.0/24')
    expect(subF?.data.sublabel).toBe('10.0.2.0/24')
    expect(subF?.data.az).toBe('a')

    const firewallGw = model.nodes.find(n => n.parentId === subF?.id)
    expect(firewallGw).toBeDefined()
    expect(firewallGw?.kind).toBe('network-firewall')
    expect(firewallGw?.label).toBe('Network Firewall')

    const natSub = subnets.find(s => s.label === 'NAT-Public-Subnet-A')
    expect(natSub?.id).toBe('subnet:vpc:Dev-VPC:Dev:NAT-Public-Subnet-A')
    expect(natSub?.kind).toBe('subnet-public')
    expect(natSub?.data.cidr).toBe('10.0.3.0/24')
    expect(natSub?.data.az).toBe('a')

    const natGw = model.nodes.find(n => n.parentId === natSub?.id)
    expect(natGw).toBeDefined()
    expect(natGw?.kind).toBe('nat-gateway')
    expect(natGw?.label).toBe('NAT Gateway')
  })

  it('should parse explicit LZA natGateways, loadBalancers, firewalls and routing propagations', () => {
    const config: NetworkConfig = {
      transitGateways: [
        { name: 'Core-TGW', account: 'Network', region: 'eu-west-1', asn: 64512 }
      ],
      transitGatewayRouteTables: [
        { name: 'Core-RT', transitGateway: { name: 'Core-TGW', account: 'Network' } }
      ],
      customerGateways: [
        {
          name: 'Office-GW',
          account: 'Network',
          region: 'eu-west-1',
          ipAddress: '1.2.3.4',
          asn: 65000,
          vpnConnections: [
            {
              name: 'VPN-HQ',
              transitGateway: 'Core-TGW',
              routeTablePropagations: [{ routeTableName: 'Core-RT' }],
              tunnelSpecifications: [{ tunnelInsideCidr: '169.254.1.0/30' }]
            }
          ]
        }
      ],
      centralNetworkServices: {
        networkFirewall: {
          firewalls: [
            { name: 'Central-FW', vpc: 'Prod-VPC', subnets: ['FW-Subnet-A'] }
          ]
        }
      },
      vpcs: [
        {
          name: 'Prod-VPC',
          account: 'Prod',
          region: 'eu-west-1',
          cidrs: ['10.0.0.0/16'],
          internetGateway: true,
          subnets: [
            { name: 'FW-Subnet-A', availabilityZone: 'a', routeTable: 'FW-RT', ipv4CidrBlock: '10.0.1.0/24' },
            { name: 'App-Subnet-A', availabilityZone: 'a', routeTable: 'App-RT', ipv4CidrBlock: '10.0.2.0/24' },
            { name: 'Public-Subnet-B', availabilityZone: 'b', routeTable: 'Public-RT', ipv4CidrBlock: '10.0.3.0/24' }
          ],
          natGateways: [
            { name: 'Nat-A', subnet: 'Public-Subnet-B' }
          ],
          loadBalancers: {
            applicationLoadBalancers: [
              { name: 'Prod-ALB', subnets: ['Public-Subnet-B'] }
            ]
          },
          transitGatewayAttachments: [
            {
              name: 'Prod-VPC-Attach',
              transitGateway: { name: 'Core-TGW', account: 'Network' },
              routeTablePropagations: [{ routeTableName: 'Core-RT' }]
            }
          ]
        }
      ]
    }

    const model = parseNetwork(config)

    // 1. Internet node and IGW edge
    const internetNode = model.nodes.find(n => n.id === 'internet')
    expect(internetNode).toBeDefined()
    expect(internetNode?.kind).toBe('cloud')
    expect(internetNode?.label).toBe('Internet')

    const igwEdge = model.edges.find(e => e.source === 'igw:Prod-VPC')
    expect(igwEdge).toBeDefined()
    expect(igwEdge?.target).toBe('internet')
    expect(igwEdge?.kind).toBe('flow')

    // 2. Explicit NAT placement
    const pubSubnet = model.nodes.find(n => n.label === 'Public-Subnet-B')
    expect(pubSubnet).toBeDefined()
    const natGw = model.nodes.find(n => n.parentId === pubSubnet?.id && n.kind === 'nat-gateway')
    expect(natGw).toBeDefined()

    // 3. Explicit ALB placement
    const albNode = model.nodes.find(n => n.parentId === pubSubnet?.id && n.kind === 'alb')
    expect(albNode).toBeDefined()

    // 4. Explicit Firewall placement
    const fwSubnet = model.nodes.find(n => n.label === 'FW-Subnet-A')
    expect(fwSubnet).toBeDefined()
    const fwNode = model.nodes.find(n => n.parentId === fwSubnet?.id && n.kind === 'network-firewall')
    expect(fwNode).toBeDefined()

    // 5. VPN tunnel data
    const vpnNode = model.nodes.find(n => n.id === 'vpn:VPN-HQ')
    expect(vpnNode).toBeDefined()
    expect(vpnNode?.data.tunnels).toEqual(['169.254.1.0/30'])

    // 6. Region node metadata
    const regionNode = model.nodes.find(n => n.id === 'region:Prod:eu-west-1')
    expect(regionNode).toBeDefined()
    expect(regionNode?.data.vpcs).toEqual(['Prod-VPC'])
    expect(regionNode?.data.account).toBe('Prod')

    // 7. Propagation edges
    // From VPC to TGW Route Table
    const vpcPropEdge = model.edges.find(e => e.source === 'vpc:Prod-VPC:Prod' && e.target === 'tgw-rt:Core-RT')
    expect(vpcPropEdge).toBeDefined()
    expect(vpcPropEdge?.kind).toBe('propagation')

    // From VPN to TGW Route Table
    const vpnPropEdge = model.edges.find(e => e.source === 'vpn:VPN-HQ' && e.target === 'tgw-rt:Core-RT')
    expect(vpnPropEdge).toBeDefined()
    expect(vpnPropEdge?.kind).toBe('propagation')
  })
})
