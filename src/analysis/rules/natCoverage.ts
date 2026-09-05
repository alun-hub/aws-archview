import { subnetNodeId, vpcNodeId } from '../../parser/nodeIds'
import type { RouteTableConfig, SubnetConfig, VpcConfig } from '../../parser/types'
import type { Rule, RuleFinding } from '../types'

// LZA decides what a subnet can reach from the routes in its route table, not
// from what the subnet is called. `subnetKind()` in the parser guesses a role
// from the name so the diagram can pick an icon; that guess must never drive a
// finding, because real configs name subnets whatever their owners like.

/** Route entry types that give a subnet a path off the VPC. `gatewayEndpoint`
 *  is excluded deliberately: an S3/DynamoDB endpoint is not general egress. */
const EGRESS_TYPES = new Set([
  'natGateway', 'internetGateway', 'transitGateway', 'virtualPrivateGateway',
  'networkFirewall', 'gatewayLoadBalancerEndpoint', 'networkInterface', 'localGateway',
])

const DEFAULT_ROUTES = new Set(['0.0.0.0/0', '::/0'])

const isDefaultRoute = (r: { destination?: string; ipv6Destination?: string }) =>
  DEFAULT_ROUTES.has(r.destination ?? '') || DEFAULT_ROUTES.has(r.ipv6Destination ?? '')

/** A subnet is public when its route table sends the default route straight to
 *  an internet gateway — the only definition LZA itself uses. */
const isPublic = (rt: RouteTableConfig) =>
  (rt.routes ?? []).some((r) => r.type === 'internetGateway' && isDefaultRoute(r))

const defaultEgressRoute = (rt: RouteTableConfig) =>
  (rt.routes ?? []).find((r) => isDefaultRoute(r) && EGRESS_TYPES.has(r.type ?? ''))

/** The AZ a NAT Gateway lives in, taken from the subnet it is placed in. */
function natAvailabilityZones(vpc: VpcConfig): Map<string, string | number | undefined> {
  const subnetsByName = new Map((vpc.subnets ?? []).map((s) => [s.name, s]))
  return new Map(
    (vpc.natGateways ?? []).map((n) => [n.name, subnetsByName.get(n.subnet)?.availabilityZone]),
  )
}

/** Route tables that at least one subnet uses, keyed by name. */
function routeTablesInUse(vpc: VpcConfig): Map<string, RouteTableConfig> {
  return new Map((vpc.routeTables ?? []).map((rt) => [rt.name, rt]))
}

function subnetsWithRouteTable(vpc: VpcConfig): { subnet: SubnetConfig; routeTable: RouteTableConfig }[] {
  const tables = routeTablesInUse(vpc)
  const out: { subnet: SubnetConfig; routeTable: RouteTableConfig }[] = []
  for (const subnet of vpc.subnets ?? []) {
    const rt = subnet.routeTable ? tables.get(subnet.routeTable) : undefined
    if (rt) out.push({ subnet, routeTable: rt })
  }
  return out
}

/**
 * A subnet whose route table carries no default route at all.
 *
 * Nothing in it can reach anything outside the VPC — not the internet, not
 * on-premises, not another VPC across the Transit Gateway. Sometimes that is
 * the intent (an isolated database tier); often it is a route someone forgot.
 * Either way the diagram cannot show it, because the diagram draws attachments
 * rather than routes.
 */
export const subnetWithoutDefaultRoute: Rule = {
  id: 'subnet-without-default-route',
  title: 'Subnet has no route out of the VPC',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      // Without route tables carrying routes there is no evidence either way.
      // Guessing from subnet names is what this rule exists to avoid.
      const hasRoutes = (vpc.routeTables ?? []).some((rt) => (rt.routes ?? []).length > 0)
      if (!hasRoutes) continue

      for (const { subnet, routeTable } of subnetsWithRouteTable(vpc)) {
        if (routeTable.gatewayAssociation) continue
        if ((routeTable.routes ?? []).length === 0) continue
        if (defaultEgressRoute(routeTable)) continue

        findings.push({
          ruleId: 'subnet-without-default-route',
          severity: 'info',
          title: 'Subnet has no route out of the VPC',
          detail: `${vpc.name}/${subnet.name} uses route table "${routeTable.name}", which has no default route — nothing in this subnet can reach anything outside ${vpc.name}.`,
          view: 'network',
          nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name), vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}

/**
 * A subnet whose egress goes to a NAT Gateway in another Availability Zone.
 *
 * Every byte leaving it crosses an AZ boundary, which is billed, and the subnet
 * loses internet access entirely when that other AZ has an outage — the exact
 * failure a multi-AZ layout was supposed to prevent. Determined from the route
 * table's `natGateway` target and the AZ of the subnet that NAT sits in, never
 * from subnet naming.
 */
export const natGatewayCrossesAz: Rule = {
  id: 'nat-gateway-crosses-az',
  title: 'Subnet routes to a NAT Gateway in another AZ',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      const natAzs = natAvailabilityZones(vpc)
      if (natAzs.size === 0) continue

      for (const { subnet, routeTable } of subnetsWithRouteTable(vpc)) {
        if (subnet.availabilityZone == null) continue
        const route = defaultEgressRoute(routeTable)
        if (route?.type !== 'natGateway' || !route.target) continue

        const natAz = natAzs.get(route.target)
        // An unknown target is a broken reference, which is a different rule's
        // problem; saying nothing here beats guessing at the AZ.
        if (natAz == null || natAz === subnet.availabilityZone) continue

        findings.push({
          ruleId: 'nat-gateway-crosses-az',
          severity: 'warning',
          title: 'Subnet routes to a NAT Gateway in another AZ',
          detail: `${vpc.name}/${subnet.name} is in AZ ${subnet.availabilityZone} but its default route targets NAT Gateway "${route.target}" in AZ ${natAz}. Its outbound traffic is billed as cross-AZ, and stops entirely if AZ ${natAz} fails.`,
          view: 'network',
          nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name), vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}

/**
 * A public subnet — one whose route table points the default route at an
 * internet gateway — that also auto-assigns public IPs.
 *
 * Both properties come from the config, so this is a statement about what will
 * actually be built rather than a guess from the subnet's name.
 */
export const publicSubnetAutoAssignsIps: Rule = {
  id: 'public-subnet-auto-assigns-ips',
  title: 'Public subnet auto-assigns public IPs',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      for (const { subnet, routeTable } of subnetsWithRouteTable(vpc)) {
        if (!subnet.mapPublicIpOnLaunch) continue
        if (!isPublic(routeTable)) continue

        findings.push({
          ruleId: 'public-subnet-auto-assigns-ips',
          severity: 'info',
          title: 'Public subnet auto-assigns public IPs',
          detail: `${vpc.name}/${subnet.name} routes to an internet gateway and sets mapPublicIpOnLaunch — every instance launched there gets a public IP address by default.`,
          view: 'network',
          nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name), vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}
