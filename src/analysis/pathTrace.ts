import { subnetNodeId, tgwNodeId, tgwRouteTableNodeId, vpcNodeId } from '../parser/nodeIds'
import { routeTableNames } from '../parser/routeTableRefs'
import { allTgwRouteTables, staticallyRoutedAttachments } from '../parser/tgwRouteTables'
import type { NetworkConfig, RouteTableConfig, RouteTableEntryConfig, SubnetConfig, VpcConfig } from '../parser/types'
import { overlaps, parseCidr, type CidrRange } from './cidr'

export interface TraceEndpoint {
  vpcName: string
  account: string
  /** Omitted when the user picked a VPC rather than one of its subnets — the
   *  trace then falls back to the VPC's first subnet and says so, since a
   *  route table is a per-subnet thing in AWS and there is no VPC-level route. */
  subnetName?: string
}

export type TraceHopStatus = 'ok' | 'broken' | 'caveat'

export interface TraceHop {
  status: TraceHopStatus
  /** Nodes this hop highlights on the canvas, in `parser/nodeIds` form. */
  nodeIds: string[]
  title: string
  detail: string
}

export interface TraceResult {
  /** False when the trace could not even start (endpoint not found). */
  ok: boolean
  hops: TraceHop[]
  /** Whether every hop from source to destination succeeded. */
  forwardReachable: boolean
  /** Whether the destination's own routing sends traffic back the way it
   *  came — LZA configs frequently get this only half right. */
  returnReachable: boolean
  summary: string
}

function findVpc(vpcs: VpcConfig[], name: string, account: string): VpcConfig | undefined {
  return vpcs.find((v) => v.name === name && v.account === account)
}

function destinationCidrs(vpc: VpcConfig): CidrRange[] {
  return (vpc.cidrs ?? []).map(parseCidr).filter((c): c is CidrRange => c !== null)
}

/** The subnet whose route table the trace should read. Falls back to the
 *  VPC's first subnet when none was picked, since routing is per-subnet. */
function resolveSubnet(vpc: VpcConfig, subnetName?: string): { subnet?: SubnetConfig; assumed: boolean } {
  if (subnetName) return { subnet: vpc.subnets?.find((s) => s.name === subnetName), assumed: false }
  return { subnet: vpc.subnets?.[0], assumed: true }
}

function routeTableFor(vpc: VpcConfig, subnet?: SubnetConfig): RouteTableConfig | undefined {
  if (!subnet?.routeTable) return undefined
  return vpc.routeTables?.find((rt) => rt.name === subnet.routeTable)
}

/** Whether a route's destination plausibly carries traffic toward `target` —
 *  an overlap, not containment, since a route can legitimately be broader
 *  than the one VPC it is being asked about (a TGW default route, say). When
 *  the route or the target CIDR does not parse (IPAM allocation, `::/0`,
 *  0.0.0.0/0 read as a real range), the route is kept as a candidate rather
 *  than silently dropped — an unverifiable route is a caveat, not a dead end. */
function routeCovers(route: RouteTableEntryConfig, target: CidrRange[]): 'match' | 'unverifiable' | 'no' {
  const routeCidr = parseCidr(route.destination)
  if (!routeCidr) return route.destination ? 'no' : 'unverifiable'
  if (target.length === 0) return 'unverifiable'
  return target.some((t) => overlaps(routeCidr, t)) ? 'match' : 'no'
}

function pickRoute(rt: RouteTableConfig | undefined, target: CidrRange[]): RouteTableEntryConfig | undefined {
  if (!rt?.routes) return undefined
  // Longest-prefix-first, matching how AWS itself picks among overlapping
  // routes — a /24 route to the TGW should win over a /0 default that also
  // technically covers the destination.
  const candidates = rt.routes
    .map((r) => ({ route: r, verdict: routeCovers(r, target) }))
    .filter((c) => c.verdict !== 'no')
  if (candidates.length === 0) return undefined
  candidates.sort((a, b) => (parseCidr(b.route.destination)?.prefix ?? -1) - (parseCidr(a.route.destination)?.prefix ?? -1))
  return candidates[0].route
}

function tgwAttachmentFor(vpc: VpcConfig, tgwName: string) {
  return vpc.transitGatewayAttachments?.find((a) => {
    const name = typeof a.transitGateway === 'string' ? a.transitGateway : a.transitGateway?.name
    return name === tgwName
  })
}

