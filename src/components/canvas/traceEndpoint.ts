import type { TraceEndpoint } from '../../analysis/pathTrace'
import type { GraphModel } from '../../parser'

const SUBNET_KINDS = new Set(['subnet', 'subnet-public', 'subnet-private', 'subnet-firewall', 'subnet-tgw'])

/** Turns a clicked graph node into a path-trace endpoint, or null when the
 *  node isn't something a trace can start or end at. A subnet's account and
 *  VPC name aren't in its own `data` — they're read off its parent VPC node,
 *  the same way the node id embeds them (see `parser/nodeIds`). */
export function traceEndpointFromNode(model: GraphModel, nodeId: string): TraceEndpoint | null {
  const node = model.nodes.find((n) => n.id === nodeId)
  if (!node) return null

  if (node.kind === 'vpc') {
    const account = node.data.account
    if (typeof account !== 'string') return null
    return { vpcName: node.label, account }
  }

  if (SUBNET_KINDS.has(node.kind) && node.parentId) {
    const vpcNode = model.nodes.find((n) => n.id === node.parentId)
    if (!vpcNode || vpcNode.kind !== 'vpc') return null
    const account = vpcNode.data.account
    if (typeof account !== 'string') return null
    return { vpcName: vpcNode.label, account, subnetName: node.label }
  }

  return null
}
