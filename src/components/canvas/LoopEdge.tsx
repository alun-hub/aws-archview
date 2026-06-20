import { useContext } from 'react'
import { type EdgeProps } from '@xyflow/react'
import { EdgeRoutingContext, getHandlePosition, getEdgeSegments } from './edgeRouting'

export function LoopEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  style,
  markerEnd,
}: EdgeProps) {
  const ctx = useContext(EdgeRoutingContext)
  if (!ctx) return null

  const { absPosMap, otherVerticals, nodeMap } = ctx
  const sourceNode = nodeMap.get(source)
  const targetNode = nodeMap.get(target)

  if (!sourceNode || !targetNode) return null

  const sAbs = absPosMap.get(source) ?? { x: 0, y: 0 }
  const tAbs = absPosMap.get(target) ?? { x: 0, y: 0 }

  const sPos = getHandlePosition(sourceNode, sourceHandleId ?? null, sAbs)
  const tPos = getHandlePosition(targetNode, targetHandleId ?? null, tAbs)

  const mySegments = getEdgeSegments(sPos.x, sPos.y, tPos.x, tPos.y, sourceHandleId ?? null, id)

  let pathD = `M ${sPos.x} ${sPos.y}`

  for (const seg of mySegments) {
    if (seg.isHorizontal) {
      const crossings: number[] = []
      const y = seg.p1.y
      const xMin = Math.min(seg.p1.x, seg.p2.x)
      const xMax = Math.max(seg.p1.x, seg.p2.x)

      for (const vSeg of otherVerticals) {
        // Skip vertical segments belonging to this edge itself using edgeId
        if (vSeg.edgeId === id) continue

        const vx = vSeg.p1.x
        const vyMin = Math.min(vSeg.p1.y, vSeg.p2.y)
        const vyMax = Math.max(vSeg.p1.y, vSeg.p2.y)

        if (vx > xMin + 12 && vx < xMax - 12 && y > vyMin && y < vyMax) {
          crossings.push(vx)
        }
      }

      const isLtr = seg.p1.x < seg.p2.x
      crossings.sort((a, b) => (isLtr ? a - b : b - a))

      const radius = 5

      for (const cx of crossings) {
        const startX = isLtr ? cx - radius : cx + radius
        const endX = isLtr ? cx + radius : cx - radius
        pathD += ` L ${startX} ${y}`
        const sweep = isLtr ? 1 : 0
        pathD += ` A ${radius} ${radius} 0 0 ${sweep} ${endX} ${y}`
      }
      pathD += ` L ${seg.p2.x} ${y}`
    } else {
      pathD += ` L ${seg.p2.x} ${seg.p2.y}`
    }
  }

  return (
    <path
      id={id}
      d={pathD}
      className="react-flow__edge-path"
      style={style}
      markerEnd={markerEnd}
      fill="none"
    />
  )
}
