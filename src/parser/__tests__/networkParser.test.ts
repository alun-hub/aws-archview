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

  it('should parse VPC peering connections', () => {
    const config: NetworkConfig = {
      vpcs: [
        { name: 'Dev-VPC', account: 'Dev', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] },
        { name: 'Prod-VPC', account: 'Prod', region: 'eu-west-1', cidrs: ['10.1.0.0/16'] }
      ],
      vpcPeering: [
        { name: 'DevToProd', vpcs: ['Dev-VPC', 'Prod-VPC'] }
      ]
    }

    const model = parseNetwork(config)
    const peeringEdge = model.edges.find(e => e.kind === 'peering')
    expect(peeringEdge).toBeDefined()
    expect(peeringEdge?.source).toBe('vpc:Dev-VPC:Dev')
    expect(peeringEdge?.target).toBe('vpc:Prod-VPC:Prod')
    expect(peeringEdge?.label).toBe('DevToProd')
  })

  it('should parse Route 53 resolver endpoints, forwarding rules, and VPC interface/gateway endpoints', () => {
    const config: NetworkConfig = {
      centralNetworkServices: {
        route53Resolver: {
          endpoints: [
            {
              name: 'outbound-resolver',
              type: 'OUTBOUND',
              vpc: 'Shared-VPC',
              subnets: ['Endpoints-Subnet-A'],
              allowedCidrs: ['10.0.0.0/8'],
              securityGroupNames: ['resolver-sg'],
              rules: [
                {
                  name: 'local-nested-rule',
                  ruleType: 'SYSTEM',
                  domainName: 'local.internal'
                }
              ]
            }
          ],
          rules: [
            {
              name: 'corp-rule',
              ruleType: 'FORWARD',
              domainName: 'corp.internal',
              resolverEndpoint: 'outbound-resolver',
              targetIps: [{ ip: '192.168.1.10' }]
            }
          ]
        }
      },
      vpcs: [
        {
          name: 'Shared-VPC',
          account: 'Network',
          region: 'eu-west-1',
          cidrs: ['10.0.0.0/16'],
          dnsFirewallRuleGroups: ['block-ads'],
          subnets: [
            { name: 'Endpoints-Subnet-A', availabilityZone: 'a', routeTable: 'Endpoints-RT', ipv4CidrBlock: '10.0.1.0/24' }
          ],
          interfaceEndpoints: {
            central: true,
            endpoints: [{ service: 'ssm' }, { service: 'kms' }],
            subnets: ['Endpoints-Subnet-A']
          },
          gatewayEndpoints: {
            endpoints: [{ service: 's3' }]
          }
        },
        {
          name: 'Workload-VPC',
          account: 'Workload',
          region: 'eu-west-1',
          cidrs: ['10.2.0.0/16'],
          subnets: [
            { name: 'Workload-Subnet-A', availabilityZone: 'a', routeTable: 'Workload-RT', ipv4CidrBlock: '10.2.1.0/24' }
          ],
          useCentralEndpoints: true,
          resolverRules: ['corp-rule']
        }
      ]
    }

    const model = parseNetwork(config)

    // Verify Route 53 Outbound Resolver Node
    const r53Node = model.nodes.find(n => n.kind === 'route53')
    expect(r53Node).toBeDefined()
    expect(r53Node?.label).toBe('Resolver (OUTBOUND)')
    expect(r53Node?.parentId).toBe('subnet:vpc:Shared-VPC:Network:Endpoints-Subnet-A')
    expect(r53Node?.data.name).toBe('outbound-resolver')
    expect(r53Node?.data.allowedCidrs).toEqual(['10.0.0.0/8'])
    expect(r53Node?.data.securityGroupNames).toEqual(['resolver-sg'])
    
    // Verify rules are combined (nested and matched sibling rules)
    expect(r53Node?.data.rules).toBeDefined()
    const rules = r53Node?.data.rules as Array<{ name?: string }>
    expect(rules.length).toBe(2)
    const ruleNames = rules.map(r => r.name)
    expect(ruleNames).toContain('local-nested-rule')
    expect(ruleNames).toContain('corp-rule')

    // Verify Central Interface Endpoints
    const ssmEp = model.nodes.find(n => n.id.includes('vpce') && n.label.includes('ssm'))
    expect(ssmEp).toBeDefined()
    expect(ssmEp?.parentId).toBe('subnet:vpc:Shared-VPC:Network:Endpoints-Subnet-A')
    expect(ssmEp?.label).toBe('Central VPCE (ssm)')

    // Verify Gateway Endpoints
    const s3Ep = model.nodes.find(n => n.id.includes('vpce-gw') && n.label.includes('s3'))
    expect(s3Ep).toBeDefined()
    expect(s3Ep?.parentId).toBe('subnet:vpc:Shared-VPC:Network:Endpoints-Subnet-A')
    expect(s3Ep?.label).toBe('Gateway VPCE (s3)')

    // Verify VPC metadata mappings (resolverRules, dnsFirewallRuleGroups)
    const sharedVpcNode = model.nodes.find(n => n.id === 'vpc:Shared-VPC:Network')
    expect(sharedVpcNode).toBeDefined()
    expect(sharedVpcNode?.data.dnsFirewallRuleGroups).toEqual(['block-ads'])

    const workloadVpcNode = model.nodes.find(n => n.id === 'vpc:Workload-VPC:Workload')
    expect(workloadVpcNode).toBeDefined()
    expect(workloadVpcNode?.data.resolverRules).toEqual(['corp-rule'])

    // Verify logical central sharing edge
    const shareEdge = model.edges.find(e => e.id.includes('central-vpce-sharing'))
    expect(shareEdge).toBeDefined()
    expect(shareEdge?.source).toBe('vpc:Workload-VPC:Workload')
    expect(shareEdge?.target).toBe('vpc:Shared-VPC:Network')
    expect(shareEdge?.kind).toBe('peering')
  })

  it('should parse minimal or empty network config without throwing exceptions', () => {
    const emptyConfig: NetworkConfig = {}
    const model = parseNetwork(emptyConfig)
    expect(model.nodes).toEqual([])
    expect(model.edges).toEqual([])

    const partialConfig: NetworkConfig = {
      vpcs: [
        {
          name: 'Minimal-VPC',
          account: 'Network',
          region: 'eu-west-1',
          cidrs: ['10.0.0.0/16']
        }
      ]
    }
    const partialModel = parseNetwork(partialConfig)
    expect(partialModel.nodes.length).toBe(3) // account, region, vpc
    expect(partialModel.edges.length).toBe(0)
  })

  it('should parse external rules file with Suricata rules and list entries', () => {
    const config: NetworkConfig = {
      centralNetworkServices: {
        networkFirewall: {
          firewalls: [
            { name: 'Central-FW', vpc: 'Central-VPC', subnets: ['Firewall-Subnet-A'] }
          ],
          rules: [
            {
              name: 'Group-1',
              type: 'STATEFUL',
              ruleGroup: {
                rulesSource: {
                  rulesFile: 'config/firewall-rules/rules.txt'
                }
              }
            }
          ]
        }
      },
      vpcs: [
        {
          name: 'Central-VPC',
          account: 'Network',
          region: 'eu-west-1',
          cidrs: ['10.0.0.0/16'],
          subnets: [
            { name: 'Firewall-Subnet-A', availabilityZone: 'a', routeTable: 'FW-RT', ipv4CidrBlock: '10.0.1.0/24' }
          ]
        }
      ]
    }

    const loadedFiles = {
      'my-project/config/firewall-rules/rules.txt': `
        # This is a comment
        pass tcp 10.0.0.0/8 any -> 0.0.0.0/0 80 (msg:"Allow http"; sid:1;)
        drop ip $HOME_NET any -> $EXTERNAL_NET any (msg:"Drop all"; sid:2;)
        .blocked-domain.com
        10.99.0.0/16
      `
    }

    const model = parseNetwork(config, loadedFiles)

    const fwNode = model.nodes.find(n => n.kind === 'network-firewall')
    expect(fwNode).toBeDefined()
    expect(fwNode?.data.rules).toBeDefined()

    const rules = fwNode?.data.rules as any[]
    const parsedRules = rules[0].ruleGroup.rulesSource.statefulRules
    expect(parsedRules).toBeDefined()
    expect(parsedRules.length).toBe(4) // 2 suricata rules + 2 list entries

    // Check Suricata rules
    expect(parsedRules[0].action).toBe('PASS')
    expect(parsedRules[0].header.protocol).toBe('TCP')
    expect(parsedRules[0].header.source).toBe('10.0.0.0/8')
    expect(parsedRules[0].ruleOptions[0].settings[0]).toBe('Allow http')

    expect(parsedRules[1].action).toBe('DROP')
    expect(parsedRules[1].header.protocol).toBe('IP')
    expect(parsedRules[1].ruleOptions[0].settings[0]).toBe('Drop all')

    // Check list entry fallback rules
    expect(parsedRules[2].action).toBe('LIST_ENTRY')
    expect(parsedRules[2].header.destination).toBe('.blocked-domain.com')

    expect(parsedRules[3].action).toBe('LIST_ENTRY')
    expect(parsedRules[3].header.destination).toBe('10.99.0.0/16')
  })
})

