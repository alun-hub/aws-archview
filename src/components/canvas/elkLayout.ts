import type { Edge, Node } from '@xyflow/react'

// Layout constants
const H_GAP = 20       // gap between siblings
const V_GAP = 16       // gap between wrapped rows
const PAD_TOP = 48     // top padding (room for group label)
const PAD_H = 16       // left/right padding inside container
const PAD_BOTTOM = 16
const ROOT_GAP = 56    // gap between root-level containers (horizontal)
const ROOT_V_GAP = 40  // gap between root rows (vertical)

const MAX_ROW_CHILDREN = 5  // wrap to next row after this many children

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
      width: (node.width ?? 160) as number,
      height: (node.height ?? 80) as number,
      childPos: new Map(),
    }
  }

  const childBoxes = children.map((c) => ({
    id: c.id,
    box: computeBox(c.id, byParent, nodeMap),
  }))

  const childPos = new Map<string, { x: number; y: number }>()
  let rowX = PAD_H
  let rowY = PAD_TOP
  let rowMaxH = 0
  let colsInRow = 0
  let totalW = 0

  for (const { id: cId, box } of childBoxes) {
    if (colsInRow >= MAX_ROW_CHILDREN && colsInRow > 0) {
      rowX = PAD_H
      rowY += rowMaxH + V_GAP
      rowMaxH = 0
      colsInRow = 0
    }
    childPos.set(cId, { x: rowX, y: rowY })
    rowX += box.width + H_GAP
    rowMaxH = Math.max(rowMaxH, box.height)
    totalW = Math.max(totalW, rowX - H_GAP + PAD_H)
    colsInRow++
  }

  return {
    width: Math.max(totalW, 200),
    height: Math.max(rowY + rowMaxH + PAD_BOTTOM, 100),
    childPos,
  }
}


export async function applyElkLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  // Suppress unused parameter lint
  void edges

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const byParent = new Map<string, Node[]>()
  const roots: Node[] = []

  for (const node of nodes) {
    if (node.parentId) {
      const arr = byParent.get(node.parentId) ?? []
      arr.push(node)
      byParent.set(node.parentId, arr)
    } else {
      roots.push(node)
    }
  }

  // Compute layout for each root and its subtree
  const rootBoxes = roots.map((r) => ({
    id: r.id,
    box: computeBox(r.id, byParent, nodeMap),
  }))

  // Arrange roots: wrap into rows of at most 3
  const ROOTS_PER_ROW = 3
  const rootPos = new Map<string, { x: number; y: number }>()
  let rx = 0
  let ry = 0
  let rowMaxH = 0
  let colCount = 0

  for (const { id, box } of rootBoxes) {
    if (colCount >= ROOTS_PER_ROW && colCount > 0) {
      rx = 0
      ry += rowMaxH + ROOT_V_GAP
      rowMaxH = 0
      colCount = 0
    }
    rootPos.set(id, { x: rx, y: ry })
    rx += box.width + ROOT_GAP
    rowMaxH = Math.max(rowMaxH, box.height)
    colCount++
  }

  // Build output: update each node's position (relative to parent) + size
  return nodes.map((node) => {
    if (!node.parentId) {
      // Root node: absolute position
      const rp = rootPos.get(node.id)
      const rb = rootBoxes.find((b) => b.id === node.id)?.box
      if (!rp || !rb) return node
      return {
        ...node,
        position: { x: rp.x, y: rp.y },
        width: rb.width,
        height: rb.height,
        style: { ...node.style, width: rb.width, height: rb.height },
      }
    }

    // Child node: position relative to parent, from parent's childPos map
    // Walk up to find the nearest ancestor box that contains this node's position
    const parentBox = computeBox(node.parentId, byParent, nodeMap)
    const pos = parentBox.childPos.get(node.id)
    if (!pos) return node

    const childBox = computeBox(node.id, byParent, nodeMap)
    return {
      ...node,
      position: { x: pos.x, y: pos.y },
      width: childBox.width,
      height: childBox.height,
      style: { ...node.style, width: childBox.width, height: childBox.height },
    }
  })
}
