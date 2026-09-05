import { subnetNodeId, vpcNodeId } from '../../parser/nodeIds'
import type { Rule, RuleFinding } from '../types'

/**
 * A subnet pointing at a route table its VPC never declares.
 *
 * The reference is a *value*, not a key, so `unknown-key` cannot see it and the
 * YAML reads perfectly. LZA fails on it, and the usual cause is a route table
 * renamed in one place and not the other.
 *
 * A VPC with no `routeTables` block at all is skipped rather than reported:
 * plenty of configs leave routing to defaults, and flagging every subnet in
 * them would be noise.
 */
export const unknownSubnetRouteTable: Rule = {
  id: 'unknown-subnet-route-table',
  title: 'Subnet references an undeclared route table',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      const declared = vpc.routeTables
      if (!declared || declared.length === 0) continue
      const known = new Set(declared.map((rt) => rt.name))

      for (const subnet of vpc.subnets ?? []) {
        if (!subnet.routeTable || known.has(subnet.routeTable)) continue
        findings.push({
          ruleId: 'unknown-subnet-route-table',
          severity: 'error',
          title: 'Subnet references an undeclared route table',
          detail: `${vpc.name}/${subnet.name} uses route table "${subnet.routeTable}", which ${vpc.name} does not declare. Declared: ${[...known].join(', ')}.`,
          view: 'network',
          nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name), vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}

/** A declared route table no subnet ever uses. Harmless to deploy, but it is
 *  usually the other half of a rename that only got applied on one side. */
export const unusedVpcRouteTable: Rule = {
  id: 'unused-vpc-route-table',
  title: 'Route table is never used',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      const declared = vpc.routeTables ?? []
      if (declared.length === 0) continue
      const used = new Set((vpc.subnets ?? []).map((s) => s.routeTable).filter(Boolean))

      for (const rt of declared) {
        if (used.has(rt.name)) continue
        // A gateway-associated table attaches to an IGW or VGW rather than to
        // subnets, so having no subnet reference it is exactly right.
        if (rt.gatewayAssociation) continue
        findings.push({
          ruleId: 'unused-vpc-route-table',
          severity: 'info',
          title: 'Route table is never used',
          detail: `${vpc.name} declares route table "${rt.name}", which no subnet references.`,
          view: 'network',
          nodeIds: [vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}
