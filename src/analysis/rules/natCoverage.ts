import { subnetNodeId, vpcNodeId } from '../../parser/nodeIds'
import { subnetKind } from '../../parser/networkParser'
import type { Rule, RuleFinding } from '../types'

/**
 * A private subnet in an AZ with no NAT Gateway.
 *
 * Either the workloads there have no outbound internet access at all, or their
 * route table points at a NAT in a different AZ — which costs cross-AZ data
 * charges on every byte and takes the subnet offline when that other AZ does.
 * Both are worth knowing; neither is visible on the diagram.
 */
export const privateSubnetWithoutNat: Rule = {
  id: 'private-subnet-without-nat',
  title: 'Private subnet in an AZ with no NAT Gateway',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      // With no NAT Gateways declared anywhere in the VPC, egress is clearly
      // handled some other way — a central inspection VPC, or not at all.
      // Reporting every private subnet then would be one finding per subnet
      // for a single deliberate design decision.
      const nats = vpc.natGateways ?? []
      if (nats.length === 0) continue

      const subnetsByName = new Map((vpc.subnets ?? []).map((s) => [s.name, s]))
      const azsWithNat = new Set(
        nats.map((n) => subnetsByName.get(n.subnet)?.availabilityZone).filter((az): az is string => !!az),
      )

      for (const subnet of vpc.subnets ?? []) {
        // `subnetKind` already sorts public, firewall and TGW-attachment
        // subnets into their own kinds, so only workload subnets reach here.
        if (subnetKind(subnet.name) !== 'subnet-private') continue
        if (!subnet.availabilityZone || azsWithNat.has(subnet.availabilityZone)) continue

        findings.push({
          ruleId: 'private-subnet-without-nat',
          severity: 'warning',
          title: 'Private subnet in an AZ with no NAT Gateway',
          detail: `${vpc.name}/${subnet.name} is in AZ ${subnet.availabilityZone}, where ${vpc.name} has no NAT Gateway (it has one in ${[...azsWithNat].sort().join(', ')}). Its outbound traffic either fails or crosses an AZ boundary.`,
          view: 'network',
          nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name), vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}
