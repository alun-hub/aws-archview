/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { LzaConfigs, ViewKind } from '../parser'

interface State {
  configs: LzaConfigs
  activeView: ViewKind
  selectedNodeId: string | null
  loadedFiles: Record<string, string>
  showPropagations: boolean
  showTgwAttachments: boolean
  showVpnConnections: boolean
  showInternetFlows: boolean
}

type Action =
  | { type: 'SET_FILE'; filename: string; content: string; parsed: Partial<LzaConfigs> }
  | { type: 'SET_VIEW'; view: ViewKind }
  | { type: 'SELECT_NODE'; id: string | null }
  | { type: 'TOGGLE_LAYER'; layer: 'propagations' | 'tgwAttachments' | 'vpnConnections' | 'internetFlows' }

const initial: State = {
  configs: {},
  activeView: 'organization',
  selectedNodeId: null,
  loadedFiles: {},
  showPropagations: false, // Default false to keep diagram clean
  showTgwAttachments: true,
  showVpnConnections: true,
  showInternetFlows: true,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FILE':
      return {
        ...state,
        loadedFiles: { ...state.loadedFiles, [action.filename]: action.content },
        configs: { ...state.configs, ...action.parsed },
      }
    case 'SET_VIEW':
      return { ...state, activeView: action.view, selectedNodeId: null }
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.id }
    case 'TOGGLE_LAYER':
      return {
        ...state,
        showPropagations: action.layer === 'propagations' ? !state.showPropagations : state.showPropagations,
        showTgwAttachments: action.layer === 'tgwAttachments' ? !state.showTgwAttachments : state.showTgwAttachments,
        showVpnConnections: action.layer === 'vpnConnections' ? !state.showVpnConnections : state.showVpnConnections,
        showInternetFlows: action.layer === 'internetFlows' ? !state.showInternetFlows : state.showInternetFlows,
      }
    default:
      return state
  }
}

const StateCtx = createContext<State>(initial)
const DispatchCtx = createContext<Dispatch<Action>>(() => {})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  return (
    <DispatchCtx.Provider value={dispatch}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </DispatchCtx.Provider>
  )
}

export const useConfig = () => useContext(StateCtx)
export const useDispatch = () => useContext(DispatchCtx)
