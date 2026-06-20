/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { resolveConfigKey, parsedForKey, type LzaConfigs, type ViewKind } from '../parser'

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

const getInitialState = (): State => {
  let loadedFiles: Record<string, string> = {}
  const configs: LzaConfigs = {}

  if (typeof window !== 'undefined') {
    try {
      const savedFilesStr = localStorage.getItem('aws-archview:loadedFiles')
      if (savedFilesStr) {
        loadedFiles = JSON.parse(savedFilesStr)
        for (const [filename, content] of Object.entries(loadedFiles)) {
          const key = resolveConfigKey(filename)
          if (key) {
            Object.assign(configs, parsedForKey(key, content))
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse saved files from localStorage', e)
    }
  }

  let activeView: ViewKind = 'organization'
  if (typeof window !== 'undefined') {
    const savedView = localStorage.getItem('aws-archview:activeView')
    if (savedView === 'organization' || savedView === 'network' || savedView === 'global' || savedView === 'customizations') {
      activeView = savedView
    }
  }

  return {
    configs,
    activeView,
    selectedNodeId: null,
    loadedFiles,
    showPropagations: false, // Default false to keep diagram clean
    showTgwAttachments: true,
    showVpnConnections: true,
    showInternetFlows: true,
  }
}

const initial = getInitialState()

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FILE': {
      const nextLoaded = { ...state.loadedFiles, [action.filename]: action.content }
      if (typeof window !== 'undefined') {
        localStorage.setItem('aws-archview:loadedFiles', JSON.stringify(nextLoaded))
      }
      return {
        ...state,
        loadedFiles: nextLoaded,
        configs: { ...state.configs, ...action.parsed },
      }
    }
    case 'SET_VIEW':
      if (typeof window !== 'undefined') {
        localStorage.setItem('aws-archview:activeView', action.view)
      }
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
