import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@xyflow/react'

// ── Padding inside containers ──────────────────────────────────────────────────
const PAD_TOP    = 60
const PAD_H      = 20
const PAD_BOTTOM = 20
const H_GAP      = 24
const V_GAP      = 20

function padTop(kind: string): number {
  // tgw-rt-group is compact — smaller label area needed
  return kind === 'tgw-rt-group' ? 42 : PAD_TOP
}



// Max children per row per parent kind
function maxCols(kind: string): number {
  switch (kind) {
    case 'root':           return 4
    case 'ou':             return 4
    case 'account':
    case 'on-premises':    return 4
    case 'vpc':            return 3
    case 'tgw-rt-group':   return 4   // all route-table nodes in one row
    default:               return 3
  }
}

// ── Box sizing (recursive, bottom-up) ─────────────────────────────────────────
interface BoxResult {
  width: number
  height: number
  childPos: Map<string, { x: number; y: number }>
}

function computeBox(
  id: string,
  byParent: Map<string, Node[]>,
  nodeMap: Map<string, Node>,
): BoxResult {
  const node = nodeMap.get(id)!
  const children = byParent.get(id) ?? []

  if (children.length === 0) {
    return {
      width:    (node.width  ?? 120) as number,
      height:   (node.height ?? 160) as number,
      childPos: new Map(),
    }
  }

  const childBoxes = children.map((c) => ({
    id: c.id,
    box: computeBox(c.id, byParent, nodeMap),
  }))

  const parentKind = (node.data as { kind?: string })?.kind ?? ''
  const cols = maxCols(parentKind)
  const PT = padTop(parentKind)
  const childPos = new Map<string, { x: number; y: number }>()

  if (parentKind === 'vpc') {
    const getSubnetTierPrefix = (name: string): string => {
      return name.replace(/[-_](?:[a-z]{2}-[a-z]+-\d)?[a-z0-9]?[a-z]$/i, '')
    }

    const getSubnetKind = (name: string): string => {
      const n = name.toLowerCase()
      if (n.includes('firewall') || n.includes('anfw')) return 'subnet-firewall'
      if (n.includes('tgw') || n.includes('transit')) return 'subnet-tgw'
      if (n.includes('public') || n.includes('nat-public') || n.includes('ingress')) return 'subnet-public'
      return 'subnet-private'
    }

    const getAzLetter = (az?: string): string => {
      const raw = (az ?? 'a').toLowerCase()
      return raw.length > 0 ? raw.slice(-1) : 'a'
    }

    const subnets = children.filter(c => c.type?.startsWith('subnet'))
    const nonSubnets = children.filter(c => !c.type?.startsWith('subnet'))

    // Sort unique AZs and Tier prefixes
    const azs = [...new Set(subnets.map(c => getAzLetter((c.data as { az?: string })?.az)))].sort()
    const TIER_ORDER = ['subnet-public', 'subnet-firewall', 'subnet-private', 'subnet-tgw']
    
    const uniquePrefixes = [...new Set(subnets.map(c => getSubnetTierPrefix((c.data as { label?: string })?.label ?? '')))]
      .sort((a, b) => {
        const kindA = getSubnetKind(a)
        const kindB = getSubnetKind(b)
        const idxA = TIER_ORDER.indexOf(kindA)
        const idxB = TIER_ORDER.indexOf(kindB)
        if (idxA !== idxB) {
          return idxA - idxB
        }
        return a.localeCompare(b)
      })

    // Calculate dynamic column widths and row heights
    const colWidths = new Array(azs.length).fill(0)
    const rowHeights = new Array(uniquePrefixes.length).fill(0)
    for (const { id: cId, box } of childBoxes) {
      const c = nodeMap.get(cId)!
      if (!c.type?.startsWith('subnet')) continue
      const label = (c.data as { label?: string })?.label ?? ''
      const azLetter = getAzLetter((c.data as { az?: string })?.az)
      const prefix = getSubnetTierPrefix(label)
      const colIdx = azs.indexOf(azLetter)
      const rowIdx = uniquePrefixes.indexOf(prefix)
      if (colIdx !== -1) colWidths[colIdx] = Math.max(colWidths[colIdx], box.width)
      if (rowIdx !== -1) rowHeights[rowIdx] = Math.max(rowHeights[rowIdx], box.height)
    }

    // Positions for non-subnet items (like IGW) at the top of VPC
    let nonSubnetMaxHeight = 0
    let nsX = PAD_H
    for (const ns of nonSubnets) {
      const box = childBoxes.find(cb => cb.id === ns.id)?.box
      const h = box ? box.height : 110
      const w = box ? box.width : 100
      childPos.set(ns.id, { x: nsX, y: PT })
      nsX += w + H_GAP
      nonSubnetMaxHeight = Math.max(nonSubnetMaxHeight, h)
    }

    // Grid start Y coordinate
    const gridStartY = PT + (nonSubnetMaxHeight > 0 ? nonSubnetMaxHeight + V_GAP : 0)

    // Assign positions to subnets in the AZ grid
    for (const { id: cId } of childBoxes) {
      const c = nodeMap.get(cId)!
      if (!c.type?.startsWith('subnet')) continue
      const label = (c.data as { label?: string })?.label ?? ''
      const azLetter = getAzLetter((c.data as { az?: string })?.az)
      const prefix = getSubnetTierPrefix(label)
      const colIdx = azs.indexOf(azLetter)
      const rowIdx = uniquePrefixes.indexOf(prefix)

      // Calculate prefix sums for column offsets and row offsets
      let xOffset = PAD_H
      for (let i = 0; i < colIdx; i++) {
        xOffset += colWidths[i] + H_GAP
      }
      let yOffset = gridStartY
      for (let i = 0; i < rowIdx; i++) {
        yOffset += rowHeights[i] + V_GAP
      }

      childPos.set(cId, { x: xOffset, y: yOffset })
    }

    // Total width is based on the column width prefix sums
    const totalGridWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length - 1) * H_GAP + PAD_H * 2
    const totalGridHeight = gridStartY + rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length - 1) * V_GAP + PAD_BOTTOM

    return {
      width: Math.max(totalGridWidth, nsX + PAD_H, 200),
      height: Math.max(totalGridHeight, 120),
      childPos,
    }
  }

  let rowX = PAD_H, rowY = PT, rowMaxH = 0, colsInRow = 0, totalW = 0

  for (const { id: cId, box } of childBoxes) {
    if (colsInRow >= cols && colsInRow > 0) {
      rowX = PAD_H; rowY += rowMaxH + V_GAP; rowMaxH = 0; colsInRow = 0
    }
    childPos.set(cId, { x: rowX, y: rowY })
    rowX    += box.width + H_GAP
    rowMaxH  = Math.max(rowMaxH, box.height)
    totalW   = Math.max(totalW, rowX - H_GAP + PAD_H)
    colsInRow++
  }

  return {
    width:    Math.max(totalW, 200),
    height:   Math.max(rowY + rowMaxH + PAD_BOTTOM, 100),
    childPos,
  }
}



