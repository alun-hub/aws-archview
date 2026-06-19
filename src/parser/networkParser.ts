import type { GraphEdge, GraphModel, GraphNode, NetworkConfig, NodeKind } from './types'

// ── Subnet type classification ──────────────────────────────────────────────
function subnetKind(name: string): NodeKind {
  const n = name.toLowerCase()
  if (n.includes('firewall') || n.includes('anfw'))    return 'subnet-firewall'
  if (n.includes('tgw') || n.includes('transit'))      return 'subnet-tgw'
  if (n.includes('public') || n.includes('nat-public') || n.includes('ingress'))
    return 'subnet-public'
  return 'subnet-private'
}

export function parseNetwork(networkConfig: NetworkConfig): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const accountsSeen = new Set<string>()

  // ── Helper: ensure account group node exists ──────────────────────────────
  const ensureAccount = (account: string) => {
    if (!accountsSeen.has(account)) {
      accountsSeen.add(account)
      nodes.push({ id: `account:${account}`, kind: 'account', label: account, data: { kind: 'account' } })
    }
  }

  // ── Transit Gateways ──────────────────────────────────────────────────────
  for (const tgw of networkConfig.transitGateways ?? []) {
    ensureAccount(tgw.account)
    nodes.push({
      id: `tgw:${tgw.name}`,
      kind: 'tgw',
      label: tgw.name,
      data: { kind: 'tgw', account: tgw.account, region: tgw.region, asn: tgw.asn },
      parentId: `account:${tgw.account}`,
    })
  }

  // ── Customer Gateways + VPN connections ───────────────────────────────────
  for (const cgw of networkConfig.customerGateways ?? []) {
    ensureAccount(cgw.account)
    const cgwId = `cgw:${cgw.name}`
    nodes.push({
      id: cgwId,
      kind: 'cgw',
      label: cgw.name,
      data: { kind: 'cgw', ip: cgw.ipAddress, asn: cgw.asn },
    })

    for (const vpn of cgw.vpnConnections ?? []) {
      const vpnId = `vpn:${vpn.name}`
      nodes.push({
        id: vpnId,
        kind: 'vpn',
        label: vpn.name,
        data: { kind: 'vpn', staticRoutes: vpn.staticRoutesOnly },
      })
      // CGW → VPN → TGW
      edges.push({ id: `${cgwId}->${vpnId}`, source: cgwId, target: vpnId, kind: 'vpn' })
      const tgwId = `tgw:${vpn.transitGateway}`
      edges.push({ id: `${vpnId}->${tgwId}`, source: vpnId, target: tgwId, kind: 'vpn' })
    }
  }

  // ── VPCs + subnets + TGW attachments ──────────────────────────────────────
  for (const vpc of networkConfig.vpcs ?? []) {
    ensureAccount(vpc.account)
    const vpcId = `vpc:${vpc.name}:${vpc.account}`

    nodes.push({
      id: vpcId,
      kind: 'vpc',
      label: vpc.name,
      data: {
        kind: 'vpc',
        account: vpc.account,
        region: vpc.region,
        cidrs: vpc.cidrs,
        internetGateway: vpc.internetGateway,
      },
      parentId: `account:${vpc.account}`,
    })

    // Subnets — group by kind (public/private/firewall/tgw)
    const subnetsByKind = new Map<NodeKind, typeof vpc.subnets>()
    for (const subnet of vpc.subnets ?? []) {
      const kind = subnetKind(subnet.name)
      const existing = subnetsByKind.get(kind) ?? []
      existing.push(subnet)
      subnetsByKind.set(kind, existing)
    }

    for (const [kind, subnets] of subnetsByKind) {
      if (!subnets?.length) continue
      // Represent as a single group node per type (avoids many small nodes)
      const cidrRange = `${subnets[0].ipv4CidrBlock.replace(/\.\d+\/\d+$/, '.x/xx')}`
      const label = kind === 'subnet-firewall' ? 'Firewall Subnets'
        : kind === 'subnet-tgw'    ? 'TGW Attach Subnets'
        : kind === 'subnet-public' ? 'Public Subnets'
        : 'Private Subnets'
      const subId = `subnet:${vpc.name}:${kind}`
      nodes.push({
        id: subId,
        kind,
        label,
        data: {
          kind,
          subnets: subnets.map((s) => `${s.name} (${s.ipv4CidrBlock})`),
          azs: [...new Set(subnets.map((s) => `${s.availabilityZone}`))].join(', '),
          cidrRange,
        },
        parentId: vpcId,
      })
    }

    // TGW attachments → edges from TGW to this VPC
    for (const att of vpc.transitGatewayAttachments ?? []) {
      const tgwId = `tgw:${att.transitGateway.name}`
      const edgeId = `${tgwId}->vpc:${vpc.name}:${vpc.account}`
      if (!edges.find((e) => e.id === edgeId)) {
        edges.push({ id: edgeId, source: tgwId, target: vpcId, kind: 'tgw', label: att.name })
      }
    }
  }

  return { nodes, edges }
}
