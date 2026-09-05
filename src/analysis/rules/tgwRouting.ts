import { vpcNodeId, vpnNodeId } from '../../parser/nodeIds'
import type { AnalysisContext, Rule, RuleFinding } from '../types'

/** Every attachment in the config, VPC and VPN alike, since both associate and
 *  propagate against the same Transit Gateway route tables. */
interface Attachment {
  label: string
  tgw?: string
  associations: string[]
  propagations: string[]
  nodeIds: string[]
}

function attachments(ctx: AnalysisContext): Attachment[] {
  const list: Attachment[] = []

  for (const vpc of ctx.configs.network?.vpcs ?? []) {
    for (const att of vpc.transitGatewayAttachments ?? []) {
      const tgw = typeof att.transitGateway === 'string' ? att.transitGateway : att.transitGateway?.name
      list.push({
        label: `VPC ${vpc.name} attachment "${att.name}"`,
        tgw,
        associations: (att.routeTableAssociations ?? []).map((r) => r.routeTableName),
        propagations: (att.routeTablePropagations ?? []).map((r) => r.routeTableName),
        nodeIds: [vpcNodeId(vpc.name, vpc.account)],
      })
    }
  }

  for (const cgw of ctx.configs.network?.customerGateways ?? []) {
    for (const vpn of cgw.vpnConnections ?? []) {
      list.push({
        label: `VPN "${vpn.name}"`,
        tgw: vpn.transitGateway,
        associations: (vpn.routeTableAssociations ?? []).map((r) => r.routeTableName),
        propagations: (vpn.routeTablePropagations ?? []).map((r) => r.routeTableName),
        nodeIds: [vpnNodeId(vpn.name)],
      })
    }
  }

  return list
}

/** An attachment associated with a route table but propagating into none is
 *  the classic one-way Transit Gateway: it can look up routes to everyone else,
 *  and nobody can route back to it. The diagram shows the attachment either
 *  way, which is exactly why this is worth calling out in text. */
export const tgwAttachmentNoPropagation: Rule = {
  id: 'tgw-attachment-no-propagation',
  title: 'Attachment propagates to no route table',
  run(ctx): RuleFinding[] {
    const tgwDefaults = new Map(
      (ctx.configs.network?.transitGateways ?? []).map((t) => [t.name, t.defaultRouteTablePropagation]),
    )

    const findings: RuleFinding[] = []
    for (const att of attachments(ctx)) {
      if (att.propagations.length > 0) continue
      // With default propagation enabled the TGW propagates into its default
      // route table on its own, so an empty list is deliberate, not a gap.
      if (att.tgw && tgwDefaults.get(att.tgw) === 'enable') continue
      if (att.associations.length === 0) continue

      findings.push({
        ruleId: 'tgw-attachment-no-propagation',
        severity: 'warning',
        title: 'Attachment propagates to no route table',
        detail: `${att.label} associates ${att.associations.join(', ')} but propagates its routes to no route table — traffic can leave it, and nothing on ${att.tgw ?? 'the Transit Gateway'} learns how to reach it.`,
        view: 'network',
        nodeIds: att.nodeIds,
        configFile: 'network-config.yaml',
      })
    }
    return findings
  },
}

/** An association or propagation naming a route table that
 *  `transitGatewayRouteTables` never declares. LZA fails on it; the YAML looks
 *  right; and the name is usually one character off an existing table. */
export const unknownTgwRouteTable: Rule = {
  id: 'unknown-tgw-route-table',
  title: 'Unknown Transit Gateway route table',
  run(ctx): RuleFinding[] {
    const declared = ctx.configs.network?.transitGatewayRouteTables
    // No route tables declared at all means the file simply doesn't use them —
    // reporting every reference would be noise.
    if (!declared || declared.length === 0) return []
    const known = new Set(declared.map((rt) => rt.name))

    const findings: RuleFinding[] = []
    for (const att of attachments(ctx)) {
      const refs = [
        ...att.associations.map((name) => ({ name, kind: 'associates with' })),
        ...att.propagations.map((name) => ({ name, kind: 'propagates into' })),
      ]
      for (const ref of refs) {
        if (known.has(ref.name)) continue
        findings.push({
          ruleId: 'unknown-tgw-route-table',
          severity: 'error',
          title: 'Unknown Transit Gateway route table',
          detail: `${att.label} ${ref.kind} "${ref.name}", which transitGatewayRouteTables does not declare. Declared: ${[...known].join(', ')}.`,
          view: 'network',
          // Only the attachment gets a node: the route table being reported
          // is precisely the one that doesn't exist, so it has none.
          nodeIds: att.nodeIds,
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}
