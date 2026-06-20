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
})
