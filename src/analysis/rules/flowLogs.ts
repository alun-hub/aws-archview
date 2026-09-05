import { vpcNodeId } from '../../parser/nodeIds'
import type { Rule, RuleFinding } from '../types'

/**
 * A VPC with no flow logs.
 *
 * `info`, not a warning. Nothing here is broken or self-contradictory — an
 * option simply isn't switched on, and this app only sees LZA's own configs. A
 * team may well enable flow logs elsewhere: an org-wide AWS Config rule, an
 * account-factory baseline, a CloudFormation stack in customizations. Calling
 * that a warning would be confidently wrong, and on a real config it fired
 * against most VPCs at once, drowning the findings that report actual breakage.
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
    for (const vpc of ctx.vpcs) {
      if (vpc.vpcFlowLogs) continue
      findings.push({
        ruleId: 'vpc-without-flow-logs',
        severity: 'info',
        title: 'VPC has no flow logs',
        detail: `${vpc.name} (account ${vpc.account}) sets no vpcFlowLogs, and network-config.yaml declares no default for all VPCs. Its traffic will not be recorded by LZA — check whether something outside these configs covers it.`,
        view: 'network',
        nodeIds: [vpcNodeId(vpc.name, vpc.account)],
        configFile: 'network-config.yaml',
      })
    }
    return findings
  },
}
