import type { GraphEdge, GraphModel, GraphNode, NetworkConfig, NodeKind } from './types'

// ── Subnet type classification ─────────────────────────────────────────────────
function subnetKind(name: string): NodeKind {
  const n = name.toLowerCase()
  if (n.includes('firewall') || n.includes('anfw'))                       return 'subnet-firewall'
  if (n.includes('tgw') || n.includes('transit'))                         return 'subnet-tgw'
  if (n.includes('public') || n.includes('nat-public') || n.includes('ingress')) return 'subnet-public'
  return 'subnet-private'
}

export function parseNetwork(networkConfig: NetworkConfig): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[]  = []
  const accountsSeen = new Set<string>()

  const ensureAccount = (account: string) => {
    if (!accountsSeen.has(account)) {
      accountsSeen.add(account)
      nodes.push({ id: `account:${account}`, kind: 'account', label: account, data: { kind: 'account' } })
    }
  }

  // ── Pre-compute RT associations: (tgwName, accountName) → Set<rtName> ──────
  const rtByTgwAccount = new Map<string, Set<string>>()
  for (const vpc of networkConfig.vpcs ?? []) {
    for (const att of vpc.transitGatewayAttachments ?? []) {
      const key = `${att.transitGateway.name}::${vpc.account}`
      const set = rtByTgwAccount.get(key) ?? new Set()
      for (const rt of att.routeTableAssociations ?? []) set.add(rt.routeTableName)
      rtByTgwAccount.set(key, set)
    }
  }
  // VPN route table associations: keyed by vpnName
  const rtByVpn = new Map<string, Set<string>>()
  for (const cgw of networkConfig.customerGateways ?? []) {
    for (const vpn of cgw.vpnConnections ?? []) {
      const set = new Set<string>()
      for (const rt of vpn.routeTableAssociations ?? []) set.add(rt.routeTableName)
      rtByVpn.set(vpn.name, set)
    }
  }

  // ── Transit Gateways (root-level hub nodes) ───────────────────────────────
  for (const tgw of networkConfig.transitGateways ?? []) {
    ensureAccount(tgw.account)
    nodes.push({
      id:   `tgw:${tgw.name}`,
      kind: 'tgw',
      label: tgw.name,
      data: { kind: 'tgw', account: tgw.account, region: tgw.region, asn: tgw.asn, sublabel: tgw.account },
    })
  }

  // ── Pre-compute RT → associations & propagations from VPC attachments ────
  const rtAssociations   = new Map<string, string[]>()  // rtName → [vpcName]
  const rtPropagations   = new Map<string, string[]>()  // rtName → [vpcName]
  for (const vpc of networkConfig.vpcs ?? []) {
    for (const att of vpc.transitGatewayAttachments ?? []) {
      for (const r of att.routeTableAssociations ?? []) {
        const arr = rtAssociations.get(r.routeTableName) ?? []
        arr.push(vpc.name)
        rtAssociations.set(r.routeTableName, arr)
      }
      for (const r of att.routeTablePropagations ?? []) {
        const arr = rtPropagations.get(r.routeTableName) ?? []
        arr.push(vpc.name)
        rtPropagations.set(r.routeTableName, arr)
      }
    }
  }
  // VPN associations
  for (const cgw of networkConfig.customerGateways ?? []) {
    for (const vpn of cgw.vpnConnections ?? []) {
      for (const r of vpn.routeTableAssociations ?? []) {
        const arr = rtAssociations.get(r.routeTableName) ?? []
        arr.push(vpn.name)
        rtAssociations.set(r.routeTableName, arr)
      }
      for (const r of vpn.routeTablePropagations ?? []) {
        const arr = rtPropagations.get(r.routeTableName) ?? []
        arr.push(vpn.name)
        rtPropagations.set(r.routeTableName, arr)
      }
    }
  }

  // ── TGW Route Tables (grouped in a container, placed in Zone B left of TGW) ─
  const rtGroupsByTgw = new Map<string, string[]>()
  for (const rt of networkConfig.transitGatewayRouteTables ?? []) {
    const tgwName = rt.transitGateway.name
    const arr = rtGroupsByTgw.get(tgwName) ?? []
    arr.push(rt.name)
    rtGroupsByTgw.set(tgwName, arr)
  }
  for (const [tgwName, rtNames] of rtGroupsByTgw) {
    const groupId = `tgw-rt-group:${tgwName}`
    nodes.push({
      id:    groupId,
      kind:  'tgw-rt-group',
      label: 'Route Tables',
      data:  { kind: 'tgw-rt-group', tgw: tgwName, routeTables: rtNames },
    })
    for (const rtName of rtNames) {
      nodes.push({
        id:       `tgw-rt:${rtName}`,
        kind:     'tgw-rt',
        label:    rtName,
        data: {
          kind:         'tgw-rt',
          tgw:          tgwName,
          associations: rtAssociations.get(rtName)  ?? [],
          propagatesFrom: rtPropagations.get(rtName) ?? [],
        },
        parentId: groupId,
      })
    }
  }

  // Create an Internet node if any VPC has an IGW
  const hasIgw = (networkConfig.vpcs ?? []).some(vpc => vpc.internetGateway)
  if (hasIgw) {
    nodes.push({
      id: 'internet',
      kind: 'cloud',
      label: 'Internet',
      data: { kind: 'cloud' }
    })
  }

  // ── Customer Gateways + VPN connections ───────────────────────────────────
  const gateways = networkConfig.customerGateways ?? []
  if (gateways.length > 0) {
    nodes.push({ id: 'on-premises', kind: 'on-premises', label: 'On-Premises', data: { kind: 'on-premises' } })

    for (const cgw of gateways) {
      const cgwId = `cgw:${cgw.name}`

      // VPN first → placed LEFT of CGW so VPN→TGW edge exits left without crossing CGW
      for (const vpn of cgw.vpnConnections ?? []) {
        const vpnId  = `vpn:${vpn.name}`
        const rtSet  = rtByVpn.get(vpn.name) ?? new Set()
        const rtLabel = rtSet.size > 0 ? [...rtSet].join(', ') : undefined
        const tunnels = vpn.tunnelSpecifications?.map(t => t.tunnelInsideCidr) ?? []
        nodes.push({
          id:       vpnId,
          kind:     'vpn',
          label:    vpn.name,
          data:     {
            kind: 'vpn',
            staticRoutes: vpn.staticRoutesOnly,
            tunnels: tunnels.length > 0 ? tunnels : undefined,
          },
          parentId: 'on-premises',
        })
        const tgwId = `tgw:${vpn.transitGateway}`
        edges.push({ id: `${vpnId}->${tgwId}`, source: vpnId, target: tgwId, kind: 'vpn', label: rtLabel })
        edges.push({ id: `${cgwId}->${vpnId}`, source: cgwId, target: vpnId, kind: 'vpn' })

        // VPN Route Table Propagations to TGW Route Tables
        for (const prop of vpn.routeTablePropagations ?? []) {
          edges.push({
            id: `prop:vpn:${vpn.name}->tgw-rt:${prop.routeTableName}`,
            source: vpnId,
            target: `tgw-rt:${prop.routeTableName}`,
            kind: 'propagation',
            label: 'Propagates',
          })
        }
      }

      nodes.push({
        id:       cgwId,
        kind:     'cgw',
        label:    cgw.name,
        data:     { kind: 'cgw', ip: cgw.ipAddress, asn: cgw.asn },
        parentId: 'on-premises',
      })
    }
  }

  // ── VPCs + IGW + subnets + TGW attachments ────────────────────────────────
  for (const vpc of networkConfig.vpcs ?? []) {
    ensureAccount(vpc.account)
    
    const regionId = `region:${vpc.account}:${vpc.region}`
    let regionNode = nodes.find(n => n.id === regionId)
    if (!regionNode) {
      regionNode = {
        id: regionId,
        kind: 'region',
        label: vpc.region,
        data: {
          kind: 'region',
          region: vpc.region,
          account: vpc.account,
          vpcs: []
        },
        parentId: `account:${vpc.account}`,
      }
      nodes.push(regionNode)
    }
    const regionVpcs = regionNode.data.vpcs as string[]
    if (!regionVpcs.includes(vpc.name)) {
      regionVpcs.push(vpc.name)
    }

    const vpcId = `vpc:${vpc.name}:${vpc.account}`

    nodes.push({
      id:   vpcId,
      kind: 'vpc',
      label: vpc.name,
      data: { kind: 'vpc', account: vpc.account, region: vpc.region, cidrs: vpc.cidrs, internetGateway: vpc.internetGateway },
      parentId: regionId,
    })

    // ① Internet Gateway — add first so it appears leftmost in VPC
    if (vpc.internetGateway) {
      const igwId = `igw:${vpc.name}`
      nodes.push({
        id:       igwId,
        kind:     'igw',
        label:    'Internet Gateway',
        data:     { kind: 'igw' },
        parentId: vpcId,
      })
      // Edge from IGW to Internet cloud node
      edges.push({
        id: `${igwId}->internet`,
        source: igwId,
        target: 'internet',
        kind: 'flow',
        label: 'Public Routing',
      })
    }

    // Process explicit sub-resources
    const explicitNats = new Set(vpc.natGateways?.map(n => n.subnet) ?? [])
    const explicitAlbs = new Set<string>()
    for (const alb of vpc.loadBalancers?.applicationLoadBalancers ?? []) {
      for (const sub of alb.subnets ?? []) explicitAlbs.add(sub)
    }
    const explicitNlbs = new Set<string>()
    for (const nlb of vpc.loadBalancers?.networkLoadBalancers ?? []) {
      for (const sub of nlb.subnets ?? []) explicitNlbs.add(sub)
    }
    
    // Central network firewalls in this VPC
    const explicitFws = new Set<string>()
    const firewalls = networkConfig.centralNetworkServices?.networkFirewall?.firewalls ?? []
    for (const fw of firewalls) {
      if (fw.vpc === vpc.name) {
        for (const sub of fw.subnets ?? []) explicitFws.add(sub)
      }
    }

    // ② Subnets — output each subnet individually
    for (const subnet of vpc.subnets ?? []) {
      const kind = subnetKind(subnet.name)
      const subnetNodeId = `subnet:${vpcId}:${subnet.name}`
      nodes.push({
        id: subnetNodeId,
        kind,
        label: subnet.name,
        data: {
          kind,
          cidr: subnet.ipv4CidrBlock,
          az: subnet.availabilityZone,
          routeTable: subnet.routeTable,
          sublabel: subnet.ipv4CidrBlock,
        },
        parentId: vpcId,
      })

      // Determine if a leaf node should be placed inside this subnet
      const hasNat = explicitNats.has(subnet.name) || (vpc.natGateways === undefined && subnet.name.toLowerCase().includes('nat'))
      const hasAlb = explicitAlbs.has(subnet.name) || (vpc.loadBalancers === undefined && subnet.name.toLowerCase().includes('alb'))
      const hasNlb = explicitNlbs.has(subnet.name) || (vpc.loadBalancers === undefined && subnet.name.toLowerCase().includes('nlb'))
      const hasFw  = explicitFws.has(subnet.name) || (networkConfig.centralNetworkServices === undefined && (subnet.name.toLowerCase().includes('firewall') || subnet.name.toLowerCase().includes('anfw')))

      if (hasNat) {
        nodes.push({
          id: `natgw:${vpcId}:${subnet.name}`,
          kind: 'nat-gateway',
          label: 'NAT Gateway',
          data: { kind: 'nat-gateway' },
          parentId: subnetNodeId,
        })
      }

      if (hasFw) {
        nodes.push({
          id: `fw:${vpcId}:${subnet.name}`,
          kind: 'network-firewall',
          label: 'Network Firewall',
          data: { kind: 'network-firewall' },
          parentId: subnetNodeId,
        })
      }

      if (hasNlb) {
        nodes.push({
          id: `nlb:${vpcId}:${subnet.name}`,
          kind: 'nlb',
          label: 'NLB',
          data: { kind: 'nlb' },
          parentId: subnetNodeId,
        })
      }

      if (hasAlb) {
        nodes.push({
          id: `alb:${vpcId}:${subnet.name}`,
          kind: 'alb',
          label: 'ALB',
          data: { kind: 'alb' },
          parentId: subnetNodeId,
        })
      }
    }

    // ③ TGW attachment edges with route table label
    for (const att of vpc.transitGatewayAttachments ?? []) {
      const tgwCfg = networkConfig.transitGateways?.find((t) => t.name === att.transitGateway.name)
      const tgwId  = `tgw:${att.transitGateway.name}`
      const isHub  = tgwCfg?.account === vpc.account
      const edgeId = `${tgwId}->account:${vpc.account}`

      if (!edges.find((e) => e.id === edgeId)) {
        const rtSet   = rtByTgwAccount.get(`${att.transitGateway.name}::${vpc.account}`) ?? new Set()
        const rtLabel = rtSet.size > 0 ? [...rtSet].join(', ') : undefined
        edges.push({
          id:     edgeId,
          source: tgwId,
          target: `account:${vpc.account}`,
          kind:   isHub ? 'tgw-hub' : 'tgw',
          label:  rtLabel,
        })
      }

      // VPC Route Table Propagations to TGW Route Tables
      for (const prop of att.routeTablePropagations ?? []) {
        edges.push({
          id: `prop:${vpcId}->tgw-rt:${prop.routeTableName}`,
          source: vpcId,
          target: `tgw-rt:${prop.routeTableName}`,
          kind: 'propagation',
          label: 'Propagates',
        })
      }
    }
  }

  return { nodes, edges }
}