/**
 * Traces whether traffic from `source` can reach `destination` by walking the
 * same chain LZA itself resolves at deploy time: a subnet's route table, the
 * Transit Gateway route table its attachment associates with, and whether
 * that TGW route table actually carries the destination — by propagation or
 * by a static route, since a hub-and-spoke inspection design uses the latter
 * with no propagation at all. VPC peering is checked the same way, directly.
 *
 * This only reasons from the config, not from a live account — it answers
 * "does this config say the traffic can flow", not "is a security group also
 * blocking it".
 */
export function tracePath(
  network: NetworkConfig | undefined,
  vpcs: VpcConfig[],
  source: TraceEndpoint,
  destination: TraceEndpoint,
): TraceResult {
  const hops: TraceHop[] = []
  const srcVpc = findVpc(vpcs, source.vpcName, source.account)
  const dstVpc = findVpc(vpcs, destination.vpcName, destination.account)

  if (!srcVpc || !dstVpc) {
    return {
      ok: false,
      hops: [],
      forwardReachable: false,
      returnReachable: false,
      summary: !srcVpc
        ? `Could not find VPC "${source.vpcName}" in account ${source.account}.`
        : `Could not find VPC "${destination.vpcName}" in account ${destination.account}.`,
    }
  }

  const srcVpcId = vpcNodeId(srcVpc.name, srcVpc.account)
  const dstVpcId = vpcNodeId(dstVpc.name, dstVpc.account)

  if (srcVpc.name === dstVpc.name && srcVpc.account === dstVpc.account) {
    return {
      ok: true,
      hops: [{
        status: 'ok',
        nodeIds: [srcVpcId],
        title: 'Same VPC',
        detail: `${srcVpc.name} routes traffic between its own subnets locally — no Transit Gateway or peering hop is involved.`,
      }],
      forwardReachable: true,
      returnReachable: true,
      summary: `${source.vpcName} and ${destination.vpcName} are the same VPC.`,
    }
  }

  const { subnet: srcSubnet, assumed: srcAssumed } = resolveSubnet(srcVpc, source.subnetName)
  if (!srcSubnet) {
    return {
      ok: false,
      hops: [],
      forwardReachable: false,
      returnReachable: false,
      summary: `${srcVpc.name} declares no subnets to trace from.`,
    }
  }

  const srcRt = routeTableFor(srcVpc, srcSubnet)
  const dstCidrs = destinationCidrs(dstVpc)
  const srcSubnetId = subnetNodeId(srcVpc.name, srcVpc.account, srcSubnet.name)

  hops.push({
    status: 'ok',
    nodeIds: [srcSubnetId, srcVpcId],
    title: `Source: ${srcVpc.name}/${srcSubnet.name}`,
    detail: srcAssumed
      ? `No source subnet was picked, so the first subnet (${srcSubnet.name}) was used — routing is per-subnet, so a different subnet in this VPC may resolve differently.`
      : `Tracing from ${srcVpc.name}/${srcSubnet.name}, route table "${srcSubnet.routeTable ?? 'none'}".`,
  })

  if (!srcRt) {
    hops.push({
      status: 'broken',
      nodeIds: [srcSubnetId],
      title: 'No route table',
      detail: `${srcSubnet.name} references route table "${srcSubnet.routeTable ?? '(none)'}", which ${srcVpc.name} does not declare — routing beyond this subnet cannot be resolved.`,
    })
    return { ok: true, hops, forwardReachable: false, returnReachable: false, summary: `Broken at ${srcVpc.name}/${srcSubnet.name}: no usable route table.` }
  }

  const route = pickRoute(srcRt, dstCidrs)
  if (!route) {
    hops.push({
      status: 'broken',
      nodeIds: [srcSubnetId],
      title: 'No matching route',
      detail: dstCidrs.length === 0
        ? `${dstVpc.name} declares no CIDR to match against (likely IPAM-allocated), so no route in "${srcRt.name}" could be confirmed as covering it.`
        : `Route table "${srcRt.name}" has no route covering ${dstCidrs.map((c) => c.text).join(', ')}.`,
      })
    return { ok: true, hops, forwardReachable: false, returnReachable: false, summary: `Broken at ${srcVpc.name}: ${srcRt.name} has no route toward ${dstVpc.name}.` }
  }

  const verdict = routeCovers(route, dstCidrs)
  const routeHop: TraceHop = {
    status: verdict === 'unverifiable' ? 'caveat' : 'ok',
    nodeIds: [srcVpcId],
    title: `Route table: ${srcRt.name}`,
    detail: verdict === 'unverifiable'
      ? `Route "${route.destination ?? '?'}" → ${route.type ?? route.target ?? '?'} could not be verified against a CIDR and is assumed to apply.`
      : `${route.destination} → ${route.type ?? 'target'} ${route.target ?? ''}`.trim(),
  }
  hops.push(routeHop)

  const type = route.type
  if (type === 'transitGateway') {
    const tgwName = route.target
    if (!tgwName) {
      hops.push({ status: 'broken', nodeIds: [srcVpcId], title: 'No Transit Gateway named', detail: `The route names no target Transit Gateway.` })
      return finish(hops, false, false, `Broken at ${srcVpc.name}: transitGateway route has no target.`)
    }
    const srcAttachment = tgwAttachmentFor(srcVpc, tgwName)
    if (!srcAttachment) {
      hops.push({ status: 'broken', nodeIds: [srcVpcId, tgwNodeId(tgwName)], title: `${srcVpc.name} is not attached to ${tgwName}`, detail: `The route points at ${tgwName}, but ${srcVpc.name} has no transitGatewayAttachments entry for it.` })
      return finish(hops, false, false, `Broken at ${srcVpc.name}: no attachment to ${tgwName}.`)
    }
    const assocRts = routeTableNames(srcAttachment.routeTableAssociations)
    hops.push({
      status: assocRts.length > 0 ? 'ok' : 'broken',
      nodeIds: [tgwNodeId(tgwName)],
      title: `Attached to ${tgwName}`,
      detail: assocRts.length > 0
        ? `Associated with TGW route table${assocRts.length > 1 ? 's' : ''}: ${assocRts.join(', ')}.`
        : `${srcAttachment.name} declares no routeTableAssociations — the attachment exists but is not on any TGW route table, so it cannot forward anywhere.`,
    })
    if (assocRts.length === 0) return finish(hops, false, false, `Broken at ${srcVpc.name}: attachment ${srcAttachment.name} is on no TGW route table.`)

    const dstAttachment = tgwAttachmentFor(dstVpc, tgwName)
    const staticAttachments = staticallyRoutedAttachments(network)
    const dstKey = `${dstVpc.name}::${dstVpc.account}`
    const dstPropagations = dstAttachment ? new Set(routeTableNames(dstAttachment.routeTablePropagations)) : new Set<string>()

    let reachedVia: { rt: string; via: 'propagation' | 'static' } | undefined
    for (const rt of assocRts) {
      if (dstPropagations.has(rt)) { reachedVia = { rt, via: 'propagation' }; break }
    }
    if (!reachedVia) {
      for (const { tgwName: t, routeTable } of allTgwRouteTables(network)) {
        if (t !== tgwName || !assocRts.includes(routeTable.name)) continue
        if (staticAttachments.has(dstKey) && routeTable.routes?.some((r) => r.attachment?.vpcName === dstVpc.name && r.attachment?.account === dstVpc.account)) {
          reachedVia = { rt: routeTable.name, via: 'static' }
          break
        }
      }
    }

    if (!reachedVia) {
      hops.push({
        status: 'broken',
        nodeIds: assocRts.map(tgwRouteTableNodeId),
        title: 'No route to destination',
        detail: dstAttachment
          ? `None of ${assocRts.join(', ')} propagate from ${dstVpc.name}'s attachment (${[...dstPropagations].join(', ') || 'no propagations declared'}), and no static route on them targets it.`
          : `${dstVpc.name} has no Transit Gateway attachment to ${tgwName} at all.`,
      })
      return finish(hops, false, false, `Broken at ${tgwName}: no route table reaches ${dstVpc.name}.`)
    }

    hops.push({
      status: 'ok',
      nodeIds: [tgwRouteTableNodeId(reachedVia.rt)],
      title: `TGW route table: ${reachedVia.rt}`,
      detail: reachedVia.via === 'propagation'
        ? `${dstVpc.name}'s attachment propagates into ${reachedVia.rt}, so this route table already carries its CIDR.`
        : `${reachedVia.rt} carries a static route pointing directly at ${dstVpc.name}'s attachment.`,
    })
    hops.push({ status: 'ok', nodeIds: [dstVpcId], title: `Destination: ${dstVpc.name}`, detail: `Reachable via ${tgwName}.` })

    const returnOk = checkReturnPath(dstVpc, srcVpc, destination.subnetName, hops, tgwName)
    return finish(hops, true, returnOk, returnOk
      ? `${source.vpcName} can reach ${destination.vpcName} via ${tgwName}, and the return path is also configured.`
      : `${source.vpcName} can reach ${destination.vpcName} via ${tgwName}, but the return path back is not — traffic can only flow one way.`)
  }

  if (type === 'vpcPeering') {
    const peeringName = route.target
    const peering = network?.vpcPeering?.find((p) => p.name === peeringName)
    const connectsBoth = peering?.vpcs.includes(srcVpc.name) && peering.vpcs.includes(dstVpc.name)
    hops.push({
      status: connectsBoth ? 'ok' : 'broken',
      nodeIds: [dstVpcId],
      title: peeringName ? `VPC peering: ${peeringName}` : 'VPC peering',
      detail: !peering
        ? `The route names peering connection "${peeringName}", which network-config.yaml does not declare.`
        : !connectsBoth
          ? `Peering "${peeringName}" connects ${peering.vpcs.join(' and ')}, not ${srcVpc.name} and ${dstVpc.name}.`
          : `${peeringName} connects ${srcVpc.name} directly to ${dstVpc.name}.`,
    })
    if (!connectsBoth) return finish(hops, false, false, `Broken: peering "${peeringName ?? '?'}" does not connect these two VPCs.`)

    const returnOk = checkReturnPath(dstVpc, srcVpc, destination.subnetName, hops, undefined, peeringName)
    return finish(hops, true, returnOk, returnOk
      ? `${source.vpcName} can reach ${destination.vpcName} via VPC peering, and the return path is also configured.`
      : `${source.vpcName} can reach ${destination.vpcName} via VPC peering, but the return path back is not configured.`)
  }

  hops.push({
    status: 'broken',
    nodeIds: [srcVpcId],
    title: `Route leads to ${type ?? 'an unmodelled target'}, not toward ${dstVpc.name}`,
    detail: `A route of type "${type ?? 'unknown'}" does not lead toward another VPC, so the trace cannot continue from here (VPN and Direct Connect hops are reported as reaching the edge of what this config can confirm, not traced onto the on-premises network).`,
  })
  return finish(hops, false, false, `Broken at ${srcVpc.name}: route type "${type ?? 'unknown'}" does not lead toward ${dstVpc.name}.`)
}

