import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@xyflow/react'
import type { Segment } from './edgeRouting'

export interface LayoutResult {
  nodes: Node[]
  edgeSegments: Map<string, Segment[]>
}

interface ElkNode {
  id: string
  width?: number
  height?: number
  children?: ElkNode[]
  layoutOptions?: Record<string, string>
  x?: number
  y?: number
  edges?: any[]
}

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
  boxCache?: Map<string, BoxResult>,
): BoxResult {
  if (boxCache?.has(id)) return boxCache.get(id)!
  
  if (!nodeMap.has(id)) {
    const fallback = {
      width: 120,
      height: 160,
      childPos: new Map(),
    }
    boxCache?.set(id, fallback)
    return fallback
  }

  const result = computeBoxInternal(id, byParent, nodeMap, boxCache)
  boxCache?.set(id, result)
  return result
}

function computeBoxInternal(
  id: string,
  byParent: Map<string, Node[]>,
  nodeMap: Map<string, Node>,
  boxCache?: Map<string, BoxResult>,
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
    box: computeBox(c.id, byParent, nodeMap, boxCache),
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

function getLCA(id1: string, id2: string, nodeMap: Map<string, Node>): string | null {
  const path1: string[] = []
  let curr: string | undefined = id1
  while (curr) {
    path1.push(curr)
    curr = nodeMap.get(curr)?.parentId
  }

  curr = id2
  while (curr) {
    if (path1.includes(curr)) {
      return curr
    }
    curr = nodeMap.get(curr)?.parentId
  }
  return null
}

export async function applyElkLayout(nodes: Node[], edges: Edge[]): Promise<LayoutResult> {
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
  const boxCache = new Map<string, BoxResult>()
  const vpcNodes = nodes.filter(n => (n.data as { kind?: string })?.kind === 'vpc')
  const vpcInternalLayouts = new Map<string, { width: number; height: number; childPos: Map<string, { x: number; y: number }> }>()
  
  for (const vpc of vpcNodes) {
    const box = computeBox(vpc.id, byParent, nodeMap, boxCache)
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
  const elkNodesMap = new Map<string, ElkNode>()
  
  const isNetworkView = nodes.some(x => (x.data as { kind?: string })?.kind === 'vpc' || (x.data as { kind?: string })?.kind === 'tgw')

  for (const n of preparedHighLevelNodes) {
    const kind = (n.data as { kind?: string })?.kind
    const layoutOpts: Record<string, string> = {
      'elk.padding': `[top=${n.parentId ? 40 : 60},left=20,bottom=20,right=20]`
    }

    // In Organization/IAM/Security/Global/Customizations views (non-network), pack nodes inside OUs and Accounts using rectpacking to form grid/box layouts
    if (!isNetworkView && (kind === 'ou' || kind === 'account') && n.id !== 'root') {
      layoutOpts['elk.algorithm'] = 'rectpacking'
      layoutOpts['elk.aspectRatio'] = '1.6'
    }

    elkNodesMap.set(n.id, {
      id: n.id,
      width: n.width ?? 120,
      height: n.height ?? 100,
      children: [],
      layoutOptions: layoutOpts
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

  // Map high-level edges, translating any endpoints that are inner VPC nodes to their parent VPC
  const getElkTargetId = (nodeId: string): string => {
    if (elkNodesMap.has(nodeId)) return nodeId
    let curr = nodeMap.get(nodeId)
    while (curr && curr.parentId) {
      if (elkNodesMap.has(curr.parentId)) return curr.parentId
      curr = nodeMap.get(curr.parentId)
    }
    return nodeId
  }

  const elkEdges = edges.map(e => {
    const sId = getElkTargetId(e.source)
    const tId = getElkTargetId(e.target)
    return {
      id: e.id,
      sources: [sId],
      targets: [tId]
    }
  }).filter(e => e.sources[0] !== e.targets[0] && elkNodesMap.has(e.sources[0]) && elkNodesMap.has(e.targets[0]))

  // Add layout-only flow constraints to enforce vertical ordering (Internet -> Hub -> TGW -> Spokes -> Route Tables)
  const tgwNode = nodes.find(n => (n.data as { kind?: string })?.kind === 'tgw')
  const tgwId = tgwNode?.id
  const hubAccountName = tgwNode?.data?.account
  const hubAccountId = hubAccountName ? `account:${hubAccountName}` : null
  const tgwRtGroupNode = nodes.find(n => (n.data as { kind?: string })?.kind === 'tgw-rt-group')
  const tgwRtGroupId = tgwRtGroupNode?.id

  // internet -> hub VPC (instead of hub account) to align the internet node directly below the VPC with the IGW
  const internetEdge = edges.find(e => e.target === 'internet' || e.source === 'internet')
  const internetTargetVpcId = internetEdge 
    ? (internetEdge.target === 'internet' ? getElkTargetId(internetEdge.source) : getElkTargetId(internetEdge.target))
    : null

  if (elkNodesMap.has('internet') && internetTargetVpcId && elkNodesMap.has(internetTargetVpcId)) {
    elkEdges.push({
      id: 'dummy:internet->hub-vpc',
      sources: ['internet'],
      targets: [internetTargetVpcId]
    })
  } else if (elkNodesMap.has('internet') && hubAccountId && elkNodesMap.has(hubAccountId)) {
    elkEdges.push({
      id: 'dummy:internet->hub',
      sources: ['internet'],
      targets: [hubAccountId]
    })
  }

  // hub account -> tgw
  if (hubAccountId && elkNodesMap.has(hubAccountId) && tgwId && elkNodesMap.has(tgwId)) {
    elkEdges.push({
      id: 'dummy:hub->tgw',
      sources: [hubAccountId],
      targets: [tgwId]
    })
  }

  // tgw -> spoke accounts
  for (const n of nodes) {
    const isAccount = (n.data as { kind?: string })?.kind === 'account'
    if (isAccount && n.id !== hubAccountId && elkNodesMap.has(n.id) && tgwId && elkNodesMap.has(tgwId)) {
      elkEdges.push({
        id: `dummy:tgw->spoke:${n.id}`,
        sources: [tgwId],
        targets: [n.id]
      })
    }
    
    // spoke accounts -> route tables
    if (isAccount && n.id !== hubAccountId && elkNodesMap.has(n.id) && tgwRtGroupId && elkNodesMap.has(tgwRtGroupId)) {
      elkEdges.push({
        id: `dummy:spoke->tgw-rt:${n.id}`,
        sources: [n.id],
        targets: [tgwRtGroupId]
      })
    }
  }

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

  // Extract ELK edge segments
  const edgeSegments = new Map<string, Segment[]>()
  if (layoutedGraph.edges) {
    for (const edge of layoutedGraph.edges) {
      const segments: Segment[] = []
      const section = edge.sections?.[0]
      if (section) {
        // Find Lowest Common Ancestor (LCA) of source and target to compute offset
        const sId = edge.sources[0]
        const tId = edge.targets[0]
        const lcaId = getLCA(sId, tId, nodeMap)
        const offset = { x: 0, y: 0 }
        if (lcaId) {
          let currId: string | undefined = lcaId
          while (currId) {
            const pos = finalPositions.get(currId)
            if (pos) {
              offset.x += pos.x
              offset.y += pos.y
            }
            currId = nodeMap.get(currId)?.parentId
          }
        }

        const points = [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint
        ]
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i]
          const p2 = points[i+1]
          segments.push({
            p1: { x: p1.x + offset.x, y: p1.y + offset.y },
            p2: { x: p2.x + offset.x, y: p2.y + offset.y },
            isHorizontal: Math.abs(p1.y - p2.y) < 0.1,
            edgeId: edge.id
          })
        }
      }
      edgeSegments.set(edge.id, segments)
    }
  }

  const mappedNodes = nodes.map(node => {
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
      const parentBox = computeBox(node.parentId, byParent, nodeMap, boxCache)
      const pos       = parentBox.childPos.get(node.id)
      if (pos) {
        const childBox  = computeBox(node.id, byParent, nodeMap, boxCache)
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

  return { nodes: mappedNodes, edgeSegments }
}
