import { createContext } from 'react'
import { type Node } from '@xyflow/react'

export interface Point {
  x: number
  y: number
}

export interface Segment {
  p1: Point
  p2: Point
  isHorizontal: boolean
  edgeId?: string
}

export interface EdgeRoutingContextValue {
  nodeMap: Map<string, Node>
  absPosMap: Map<string, Point>
  otherVerticals: Segment[]
}

export const EdgeRoutingContext = createContext<EdgeRoutingContextValue | null>(null)

export function getAbsolutePosition(nodeId: string, nodeMap: Map<string, Node>): Point {
  let x = 0
  let y = 0
  let currId: string | undefined = nodeId
  const visited = new Set<string>()
  while (currId) {
    if (visited.has(currId)) break
    visited.add(currId)
    const node = nodeMap.get(currId)
    if (!node) break
    x += node.position.x
    y += node.position.y
    currId = node.parentId
  }
  return { x, y }
}

export function getHandlePosition(node: Node, handleId: string | null, absPos: Point): Point {
  const w = node.measured?.width ?? node.width ?? 100
  const h = node.measured?.height ?? node.height ?? 90
  if (handleId?.startsWith('top')) {
    return { x: absPos.x + w / 2, y: absPos.y }
  }
  if (handleId?.startsWith('bottom')) {
    return { x: absPos.x + w / 2, y: absPos.y + h }
  }
  if (handleId?.startsWith('left')) {
    return { x: absPos.x, y: absPos.y + h / 2 }
  }
  if (handleId?.startsWith('right')) {
    return { x: absPos.x + w, y: absPos.y + h / 2 }
  }
  return { x: absPos.x + w / 2, y: absPos.y + h / 2 }
}

export function getEdgeSegments(sx: number, sy: number, tx: number, ty: number, sourceHandle: string | null, edgeId?: string): Segment[] {
  const isHorizontal = sourceHandle?.startsWith('left') || sourceHandle?.startsWith('right')
  const segments: Segment[] = []

  if (isHorizontal) {
    const mx = (sx + tx) / 2
    segments.push({ p1: { x: sx, y: sy }, p2: { x: mx, y: sy }, isHorizontal: true, edgeId })
    segments.push({ p1: { x: mx, y: sy }, p2: { x: mx, y: ty }, isHorizontal: false, edgeId })
    segments.push({ p1: { x: mx, y: ty }, p2: { x: tx, y: ty }, isHorizontal: true, edgeId })
  } else {
    const my = (sy + ty) / 2
    segments.push({ p1: { x: sx, y: sy }, p2: { x: sx, y: my }, isHorizontal: false, edgeId })
    segments.push({ p1: { x: sx, y: my }, p2: { x: tx, y: my }, isHorizontal: true, edgeId })
    segments.push({ p1: { x: tx, y: my }, p2: { x: tx, y: ty }, isHorizontal: false, edgeId })
  }
  return segments
}
