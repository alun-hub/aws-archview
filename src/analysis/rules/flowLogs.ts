import { vpcNodeId } from '../../parser/nodeIds'
import type { Rule, RuleFinding } from '../types'

/**
 * A VPC with no flow logs.
 *
 * Compliance rather than correctness: the VPC deploys fine and the diagram
 * looks identical, but the traffic is invisible during an incident. It is
 * almost always an oversight rather than a decision.
 *
 * `network-config.yaml` can set `vpcFlowLogs` once at the top level for every
 * VPC, so a config using that central default must not produce one finding per
 * VPC — check the default first and stay silent when it is present.
 */
export const vpcWithoutFlowLogs: Rule = {
  id: 'vpc-without-flow-logs',
  title: 'VPC has no flow logs',
  run(ctx): RuleFinding[] {
    const network = ctx.configs.network
    if (!network) return []
    if (network.vpcFlowLogs) return []

    const findings: RuleFinding[] = []
    for (const vpc of network.vpcs ?? []) {
      if (vpc.vpcFlowLogs) continue
      findings.push({
        ruleId: 'vpc-without-flow-logs',
        severity: 'warning',
        title: 'VPC has no flow logs',
        detail: `${vpc.name} (account ${vpc.account}) sets no vpcFlowLogs, and network-config.yaml declares no default for all VPCs — its traffic will not be recorded anywhere.`,
        view: 'network',
        nodeIds: [vpcNodeId(vpc.name, vpc.account)],
        configFile: 'network-config.yaml',
      })
    }
    return findings
  },
}