function checkReturnPath(
  fromVpc: VpcConfig,
  toVpc: VpcConfig,
  subnetName: string | undefined,
  hops: TraceHop[],
  tgwName?: string,
  peeringName?: string,
): boolean {
  const { subnet, assumed } = resolveSubnet(fromVpc, subnetName)
  const rt = routeTableFor(fromVpc, subnet)
  const toCidrs = destinationCidrs(toVpc)
  const returnRoute = pickRoute(rt, toCidrs)
  const matchesHop = returnRoute && (
    (tgwName && returnRoute.type === 'transitGateway' && returnRoute.target === tgwName) ||
    (peeringName && returnRoute.type === 'vpcPeering' && returnRoute.target === peeringName)
  )

  hops.push({
    status: matchesHop ? 'ok' : 'broken',
    nodeIds: [vpcNodeId(fromVpc.name, fromVpc.account)],
    title: `Return path from ${fromVpc.name}`,
    detail: !rt
      ? `${fromVpc.name}/${subnet?.name ?? '?'}${assumed ? ' (assumed subnet)' : ''} has no resolvable route table, so no return route could be found.`
      : matchesHop
        ? `${rt.name} routes back toward ${toVpc.name} the same way traffic arrived.`
        : `${rt.name} has no route back to ${toVpc.name} over the same path — traffic reaching ${fromVpc.name} would have no way to reply.`,
  })
  return Boolean(matchesHop)
}

function finish(hops: TraceHop[], forwardReachable: boolean, returnReachable: boolean, summary: string): TraceResult {
  return { ok: true, hops, forwardReachable, returnReachable, summary }
}
