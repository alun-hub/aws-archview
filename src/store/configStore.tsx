/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { LzaConfigs, ViewKind } from '../parser'

interface State {
  configs: LzaConfigs
  activeView: ViewKind
  selectedNodeId: string | null
  loadedFiles: Record<string, string>
}

type Action =
  | { type: 'SET_FILE'; filename: string; content: string; parsed: Partial<LzaConfigs> }
  | { type: 'SET_VIEW'; view: ViewKind }
  | { type: 'SELECT_NODE'; id: string | null }

const initial: State = {
  configs: {},
  activeView: 'organization',
  selectedNodeId: null,
  loadedFiles: {},
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