const elk = new ELK()

export async function applyElkLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const byParent = new Map<string, Node[]>()
  
  for (const node of nodes) {
    if (node.parentId) {
      const arr = byParent.get(node.parentId) ?? []
      arr.push(node)
      byParent.set(node.parentId, arr)
    }
  }

  // 1. Pre-calculate size and internal layout of VPCs using original computeBox
  const vpcNodes = nodes.filter(n => (n.data as { kind?: string })?.kind === 'vpc')
  const vpcInternalLayouts = new Map<string, { width: number; height: number; childPos: Map<string, { x: number; y: number }> }>()
  
  for (const vpc of vpcNodes) {
    const box = computeBox(vpc.id, byParent, nodeMap)
    vpcInternalLayouts.set(vpc.id, box)
  }

  // 2. Separate high-level nodes (what ELK will layout) from inner VPC nodes (subnets & services inside VPCs)
  const isDescendantOfVpc = (nodeId: string): boolean => {
    let curr = nodeMap.get(nodeId)
    while (curr?.parentId) {
      const parent = nodeMap.get(curr.parentId)
      if ((parent?.data as { kind?: string })?.kind === 'vpc') return true
      curr = parent
    }
    return false
  }

  const highLevelNodes = nodes.filter(n => !isDescendantOfVpc(n.id))

  // Update high-level VPC nodes with their pre-calculated size
  const preparedHighLevelNodes = highLevelNodes.map(n => {
    const kind = (n.data as { kind?: string })?.kind
    if (kind === 'vpc') {
      const internal = vpcInternalLayouts.get(n.id)
      if (internal) {
        return { ...n, width: internal.width, height: internal.height }
      }
    }
    return n
  })

  // 3. Build ELK Hierarchical Graph
  interface ElkNode {
    id: string
    width?: number
    height?: number
    children?: ElkNode[]
    layoutOptions?: Record<string, string>
    x?: number
    y?: number
  }

  const elkNodesMap = new Map<string, ElkNode>()
  
  for (const n of preparedHighLevelNodes) {
    elkNodesMap.set(n.id, {
      id: n.id,
      width: n.width ?? 120,
      height: n.height ?? 100,
      children: [],
      layoutOptions: {
        'elk.padding': `[top=${n.parentId ? 40 : 60},left=20,bottom=20,right=20]`
      }
    })
  }

  // Build tree
  const elkRoots: ElkNode[] = []
  for (const n of preparedHighLevelNodes) {
    const elkNode = elkNodesMap.get(n.id)
    if (elkNode) {
      if (n.parentId && elkNodesMap.has(n.parentId)) {
        elkNodesMap.get(n.parentId)!.children?.push(elkNode)
      } else {
        elkRoots.push(elkNode)
      }
    }
  }

  // Map high-level edges
  const elkEdges = edges
    .filter(e => elkNodesMap.has(e.source) && elkNodesMap.has(e.target))
    .map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target]
    }))

  const elkGraph = {
    id: 'root-graph',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.spacing.nodeNode': '60',
      'elk.spacing.nodeNodeBetweenLayers': '80'
    },
    children: elkRoots,
    edges: elkEdges
  }

  // Run ELK layout
  const layoutedGraph = await elk.layout(elkGraph) as ElkNode

  // 4. Flatten layouted nodes and restore original relative child positions
  const finalPositions = new Map<string, { x: number; y: number; w: number; h: number }>()
  
  const collectPositions = (elkNode: ElkNode) => {
    if (elkNode.x !== undefined && elkNode.y !== undefined && elkNode.width !== undefined && elkNode.height !== undefined) {
      finalPositions.set(elkNode.id, { x: elkNode.x, y: elkNode.y, w: elkNode.width, h: elkNode.height })
    }
    for (const child of elkNode.children ?? []) {
      collectPositions(child)
    }
  }
  for (const child of layoutedGraph.children ?? []) {
    collectPositions(child)
  }

  // Map output
  return nodes.map(node => {
    // 1. If it's a high-level node laid out by ELK
    if (finalPositions.has(node.id)) {
      const pos = finalPositions.get(node.id)!
      return {
        ...node,
        position: { x: pos.x, y: pos.y },
        width: pos.w,
        height: pos.h,
        style: { ...node.style, width: pos.w, height: pos.h }
      }
    }

    // 2. If it's an inner node (descendant of VPC) that has a parent
    if (node.parentId) {
      const parentBox = computeBox(node.parentId, byParent, nodeMap)
      const pos       = parentBox.childPos.get(node.id)
      if (pos) {
        const childBox  = computeBox(node.id, byParent, nodeMap)
        return {
          ...node,
          position: { x: pos.x, y: pos.y },
          width: childBox.width,
          height: childBox.height,
          style: { ...node.style, width: childBox.width, height: childBox.height }
        }
      }
    }

    return node
  })
}
