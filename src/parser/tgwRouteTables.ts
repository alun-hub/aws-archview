import type { NetworkConfig, TgwRouteTableConfig } from './types'

/**
 * Every Transit Gateway route table in the config, with the TGW it belongs to.
 *
 * LZA nests these under `transitGateways[].routeTables`. A top-level
 * `transitGatewayRouteTables` list, which some hand-written configs use, is
 * read as well — reading only the latter meant a real LZA config showed no
 * route tables on the diagram at all.
 */
export function allTgwRouteTables(
  network: NetworkConfig | undefined,
): { tgwName: string; routeTable: TgwRouteTableConfig }[] {
  const out: { tgwName: string; routeTable: TgwRouteTableConfig }[] = []
  const seen = new Set<string>()

  for (const tgw of network?.transitGateways ?? []) {
    for (const rt of tgw.routeTables ?? []) {
      if (!rt?.name) continue
      out.push({ tgwName: tgw.name, routeTable: rt })
      seen.add(`${tgw.name}::${rt.name}`)
    }
  }

  for (const rt of network?.transitGatewayRouteTables ?? []) {
    if (!rt?.name) continue
    const tgwName = typeof rt.transitGateway === 'string' ? rt.transitGateway : rt.transitGateway?.name
    if (!tgwName) continue
    if (seen.has(`${tgwName}::${rt.name}`)) continue
    out.push({ tgwName, routeTable: rt })
  }

  return out
}

/** Attachments reachable by a static route rather than by propagation, as
 *  `"<vpcName>::<account>"` keys. A hub-and-spoke inspection design steers
 *  traffic this way, so an attachment named here is reachable even with no
 *  propagation at all. */
export function staticallyRoutedAttachments(network: NetworkConfig | undefined): Set<string> {
  const out = new Set<string>()
  for (const { routeTable } of allTgwRouteTables(network)) {
    for (const route of routeTable.routes ?? []) {
      const a = route.attachment
      if (a?.vpcName) out.add(`${a.vpcName}::${a.account ?? ""}`)
      if (a?.vpnConnectionName) out.add(`vpn:${a.vpnConnectionName}`)
    }
  }
  return out
}
