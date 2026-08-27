import { describe, it, expect } from 'vitest'
import { applyElkLayout } from '../elkLayout'
import type { Node, Edge } from '@xyflow/react'

describe('elkLayout', () => {
  it('should layout a basic hierarchical graph and return positions', async () => {
    const nodes: Node[] = [
      { id: 'root', type: 'root', data: { label: 'Root', kind: 'root' }, position: { x: 0, y: 0 } },
      { id: 'ou:workloads', type: 'ou', data: { label: 'Workloads', kind: 'ou' }, position: { x: 0, y: 0 }, parentId: 'root' },
      { id: 'account:prod', type: 'account', data: { label: 'Production', kind: 'account' }, position: { x: 0, y: 0 }, parentId: 'ou:workloads' },
      { id: 'vpc:prod-vpc', type: 'vpc', data: { label: 'ProdVPC', kind: 'vpc' }, position: { x: 0, y: 0 }, parentId: 'account:prod' },
    ]
    const edges: Edge[] = []

    const result = await applyElkLayout(nodes, edges)
    expect(result).toHaveLength(4)

    const rootNode = result.find(n => n.id === 'root')
    const ouNode = result.find(n => n.id === 'ou:workloads')
    const accountNode = result.find(n => n.id === 'account:prod')
    const vpcNode = result.find(n => n.id === 'vpc:prod-vpc')

    // 1. Verify positions have actually changed from their default of { x: 0, y: 0 }
    expect(rootNode?.position.y).not.toBe(0)
    expect(ouNode?.position.x).not.toBe(0)
    expect(rootNode?.position.x).toBeDefined()
    expect(ouNode?.position.x).toBeDefined()
    expect(accountNode?.position.x).toBeDefined()
    expect(vpcNode?.position.x).toBeDefined()
    expect(vpcNode?.position.y).not.toBe(0)

    // 2. Verify that the parent nodes are resized and have width/height greater than their children/defaults
    // VPC (leaf node): should have default size of 120x160
    expect(vpcNode?.width).toBe(120)
    expect(vpcNode?.height).toBe(160)

    // Account (parent of VPC): should be larger than VPC
    expect(accountNode?.width).toBeGreaterThan(120)
    expect(accountNode?.height).toBeGreaterThan(160)

    // OU (parent of Account): should be larger than Account
    expect(ouNode?.width).toBeGreaterThan(accountNode?.width ?? 0)
    expect(ouNode?.height).toBeGreaterThan(accountNode?.height ?? 0)

    // Root (parent of OU): should be larger than OU
    expect(rootNode?.width).toBeGreaterThan(ouNode?.width ?? 0)
    expect(rootNode?.height).toBeGreaterThan(ouNode?.height ?? 0)
  })

  it('should correctly layout inner VPC nodes like subnets and nested services', async () => {
    const nodes: Node[] = [
      { id: 'root', type: 'root', data: { label: 'Root', kind: 'root' }, position: { x: 0, y: 0 } },
      { id: 'ou:workloads', type: 'ou', data: { label: 'Workloads', kind: 'ou' }, position: { x: 0, y: 0 }, parentId: 'root' },
      { id: 'account:prod', type: 'account', data: { label: 'Production', kind: 'account' }, position: { x: 0, y: 0 }, parentId: 'ou:workloads' },
      { id: 'vpc:prod-vpc', type: 'vpc', data: { label: 'ProdVPC', kind: 'vpc' }, position: { x: 0, y: 0 }, parentId: 'account:prod' },
      { id: 'subnet:prod-public', type: 'subnet-public', data: { label: 'ProdPublicSubnet', kind: 'subnet-public', az: 'us-east-1a' }, position: { x: 0, y: 0 }, parentId: 'vpc:prod-vpc' },
      { id: 'service:web-server', type: 'service', data: { label: 'WebServer', kind: 'service' }, position: { x: 0, y: 0 }, parentId: 'subnet:prod-public' },
    ]
    const edges: Edge[] = []

    const result = await applyElkLayout(nodes, edges)
    expect(result).toHaveLength(6)

    const subnetNode = result.find(n => n.id === 'subnet:prod-public')
    const serviceNode = result.find(n => n.id === 'service:web-server')

    // Verifying subnet is correctly positioned and sized
    expect(subnetNode?.position.x).toBeGreaterThan(0)
    expect(subnetNode?.width).toBe(200) // computeBox should yield 200

    // Verifying service inside subnet is correctly positioned
    expect(serviceNode?.position.x).toBe(20) // relative position inside subnet (PAD_H)
    expect(serviceNode?.position.y).toBe(60) // relative position inside subnet (PAD_TOP)
  })

  it('should map edges from inner VPC nodes to parent VPC nodes for ELK optimization', async () => {
    const nodes: Node[] = [
      { id: 'root', type: 'root', data: { label: 'Root', kind: 'root' }, position: { x: 0, y: 0 } },
      { id: 'account:prod', type: 'account', data: { label: 'Production', kind: 'account' }, position: { x: 0, y: 0 }, parentId: 'root' },
      { id: 'vpc:prod-vpc-1', type: 'vpc', data: { label: 'ProdVPC1', kind: 'vpc' }, position: { x: 0, y: 0 }, parentId: 'account:prod' },
      { id: 'subnet:prod-public-1', type: 'subnet-public', data: { label: 'ProdPublicSubnet1', kind: 'subnet-public', az: 'us-east-1a' }, position: { x: 0, y: 0 }, parentId: 'vpc:prod-vpc-1' },
      { id: 'service:web-server', type: 'service', data: { label: 'WebServer', kind: 'service' }, position: { x: 0, y: 0 }, parentId: 'subnet:prod-public-1' },
      { id: 'vpc:prod-vpc-2', type: 'vpc', data: { label: 'ProdVPC2', kind: 'vpc' }, position: { x: 0, y: 0 }, parentId: 'account:prod' },
      { id: 'subnet:prod-public-2', type: 'subnet-public', data: { label: 'ProdPublicSubnet2', kind: 'subnet-public', az: 'us-east-1a' }, position: { x: 0, y: 0 }, parentId: 'vpc:prod-vpc-2' },
      { id: 'service:db-server', type: 'service', data: { label: 'DBServer', kind: 'service' }, position: { x: 0, y: 0 }, parentId: 'subnet:prod-public-2' },
    ]
    const edges: Edge[] = [
      { id: 'edge-1', source: 'service:web-server', target: 'service:db-server' }
    ]

    const result = await applyElkLayout(nodes, edges)
    expect(result).toHaveLength(8)

    const webServer = result.find(n => n.id === 'service:web-server')
    const dbServer = result.find(n => n.id === 'service:db-server')
    expect(webServer?.position.x).toBe(20)
    expect(dbServer?.position.x).toBe(20)
  })
})
