import { createContext, useContext } from 'react'

interface HighlightState {
  dimmedNodeIds: Set<string>
}

export const HighlightContext = createContext<HighlightState>({ dimmedNodeIds: new Set() })

export const useHighlight = () => useContext(HighlightContext)
