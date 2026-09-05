import { createContext, useContext } from 'react'
import type { Severity } from '../../analysis'

interface HighlightState {
  dimmedNodeIds: Set<string>
  /** Worst validation severity flagged against each node, so a node the
   *  validation panel is complaining about is findable on the canvas without
   *  reading the panel first. */
  severityByNodeId: Map<string, Severity>
}

export const HighlightContext = createContext<HighlightState>({
  dimmedNodeIds: new Set(),
  severityByNodeId: new Map(),
})

export const useHighlight = () => useContext(HighlightContext)
