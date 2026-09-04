import { describe, it, expect } from 'vitest'
import { computeDepths, computeDetailLevels, defaultDetailLevel } from '../detailLevels'
import type { GraphModel, GraphNode } from '../../../parser'

const n = (id: string, kind: string, parentId?: string): GraphNode =>
  ({ id, kind, label: id, data: {}, ...(parentId ? { parentId } : {}) }) as GraphNode

/** account › region › vpc › subnet › service — the network view's hierarchy. */
function networkLikeModel(vpcCount: number, subnetsPerVpc: number): GraphModel {
  const nodes: GraphNode[] = [n('account:a', 'account'), n('region:a:eu-west-1', 'region', 'account:a')]
  for (let v = 0; v < vpcCount; v++) {
    const vpcId = `vpc:${v}`
    nodes.push(n(vpcId, 'vpc', 'region:a:eu-west-1'))
    for (let s = 0; s < subnetsPerVpc; s++) {
      const subnetId = `subnet:${v}:${s}`
      nodes.push(n(subnetId, s % 2 === 0 ? 'subnet-public' : 'subnet-private', vpcId))
      nodes.push(n(`nat:${v}:${s}`, 'nat-gateway', subnetId))
    }
  }
  return { nodes, edges: [] }
}

describe('computeDepths', () => {
  it('numbers roots 0 and each child one deeper', () => {
    const depths = computeDepths(networkLikeModel(1, 1))
    expect(depths.get('account:a')).toBe(0)
    expect(depths.get('region:a:eu-west-1')).toBe(1)
    expect(depths.get('vpc:0')).toBe(2)
    expect(depths.get('subnet:0:0')).toBe(3)
    expect(depths.get('nat:0:0')).toBe(4)
  })

  it('treats a dangling parent reference as a root instead of throwing', () => {
    const depths = computeDepths({ nodes: [n('orphan', 'vpc', 'gone')], edges: [] })
    expect(depths.get('orphan')).toBe(0)
  })

  it('terminates on a parent cycle', () => {
    const model: GraphModel = {
      nodes: [n('a', 'vpc', 'b'), n('b', 'vpc', 'a')],
      edges: [],
    }
    expect(() => computeDepths(model)).not.toThrow()
  })
})

describe('computeDetailLevels', () => {
  it('names each level after the kind that dominates it', () => {
    const levels = computeDetailLevels(networkLikeModel(3, 2))
    // Subnets are the deepest containers, so expanding them is the last step
    expect(levels.map((l) => l.label)).toEqual(['Account', 'Region', 'VPC', 'Subnet', 'All'])
  })

  it('collapses every container at or below the level', () => {
    const levels = computeDetailLevels(networkLikeModel(2, 1))
    const vpcLevel = levels.find((l) => l.label === 'VPC')!
    // VPCs are visible, so the VPCs themselves collapse to hide their subnets
    expect(vpcLevel.collapsedIds).toContain('vpc:0')
    expect(vpcLevel.collapsedIds).toContain('subnet:0:0')
    expect(vpcLevel.collapsedIds).not.toContain('region:a:eu-west-1')
    expect(vpcLevel.visibleCount).toBe(4) // account + region + 2 VPCs
  })

  it('leaves the last level fully expanded', () => {
    const levels = computeDetailLevels(networkLikeModel(2, 1))
    const all = levels[levels.length - 1]
    expect(all.label).toBe('All')
    expect(all.collapsedIds).toEqual([])
    expect(all.visibleCount).toBe(8)
  })

  it('returns no levels for a flat graph', () => {
    expect(computeDetailLevels({ nodes: [n('tgw:x', 'tgw')], edges: [] })).toEqual([])
    expect(computeDetailLevels(null)).toEqual([])
  })

  it('names a level after its containers, ignoring leaves at the same depth', () => {
    // The network view puts a TGW, the internet cloud and on-prem gear at the
    // same depth as the accounts — they must not outvote the containers.
    const model = networkLikeModel(1, 1)
    model.nodes.push(n('tgw:core', 'tgw'), n('internet', 'cloud'), n('dx:1', 'dx'), n('vpn:1', 'vpn'))
    expect(computeDetailLevels(model)[0].label).toBe('Account')
  })

  it('names a level after its top two kinds when none dominates', () => {
    const model: GraphModel = {
      nodes: [
        n('vpc:0', 'vpc'),
        n('alb', 'alb', 'vpc:0'),
        n('albTarget', 'ec2', 'alb'),
        n('nlb', 'nlb', 'vpc:0'),
        n('nlbTarget', 'ec2', 'nlb'),
      ],
      edges: [],
    }
    expect(computeDetailLevels(model)[1].label).toMatch(/ \/ /)
  })

  it('never emits two identical labels', () => {
    const labels = computeDetailLevels(networkLikeModel(3, 2)).map((l) => l.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('defaultDetailLevel', () => {
  it('leaves a graph that fits the budget fully expanded', () => {
    expect(defaultDetailLevel(computeDetailLevels(networkLikeModel(2, 2)))).toBeNull()
  })

  it('picks the deepest level that fits for a dense graph', () => {
    const levels = computeDetailLevels(networkLikeModel(20, 4))
    const level  = defaultDetailLevel(levels)!
    const chosen = levels.find((l) => l.level === level)!
    expect(chosen.visibleCount).toBeLessThanOrEqual(80)
    const deeper = levels.find((l) => l.level === level + 1)
    expect(deeper!.visibleCount).toBeGreaterThan(80)
  })

  it('falls back to the top level when even that overflows', () => {
    const levels = computeDetailLevels(networkLikeModel(1, 1))
    expect(defaultDetailLevel(levels, 0)).toBe(0)
  })
})
