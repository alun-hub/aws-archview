import { createContext, useContext } from 'react'
import type { NodeFindingSummary } from '../../analysis'

interface HighlightState {
  dimmedNodeIds: Set<string>
  /** Validation findings per node, so a node the panel is complaining about is
   *  findable on the canvas without reading the panel first. */
  severityByNodeId: Map<string, NodeFindingSummary>
}

export const HighlightContext = createContext<HighlightState>({
  dimmedNodeIds: new Set(),
  severityByNodeId: new Map(),
})

export const useHighlight = () => useContext(HighlightContext)
