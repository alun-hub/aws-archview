import { subnetNodeId, vpcNodeId } from '../../parser/nodeIds'
import { contains, describeRange, overlaps, parseCidr, type CidrRange } from '../cidr'
import type { Rule, RuleFinding } from '../types'

interface ParsedSubnet {
  name: string
  az: string
  cidr: CidrRange
}

/** Subnets whose CIDR parses; ones that don't (IPv6, or a malformed string)
 *  are skipped rather than reported — a range this module cannot read is not
 *  evidence that the range is wrong. */
function parsedSubnets(subnets: { name: string; availabilityZone: string; ipv4CidrBlock: string }[] = []) {
  const parsed: ParsedSubnet[] = []
  for (const s of subnets) {
    const cidr = parseCidr(s.ipv4CidrBlock)
    if (cidr) parsed.push({ name: s.name, az: s.availabilityZone, cidr })
  }
  return parsed
}

/** A subnet whose range falls outside every VPC CIDR fails at deploy time —
 *  CloudFormation rejects it — but the YAML looks perfectly plausible, so it
 *  is the kind of typo that costs a full pipeline run to discover. */
export const subnetCidrOutsideVpc: Rule = {
  id: 'subnet-cidr-outside-vpc',
  title: 'Subnet outside its VPC range',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []
    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      const vpcRanges = (vpc.cidrs ?? []).map(parseCidr).filter((c): c is CidrRange => c != null)
      if (vpcRanges.length === 0) continue

      for (const subnet of parsedSubnets(vpc.subnets)) {
        if (vpcRanges.some((r) => contains(r, subnet.cidr))) continue
        findings.push({
          ruleId: 'subnet-cidr-outside-vpc',
          severity: 'error',
          title: 'Subnet outside its VPC range',
          detail: `${vpc.name}/${subnet.name} is ${subnet.cidr.text} (${describeRange(subnet.cidr)}), which no CIDR of ${vpc.name} (${vpcRanges.map((r) => r.text).join(', ')}) contains.`,
          view: 'network',
          nodeIds: [subnetNodeId(vpc.name, vpc.account, subnet.name), vpcNodeId(vpc.name, vpc.account)],
          configFile: 'network-config.yaml',
        })
      }
    }
    return findings
  },
}

/** Two subnets in one VPC sharing addresses is likewise a deploy-time failure,
 *  and the usual cause is a copy-pasted AZ block someone forgot to renumber. */
export const subnetCidrOverlap: Rule = {
  id: 'subnet-cidr-overlap',
  title: 'Overlapping subnets in a VPC',
  run(ctx): RuleFinding[] {
    const findings: RuleFinding[] = []
    for (const vpc of ctx.configs.network?.vpcs ?? []) {
      const subnets = parsedSubnets(vpc.subnets)
      for (let i = 0; i < subnets.length; i++) {
        for (let j = i + 1; j < subnets.length; j++) {
          const a = subnets[i]
          const b = subnets[j]
          if (!overlaps(a.cidr, b.cidr)) continue
          findings.push({
            ruleId: 'subnet-cidr-overlap',
            severity: 'error',
            title: 'Overlapping subnets in a VPC',
            detail: `In ${vpc.name}, ${a.name} (${a.cidr.text}, AZ ${a.az}) overlaps ${b.name} (${b.cidr.text}, AZ ${b.az}).`,
            view: 'network',
            nodeIds: [
              subnetNodeId(vpc.name, vpc.account, a.name),
              subnetNodeId(vpc.name, vpc.account, b.name),
            ],
            configFile: 'network-config.yaml',
          })
        }
      }
    }
    return findings
  },
}
