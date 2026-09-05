import type { GraphEdge, GraphModel, GraphNode, NetworkConfig, NodeKind, Route53ResolverRuleConfig, StatefulRule } from './types'
import { findFileContent } from './fileResolve'
import {
  accountNodeId, cgwNodeId, dxNodeId, regionNodeId, subnetNodeId,
  tgwNodeId, tgwRouteTableNodeId, vpcNodeId, vpnNodeId,
} from './nodeIds'
import { routeTableNames } from './routeTableRefs'
import { allTgwRouteTables } from './tgwRouteTables'
import { resolveVpcs } from './vpcTemplates'
import type { AccountIndex } from './accountResolver'

// ── Subnet type classification ─────────────────────────────────────────────────
// A guess from the subnet's name, used only to pick a diagram icon. LZA has no
// notion of a "public" or "private" subnet — that follows from the subnet's
// route table — so this must not drive validation. The analysis rules read
// `routeTables` instead; see `analysis/rules/natCoverage.ts`.
function subnetKind(name: string): NodeKind {
  const n = name.toLowerCase()
  if (n.includes('firewall') || n.includes('anfw'))                       return 'subnet-firewall'
  if (n.includes('tgw') || n.includes('transit'))                         return 'subnet-tgw'
  if (n.includes('public') || n.includes('nat-public') || n.includes('ingress')) return 'subnet-public'
  return 'subnet-private'
}


function parseSuricataRules(fileContent: string): StatefulRule[] {
  const rules: StatefulRule[] = []
  const lines = fileContent.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue
    }

    const parenIndex = trimmed.indexOf('(')
    let headerPart = trimmed
    let optionsPart = ''

    if (parenIndex !== -1 && trimmed.endsWith(')')) {
      headerPart = trimmed.substring(0, parenIndex).trim()
      optionsPart = trimmed.substring(parenIndex + 1, trimmed.length - 1).trim()
    }

    const tokens = headerPart.split(/\s+/)
    if (tokens.length === 7 && /^(pass|drop|alert|reject|log|nodrop)$/i.test(tokens[0])) {
      const [rawAction, rawProtocol, source, sourcePort, direction, destination, destinationPort] = tokens
      const action = rawAction.toUpperCase()
      const protocol = rawProtocol.toUpperCase()

      const ruleOptions: { keyword: string; settings?: string[] }[] = []
      if (optionsPart) {
        const rawOptions = optionsPart.split(';').map(o => o.trim()).filter(Boolean)
        for (const opt of rawOptions) {
          const colonIdx = opt.indexOf(':')
          if (colonIdx !== -1) {
            const keyword = opt.substring(0, colonIdx).trim()
            let val = opt.substring(colonIdx + 1).trim()
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1)
            }
            ruleOptions.push({ keyword, settings: [val] })
          } else {
            ruleOptions.push({ keyword: opt })
          }
        }
      }

      rules.push({
        action,
        header: {
          protocol,
          source,
          sourcePort,
          direction,
          destination,
          destinationPort,
        },
        ...(ruleOptions.length > 0 ? { ruleOptions } : {})
      })
    } else {
      // Plain list entry (e.g. domain list or IP list)
      rules.push({
        action: 'LIST_ENTRY',
        header: {
          protocol: 'ANY',
          source: 'ANY',
          sourcePort: 'ANY',
          direction: 'FORWARD',
          destination: trimmed,
          destinationPort: 'ANY',
        },
        ruleOptions: [{ keyword: 'msg', settings: [`List item: ${trimmed}`] }]
      })
    }
  }

  return rules
}

