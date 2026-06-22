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
  collapsedNodes: Set<string>
  aggregateStacks: boolean
  enableFocusMode: boolean
  enableSemanticZoom: boolean
}

type Action =
  | { type: 'SET_FILE'; filename: string; content: string }
  | { type: 'SET_VIEW'; view: ViewKind }
  | { type: 'SELECT_NODE'; id: string | null }
  | { type: 'TOGGLE_LAYER'; layer: 'propagations' | 'tgwAttachments' | 'vpnConnections' | 'internetFlows' }
  | { type: 'TOGGLE_COLLAPSE'; id: string }
  | { type: 'COLLAPSE_ALL'; ids: string[] }
  | { type: 'EXPAND_ALL' }
  | { type: 'TOGGLE_AGGREGATE_STACKS' }
  | { type: 'TOGGLE_FOCUS_MODE' }
  | { type: 'TOGGLE_SEMANTIC_ZOOM' }

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
            Object.assign(configs, parsedForKey(key, content, loadedFiles))
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
    const validViews: ViewKind[] = ['organization', 'network', 'global', 'customizations', 'security', 'iam']
    if (validViews.includes(savedView as ViewKind)) {
      activeView = savedView as ViewKind
    }
  }

  return {
    configs,
    activeView,
    selectedNodeId: null,
    loadedFiles,
    showPropagations: false,
    showTgwAttachments: true,
    showVpnConnections: true,
    showInternetFlows: true,
    collapsedNodes: new Set<string>(),
    aggregateStacks: true,
    enableFocusMode: true,
    enableSemanticZoom: false,
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
      const configs: LzaConfigs = {}
      for (const [filename, content] of Object.entries(nextLoaded)) {
        const key = resolveConfigKey(filename)
        if (key) Object.assign(configs, parsedForKey(key, content, nextLoaded))
      }
      return { ...state, loadedFiles: nextLoaded, configs }
    }
    case 'SET_VIEW':
      if (typeof window !== 'undefined') {
        localStorage.setItem('aws-archview:activeView', action.view)
      }
      return { ...state, activeView: action.view, selectedNodeId: null, collapsedNodes: new Set<string>() }
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
    case 'TOGGLE_COLLAPSE': {
      const next = new Set(state.collapsedNodes)
      if (next.has(action.id)) next.delete(action.id)
      else next.add(action.id)
      return { ...state, collapsedNodes: next }
    }
    case 'COLLAPSE_ALL':
      return { ...state, collapsedNodes: new Set(action.ids) }
    case 'EXPAND_ALL':
      return { ...state, collapsedNodes: new Set() }
    case 'TOGGLE_AGGREGATE_STACKS':
      return { ...state, aggregateStacks: !state.aggregateStacks }
    case 'TOGGLE_FOCUS_MODE':
      return { ...state, enableFocusMode: !state.enableFocusMode }
    case 'TOGGLE_SEMANTIC_ZOOM':
      return { ...state, enableSemanticZoom: !state.enableSemanticZoom }
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
