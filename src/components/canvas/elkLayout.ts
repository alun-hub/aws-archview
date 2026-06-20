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

// Root-level gaps
const R_H = 64   // horizontal gap between root nodes
const R_V = 72   // vertical gap between root rows
const HUB_TO_TGW   = 100  // gap: hub account bottom → TGW top
const TGW_TO_SPOKE = 260  // gap: TGW bottom → spoke account tops

// Max children per row per parent kind
function maxCols(kind: string): number {
  switch (kind) {
    case 'root':           return 4
    case 'ou':             return 4
    case 'account':
    case 'on-premises':    return 2
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
      width:    (node.width  ?? 160) as number,
      height:   (node.height ??  80) as number,
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

// ── Helper: arrange a flat list of boxes in a row-wrapped grid ─────────────────
function gridLayout(
  items: { id: string; w: number; h: number }[],
  startX: number,
  startY: number,
  perRow: number,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  let x = startX, y = startY, rowH = 0, col = 0
  for (const item of items) {
    if (col >= perRow && col > 0) { x = startX; y += rowH + R_V; rowH = 0; col = 0 }
    pos.set(item.id, { x, y })
    x   += item.w + R_H
    rowH = Math.max(rowH, item.h)
    col++
  }
  return pos
}

// ── Main layout entry point ────────────────────────────────────────────────────
export async function applyElkLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  void edges
  const nodeMap  = new Map(nodes.map((n) => [n.id, n]))
  const byParent = new Map<string, Node[]>()
  const roots: Node[] = []

  for (const node of nodes) {
    if (node.parentId) {
      const arr = byParent.get(node.parentId) ?? []
      arr.push(node); byParent.set(node.parentId, arr)
    } else {
      roots.push(node)
    }
  }

  // Compute sizes for all roots
  const boxOf = new Map(
    roots.map((r) => [r.id, computeBox(r.id, byParent, nodeMap)])
  )

  // ── Classify roots into zones ──────────────────────────────────────────────
  // TGW nodes tell us which account they belong to via data.account
  const tgwNodes    = roots.filter((n) => (n.data as { kind?: string })?.kind === 'tgw')
  const onPremNodes = roots.filter((n) => (n.data as { kind?: string })?.kind === 'on-premises')
  const tgwRtNodes  = roots.filter((n) => (n.data as { kind?: string })?.kind === 'tgw-rt-group')

  // Hub accounts = accounts that OWN a TGW (from data.account on tgw nodes)
  const hubAccountNames = new Set(
    tgwNodes.map((n) => (n.data as { account?: string })?.account).filter(Boolean)
  )
  const hubAccountNodes = roots.filter(
    (n) =>
      (n.data as { kind?: string })?.kind === 'account' &&
      hubAccountNames.has((n.data as { label?: string })?.label ?? (n.data as { account?: string })?.account ?? '')
  )

  // Also try matching by node id: account:{name}
  const hubAccountNodesByLabel = roots.filter((n) => {
    if ((n.data as { kind?: string })?.kind !== 'account') return false
    return [...hubAccountNames].some((name) => n.id === `account:${name}`)
  })
  const hubSet = new Set([...hubAccountNodes, ...hubAccountNodesByLabel].map((n) => n.id))

  const hubNodes    = roots.filter((n) => hubSet.has(n.id))
  const spokeNodes  = roots.filter((n) => {
    const kind = (n.data as { kind?: string })?.kind
    return !hubSet.has(n.id) && kind !== 'tgw' && kind !== 'on-premises' && kind !== 'tgw-rt-group'
  })

  // ── Compute zone widths for centering ─────────────────────────────────────
  // Zone A (top): hub accounts side by side
  const hubW = hubNodes.reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)
  const hubH = hubNodes.reduce((m, n) => Math.max(m, boxOf.get(n.id)!.height), 0)

  // Zone B (center): TGW nodes in a row
  const tgwW = tgwNodes.reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)
  const tgwH = tgwNodes.reduce((m, n) => Math.max(m, boxOf.get(n.id)!.height), 0)

  // Zone C (bottom): spoke accounts, 3 per row
  const SPOKES_PER_ROW = 4
  const firstSpokeRowW = spokeNodes
    .slice(0, SPOKES_PER_ROW)
    .reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)

  // ── Compute all zone dimensions before picking refW ──────────────────────
  const onPremH    = onPremNodes.reduce((m, n) => Math.max(m, boxOf.get(n.id)!.height), 0)
  const onPremW    = onPremNodes.reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)
  const tgwRtW     = tgwRtNodes.reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)
  const tgwRtH     = tgwRtNodes.reduce((m, n) => Math.max(m, boxOf.get(n.id)!.height), 0)
  const zoneBTotalW =
    (tgwRtW  > 0 ? tgwRtW  + R_H * 2 : 0) +
    tgwW +
    (onPremW > 0 ? onPremW + R_H * 2 : 0)

  // Canvas reference width = widest of hub / spoke rows / Zone B
  const refW = Math.max(hubW, firstSpokeRowW, tgwW, zoneBTotalW)

  const rootPos = new Map<string, { x: number; y: number }>()

  // ── Zone A: hub accounts only (top row, centered over spoke columns) ──────
  const zoneAY = 0
  const hubStartX = Math.round((refW - hubW) / 2)
  let hx = hubStartX
  for (const n of hubNodes) {
    rootPos.set(n.id, { x: hx, y: zoneAY })
    hx += boxOf.get(n.id)!.width + R_H
  }

  // ── Zone B: [RT Tables] [TGW] [On-Premises] in one row ───────────────────
  const zoneBY = zoneAY + (hubH > 0 ? hubH + HUB_TO_TGW : 0)

  // Center TGW over spoke row; place RT tables to the left, On-Premises to the right
  const tgwStartX = Math.round((refW - tgwW) / 2)

  // TGW Route Tables — left of TGW
  const rtStartX = tgwStartX - (tgwRtW > 0 ? tgwRtW + R_H * 2 : 0)
  let rx = rtStartX
  for (const n of tgwRtNodes) {
    const h = boxOf.get(n.id)!.height
    rootPos.set(n.id, { x: rx, y: zoneBY + Math.round((Math.max(tgwH, tgwRtH) - h) / 2) })
    rx += boxOf.get(n.id)!.width + R_H
  }

  // TGW
  let tx = tgwStartX
  for (const n of tgwNodes) {
    rootPos.set(n.id, { x: tx, y: zoneBY })
    tx += boxOf.get(n.id)!.width + R_H
  }

  // On-Premises — right of TGW
  const onPremX = tgwStartX + tgwW + R_H * 2
  const onPremY = zoneBY + Math.round((tgwH - onPremH) / 2)
  let opX = onPremX
  for (const n of onPremNodes) {
    rootPos.set(n.id, { x: opX, y: Math.max(zoneBY, onPremY) })
    opX += boxOf.get(n.id)!.width + R_H
  }

  // ── Zone C: spoke accounts (centered below TGW) ───────────────────────────
  const zoneCY = zoneBY + Math.max(tgwH, onPremH, tgwRtH) + TGW_TO_SPOKE
  const spokeStartX = Math.round((refW - firstSpokeRowW) / 2)
  const spokeGrid = gridLayout(
    spokeNodes.map((n) => ({ id: n.id, w: boxOf.get(n.id)!.width, h: boxOf.get(n.id)!.height })),
    spokeStartX,
    zoneCY,
    SPOKES_PER_ROW,
  )
  for (const [id, pos] of spokeGrid) rootPos.set(id, pos)

  // ── Build output ──────────────────────────────────────────────────────────
  return nodes.map((node) => {
    if (!node.parentId) {
      const rp = rootPos.get(node.id)
      const rb = boxOf.get(node.id)
      if (!rp || !rb) return node
      return {
        ...node,
        position: { x: rp.x, y: rp.y },
        width: rb.width, height: rb.height,
        style: { ...node.style, width: rb.width, height: rb.height },
      }
    }

    const parentBox = computeBox(node.parentId, byParent, nodeMap)
    const pos       = parentBox.childPos.get(node.id)
    if (!pos) return node
    const childBox  = computeBox(node.id, byParent, nodeMap)
    return {
      ...node,
      position: { x: pos.x, y: pos.y },
      width: childBox.width, height: childBox.height,
      style: { ...node.style, width: childBox.width, height: childBox.height },
    }
  })
}