export function parseNetwork(
  networkConfig: NetworkConfig,
  loadedFiles?: Record<string, string>,
  /** Resolves `vpcTemplates` deployment targets to real accounts. Without it
   *  templates still render, labelled by their target instead. */
  accounts?: AccountIndex,
): GraphModel {
  // `vpcTemplates` deploy a VPC into every target account, so everything below
  // works from the resolved list rather than `networkConfig.vpcs`.
  const resolvedVpcs = resolveVpcs(networkConfig, accounts)
  const vpcList = resolvedVpcs.map((r) => r.vpc)
  const templateNameByVpc = new Map(
    resolvedVpcs.filter((r) => r.templateName).map((r) => [`${r.vpc.name}:${r.vpc.account}`, r]),
  )
  const nodes: GraphNode[] = []
  const edges: GraphEdge[]  = []
  const accountsSeen = new Set<string>()
  const subnetNodeIds = new Set<string>()

  const ensureAccount = (account: string) => {
    if (!accountsSeen.has(account)) {
      accountsSeen.add(account)
      nodes.push({ id: accountNodeId(account), kind: 'account', label: account, data: { kind: 'account' } })
    }
  }

  // ── Pre-compute Route 53 resolver rules matching ──
  const rulesByEndpointName = new Map<string, Route53ResolverRuleConfig[]>()
  for (const r of networkConfig.centralNetworkServices?.route53Resolver?.rules ?? []) {
    const endpointName = r.resolverEndpoint ?? r.outboundEndpointTarget ?? r.inboundEndpointTarget ?? 'default'
    const arr = rulesByEndpointName.get(endpointName) ?? []
    arr.push(r)
    rulesByEndpointName.set(endpointName, arr)
  }

  // ── Pre-compute RT associations: (tgwName, accountName) → Set<rtName> ──────
  const rtByTgwAccount = new Map<string, Set<string>>()
  for (const vpc of vpcList) {
    for (const att of vpc.transitGatewayAttachments ?? []) {
      const tgwName = typeof att.transitGateway === 'string' ? att.transitGateway : att.transitGateway?.name
      const key = `${tgwName}::${vpc.account}`
      const set = rtByTgwAccount.get(key) ?? new Set()
      for (const name of routeTableNames(att.routeTableAssociations)) set.add(name)
      rtByTgwAccount.set(key, set)
    }
  }
  // VPN route table associations: keyed by vpnName
  const rtByVpn = new Map<string, Set<string>>()
  for (const cgw of networkConfig.customerGateways ?? []) {
    for (const vpn of cgw.vpnConnections ?? []) {
      const set = new Set<string>()
      for (const name of routeTableNames(vpn.routeTableAssociations)) set.add(name)
      rtByVpn.set(vpn.name, set)
    }
  }

  // ── Transit Gateways (root-level hub nodes) ───────────────────────────────
  for (const tgw of networkConfig.transitGateways ?? []) {
    ensureAccount(tgw.account)
    nodes.push({
      id:   tgwNodeId(tgw.name),
      kind: 'tgw',
      label: tgw.name,
      data: { kind: 'tgw', account: tgw.account, region: tgw.region, asn: tgw.asn, sublabel: tgw.account },
    })
  }

  // ── Pre-compute RT → associations & propagations from VPC attachments ────
  const rtAssociations   = new Map<string, string[]>()  // rtName → [vpcName]
  const rtPropagations   = new Map<string, string[]>()  // rtName → [vpcName]
  for (const vpc of vpcList) {
    for (const att of vpc.transitGatewayAttachments ?? []) {
      for (const name of routeTableNames(att.routeTableAssociations)) {
        const arr = rtAssociations.get(name) ?? []
        arr.push(vpc.name)
        rtAssociations.set(name, arr)
      }
      for (const name of routeTableNames(att.routeTablePropagations)) {
        const arr = rtPropagations.get(name) ?? []
        arr.push(vpc.name)
        rtPropagations.set(name, arr)
      }
    }
  }
  // VPN associations
  for (const cgw of networkConfig.customerGateways ?? []) {
    for (const vpn of cgw.vpnConnections ?? []) {
      for (const name of routeTableNames(vpn.routeTableAssociations)) {
        const arr = rtAssociations.get(name) ?? []
        arr.push(vpn.name)
        rtAssociations.set(name, arr)
      }
      for (const name of routeTableNames(vpn.routeTablePropagations)) {
        const arr = rtPropagations.get(name) ?? []
        arr.push(vpn.name)
        rtPropagations.set(name, arr)
      }
    }
  }

  // ── TGW Route Tables (grouped in a container, placed in Zone B left of TGW) ─
  const rtGroupsByTgw = new Map<string, string[]>()
  for (const { tgwName, routeTable } of allTgwRouteTables(networkConfig)) {
    const arr = rtGroupsByTgw.get(tgwName) ?? []
    arr.push(routeTable.name)
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
        id:       tgwRouteTableNodeId(rtName),
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
  const hasIgw = vpcList.some(vpc => vpc.internetGateway)
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
      const cgwId = cgwNodeId(cgw.name)

      // VPN first → placed LEFT of CGW so VPN→TGW edge exits left without crossing CGW
      for (const vpn of cgw.vpnConnections ?? []) {
        const vpnId  = vpnNodeId(vpn.name)
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
        const tgwId = tgwNodeId(vpn.transitGateway)
        edges.push({ id: `${vpnId}->${tgwId}`, source: vpnId, target: tgwId, kind: 'vpn', label: rtLabel })
        edges.push({ id: `${cgwId}->${vpnId}`, source: cgwId, target: vpnId, kind: 'vpn' })

        // VPN Route Table Propagations to TGW Route Tables
        for (const rtName of routeTableNames(vpn.routeTablePropagations)) {
          edges.push({
            id: `prop:vpn:${vpn.name}->tgw-rt:${rtName}`,
            source: vpnId,
            target: tgwRouteTableNodeId(rtName),
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

  // ── Direct Connect Gateways ────────────────────────────────────────────────
  const dxGateways = networkConfig.directConnectGateways ?? []
  if (dxGateways.length > 0 && !nodes.some((n) => n.id === 'on-premises')) {
    nodes.push({ id: 'on-premises', kind: 'on-premises', label: 'On-Premises', data: { kind: 'on-premises' } })
  }
  for (const dxgw of dxGateways) {
    const dxId = dxNodeId(dxgw.name)
    nodes.push({
      id:       dxId,
      kind:     'dx',
      label:    dxgw.name,
      data: {
        kind: 'dx',
        asn: dxgw.asn,
        virtualInterfaces: dxgw.virtualInterfaces,
      },
      parentId: 'on-premises',
    })
    for (const assoc of dxgw.transitGatewayAssociations ?? []) {
      const tgwId = tgwNodeId(assoc.name)
      edges.push({
        id:     `${dxId}->${tgwId}`,
        source: dxId,
        target: tgwId,
        kind:   'dx',
        label:  assoc.allowedPrefixes && assoc.allowedPrefixes.length > 0 ? assoc.allowedPrefixes.join(', ') : undefined,
      })
    }
  }

  const vpcNameToId = new Map<string, string>()

  // ── VPCs + IGW + subnets + TGW attachments ────────────────────────────────
  for (const vpc of vpcList) {
    ensureAccount(vpc.account)
    
    const regionId = regionNodeId(vpc.account, vpc.region)
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
        parentId: accountNodeId(vpc.account),
      }
      nodes.push(regionNode)
    }
    const regionVpcs = regionNode.data.vpcs as string[]
    if (!regionVpcs.includes(vpc.name)) {
      regionVpcs.push(vpc.name)
    }

    const vpcId = vpcNodeId(vpc.name, vpc.account)
    // vpcPeering entries reference VPCs by name only (no account), matching
    // LZA's own config schema, so a duplicate name across accounts is
    // inherently ambiguous. Keep the first match instead of silently letting
    // the last one win, and surface the ambiguity instead of staying silent.
    if (vpcNameToId.has(vpc.name)) {
      console.warn(`aws-archview: duplicate VPC name "${vpc.name}" (account ${vpc.account}) — vpcPeering entries referencing this name will resolve to the first VPC seen with that name.`)
    } else {
      vpcNameToId.set(vpc.name, vpcId)
    }

    nodes.push({
      id:   vpcId,
      kind: 'vpc',
      label: vpc.name,
      data: {
        kind: 'vpc',
        account: vpc.account,
        region: vpc.region,
        cidrs: vpc.cidrs,
        internetGateway: vpc.internetGateway,
        resolverRules: vpc.resolverRules,
        dnsFirewallRuleGroups: vpc.dnsFirewallRuleGroups,
        // Three accounts showing the same VPC name is confusing without
        // saying why — this is one template deployed into each of them.
        ...(() => {
          const from = templateNameByVpc.get(`${vpc.name}:${vpc.account}`)
          if (!from) return {}
          return {
            fromVpcTemplate: from.templateName,
            ...(from.unresolvedTarget === 'no-account-config'
              ? { templateTargetNote: 'Load accounts-config.yaml and organization-config.yaml to resolve the target accounts' }
              : from.unresolvedTarget === 'no-matching-accounts'
                ? { templateTargetNote: 'No accounts are in this target yet — one VPC is created per account added to it' }
                : {}),
          }
        })(),
      },
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
      const subId = subnetNodeId(vpc.name, vpc.account, subnet.name)
      subnetNodeIds.add(subId)
      nodes.push({
        id: subId,
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
          parentId: subId,
        })
      }

      if (hasFw) {
        const rawRules = networkConfig.centralNetworkServices?.networkFirewall?.rules ?? []
        const rules = rawRules.map((group) => {
          const clonedGroup = {
            ...group,
            ruleGroup: group.ruleGroup
              ? {
                  ...group.ruleGroup,
                  rulesSource: {
                    ...group.ruleGroup.rulesSource,
                    statefulRules: group.ruleGroup.rulesSource.statefulRules
                      ? [...group.ruleGroup.rulesSource.statefulRules]
                      : undefined,
                  },
                }
              : undefined,
          }

          if (clonedGroup.ruleGroup?.rulesSource.rulesFile && loadedFiles) {
            const fileContent = findFileContent(clonedGroup.ruleGroup.rulesSource.rulesFile, loadedFiles)
            if (fileContent) {
              const parsedRules = parseSuricataRules(fileContent)
              clonedGroup.ruleGroup.rulesSource.statefulRules = [
                ...(clonedGroup.ruleGroup.rulesSource.statefulRules ?? []),
                ...parsedRules,
              ]
            }
          }
          return clonedGroup
        })

        nodes.push({
          id: `fw:${vpcId}:${subnet.name}`,
          kind: 'network-firewall',
          label: 'Network Firewall',
          data: { kind: 'network-firewall', rules },
          parentId: subId,
        })
      }

      if (hasNlb) {
        nodes.push({
          id: `nlb:${vpcId}:${subnet.name}`,
          kind: 'nlb',
          label: 'NLB',
          data: { kind: 'nlb' },
          parentId: subId,
        })
      }

      if (hasAlb) {
        nodes.push({
          id: `alb:${vpcId}:${subnet.name}`,
          kind: 'alb',
          label: 'ALB',
          data: { kind: 'alb' },
          parentId: subId,
        })
      }
    }

    // Parser Interface Endpoints inside subnets
    const ieConfig = vpc.interfaceEndpoints
    if (ieConfig) {
      const targetSubnets = ieConfig.subnets ?? vpc.subnets?.map(s => s.name) ?? []
      for (const ep of ieConfig.endpoints ?? []) {
        for (const subName of targetSubnets) {
          const subNodeId = subnetNodeId(vpc.name, vpc.account, subName)
          if (subnetNodeIds.has(subNodeId)) {
            nodes.push({
              id: `vpce:${vpcId}:${ep.service}:${subName}`,
              kind: 'service',
              label: `${ieConfig.central ? 'Central ' : ''}VPCE (${ep.service})`,
              data: { service: ep.service, central: ieConfig.central, kind: 'service' },
              parentId: subNodeId
            })
          }
        }
      }
    }

    // Parser Gateway Endpoints inside subnets
    const geConfig = vpc.gatewayEndpoints
    if (geConfig && vpc.subnets && vpc.subnets.length > 0) {
      const firstSubName = vpc.subnets[0].name
      const subNodeId = subnetNodeId(vpc.name, vpc.account, firstSubName)
      for (const ep of geConfig.endpoints ?? []) {
        nodes.push({
          id: `vpce-gw:${vpcId}:${ep.service}:${firstSubName}`,
          kind: 'service',
          label: `Gateway VPCE (${ep.service})`,
          data: { service: ep.service, gateway: true, kind: 'service' },
          parentId: subNodeId
        })
      }
    }

    // ③ TGW attachment edges with route table label
    for (const att of vpc.transitGatewayAttachments ?? []) {
      const tgwName = typeof att.transitGateway === 'string' ? att.transitGateway : att.transitGateway?.name
      if (!tgwName) continue
      const tgwCfg = networkConfig.transitGateways?.find((t) => t.name === tgwName)
      const tgwId  = tgwNodeId(tgwName)
      const isHub  = tgwCfg?.account === vpc.account
      const edgeId = `${tgwId}->${vpcId}`

      if (!edges.find((e) => e.id === edgeId)) {
        const rtSet   = rtByTgwAccount.get(`${tgwName}::${vpc.account}`) ?? new Set()
        const rtLabel = rtSet.size > 0 ? [...rtSet].join(', ') : undefined
        edges.push({
          id:     edgeId,
          source: tgwId,
          target: vpcId,
          kind:   isHub ? 'tgw-hub' : 'tgw',
          label:  rtLabel,
        })
      }

      // VPC Route Table Propagations to TGW Route Tables
      for (const rtName of routeTableNames(att.routeTablePropagations)) {
        edges.push({
          id: `prop:${vpcId}->tgw-rt:${rtName}`,
          source: vpcId,
          target: tgwRouteTableNodeId(rtName),
          kind: 'propagation',
          label: 'Propagates',
        })
      }
    }
  }

  // Create Route 53 Resolvers
  const r53Resolver = networkConfig.centralNetworkServices?.route53Resolver
  if (r53Resolver && r53Resolver.endpoints) {
    for (const endpoint of r53Resolver.endpoints) {
      // Find endpoint host VPC
      const targetVpc = vpcList.find(v => v.name === endpoint.vpc)
      if (targetVpc) {
        const combinedRules = [
          ...(endpoint.rules ?? []),
          ...(rulesByEndpointName.get(endpoint.name) ?? [])
        ]
        for (const subName of endpoint.subnets ?? []) {
          const subNodeId = subnetNodeId(targetVpc.name, targetVpc.account, subName)
          if (subnetNodeIds.has(subNodeId)) {
            nodes.push({
              id: `route53:resolver:${endpoint.name}:${subName}`,
              kind: 'route53',
              label: `Resolver (${endpoint.type})`,
              data: {
                kind: 'route53',
                name: endpoint.name,
                type: endpoint.type,
                allowedCidrs: endpoint.allowedCidrs,
                securityGroupNames: endpoint.securityGroupNames,
                rules: combinedRules
              },
              parentId: subNodeId
            })
          }
        }
      }
    }
  }

  // Central VPCE logical edges
  const centralVpc = vpcList.find(v => v.interfaceEndpoints?.central)
  if (centralVpc) {
    const centralVpcId = vpcNodeId(centralVpc.name, centralVpc.account)
    for (const otherVpc of vpcList) {
      if (otherVpc.useCentralEndpoints && otherVpc.name !== centralVpc.name) {
        const spokeVpcId = vpcNodeId(otherVpc.name, otherVpc.account)
        edges.push({
          id: `central-vpce-sharing:${spokeVpcId}->${centralVpcId}`,
          source: spokeVpcId,
          target: centralVpcId,
          kind: 'peering',
          label: 'Uses Central VPCE'
        })
      }
    }
  }

  // ── VPC Peering Connections ────────────────────────────────────────────────
  for (const peering of networkConfig.vpcPeering ?? []) {
    if (peering.vpcs.length !== 2) continue
    const sourceId = vpcNameToId.get(peering.vpcs[0])
    const targetId = vpcNameToId.get(peering.vpcs[1])
    if (sourceId && targetId) {
      edges.push({
        id: `peering:${peering.name}`,
        source: sourceId,
        target: targetId,
        kind: 'peering',
        label: peering.name,
      })
    }
  }

  return { nodes, edges }
}
