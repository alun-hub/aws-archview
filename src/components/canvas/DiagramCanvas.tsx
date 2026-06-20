import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { GroupNode } from '../nodes/GroupNode'
import { ServiceNode } from '../nodes/ServiceNode'
import { ExportMenu } from './ExportMenu'
import { useConfig, useDispatch } from '../../store/configStore'
import type { GraphModel } from '../../parser'
import { applyElkLayout } from './elkLayout'
import { EdgeRoutingContext, getAbsolutePosition, getHandlePosition, getEdgeSegments, type Point, type Segment } from './edgeRouting'
import { LoopEdge } from './LoopEdge'
import { HighlightContext } from './HighlightContext'


function sortParentsFirst(nodes: Node[]): Node[] {
  const result: Node[] = []
  const added = new Set<string>()
  const remaining = [...nodes]
  let passes = 0
  while (remaining.length > 0 && passes < 50) {
    passes++
    for (let i = remaining.length - 1; i >= 0; i--) {
      const n = remaining[i]
      if (!n.parentId || added.has(n.parentId)) {
        result.push(n)
        added.add(n.id)
        remaining.splice(i, 1)
      }
    }
  }
  return result
}

const nodeTypes = {
  // ── Container / group kinds ──────────────────────────────────────────────
  root:              GroupNode,
  ou:                GroupNode,
  account:           GroupNode,
  region:            GroupNode,
  'on-premises':     GroupNode,
  'tgw-rt-group':    GroupNode,
  vpc:               GroupNode,
  'subnet-public':   GroupNode,
  'subnet-private':  GroupNode,
  'subnet-firewall': GroupNode,
  'subnet-tgw':      GroupNode,
  // ── Leaf service kinds ───────────────────────────────────────────────────
  tgw:               ServiceNode,
  'tgw-rt':         ServiceNode,
  vpn:               ServiceNode,
  cgw:               ServiceNode,
  'client-vpn':      ServiceNode,
  dx:                ServiceNode,
  route53:           ServiceNode,
  nlb:               ServiceNode,
  alb:               ServiceNode,
  'network-firewall':  ServiceNode,
  'nat-gateway':       ServiceNode,
  igw:                 ServiceNode,
  'security-hub':    ServiceNode,
  guardduty:         ServiceNode,
  inspector:         ServiceNode,
  macie:             ServiceNode,
  iam:               ServiceNode,
  'iam-core':        ServiceNode,
  detective:         ServiceNode,
  'audit-manager':   ServiceNode,
  acm:               ServiceNode,
  kms:               ServiceNode,
  'firewall-manager': ServiceNode,
  's3':              ServiceNode,
  backup:            ServiceNode,
  lambda:            ServiceNode,
  ec2:               ServiceNode,
  cloudwatch:        ServiceNode,
  cloudtrail:        ServiceNode,
  config:            ServiceNode,
  'control-tower':   ServiceNode,
  organizations:     ServiceNode,
  cloudformation:    ServiceNode,
  'systems-manager': ServiceNode,
  'service-catalog': ServiceNode,
  service:           ServiceNode,
  subnet:            ServiceNode,
  cloud:             ServiceNode,
}

const edgeTypes = {
  customLoop: LoopEdge,
}

// Default sizes for leaf vs group nodes (ELK will compute group sizes)
// Leaf nodes: fixed dimensions passed to ELK (no compound children)
const LEAF_W = 100
const LEAF_H = 110

// Per-kind size overrides for compact service nodes
const LEAF_SIZE_OVERRIDE: Record<string, { w: number; h: number }> = {
  'tgw-rt':          { w: 90,  h: 100 },
  cloudformation:    { w: 120, h: 150 },
  'service-catalog': { w: 120, h: 150 },
}
const LEAF_SIZE = new Set([
  'tgw', 'tgw-rt', 'vpn', 'cgw', 'client-vpn', 'dx', 'route53', 'nlb', 'alb', 'igw',
  'network-firewall', 'nat-gateway', 'security-hub', 'guardduty',
  'inspector', 'macie', 'iam', 'iam-core', 'detective', 'audit-manager',
  'acm', 'kms', 'firewall-manager', 's3', 'backup', 'lambda', 'ec2',
  'cloudwatch', 'cloudtrail', 'config', 'control-tower', 'organizations',
  'cloudformation', 'systems-manager', 'service-catalog', 'service', 'subnet',
  'cloud',
])

// Container nodes: initial dimensions (ELK resizes when they have children)
const GROUP_MIN: Record<string, { w: number; h: number }> = {
  root:              { w: 380, h: 160 },
  ou:                { w: 280, h: 120 },
  account:           { w: 240, h: 110 },
  region:            { w: 260, h: 120 },
  'on-premises':     { w: 240, h: 110 },
  'tgw-rt-group':   { w: 240, h: 120 },
  vpc:               { w: 240, h: 110 },
  'subnet-public':   { w: 190, h:  76 },
  'subnet-private':  { w: 190, h:  76 },
  'subnet-firewall': { w: 190, h:  76 },
  'subnet-tgw':      { w: 190, h:  76 },
}

function toFlowNodes(model: GraphModel): Node[] {
  return model.nodes.map((n) => {
    const isLeaf = LEAF_SIZE.has(n.kind)
    const group = GROUP_MIN[n.kind]
    const override = LEAF_SIZE_OVERRIDE[n.kind]
    return {
      id: n.id,
      type: n.kind,
      data: { label: n.label, kind: n.kind, ...n.data },
      position: { x: 0, y: 0 },
      parentId: n.parentId,
      ...(isLeaf
        ? { width: override?.w ?? LEAF_W, height: override?.h ?? LEAF_H }
        : { width: group?.w ?? 220, height: group?.h ?? 100 }),
      ...(n.parentId ? { extent: 'parent' as const } : {}),
    }
  })
}

const EDGE_STYLES: Record<string, { color: string; dash?: string }> = {
  'tgw':         { color: '#6B3FA0', dash: '6 3' },
  'tgw-hub':     { color: '#6B3FA0', dash: '6 3' },
  'vpn':         { color: '#CC7700', dash: '4 4' },
  'peering':     { color: '#1A6CAE', dash: '5 3' },
  'flow':        { color: '#248814' },
  'propagation': { color: '#6B3FA0', dash: '2 3' },
}

function toFlowEdges(model: GraphModel): Edge[] {
  return model.edges.map((e) => {
    const style = EDGE_STYLES[e.kind ?? 'tgw']

    const isTgwHub       = e.kind === 'tgw-hub'
    const isTgwSpoke     = e.kind === 'tgw'
    const isVpnToTgw     = e.kind === 'vpn' && e.source.startsWith('vpn:') && e.target.startsWith('tgw:')
    const isPropagation  = e.kind === 'propagation'
    const isPeering      = e.kind === 'peering'

    let sourceHandle: string | undefined = undefined
    let targetHandle: string | undefined = undefined

    if (isTgwHub) {
      sourceHandle = 'top-s'
      targetHandle = 'bottom-t'
    } else if (isTgwSpoke) {
      sourceHandle = 'bottom-s'
      targetHandle = 'top-t'
    } else if (isVpnToTgw) {
      sourceHandle = 'left-s'
      targetHandle = 'right-t'
    } else if (isPropagation) {
      if (e.source.startsWith('vpn:')) {
        sourceHandle = 'left-s'
        targetHandle = 'right-t'
      } else {
        const isNetworkVpc = e.source.toLowerCase().endsWith(':network')
        if (isNetworkVpc) {
          sourceHandle = 'bottom-s'
          targetHandle = 'top-t'
        } else {
          sourceHandle = 'top-s'
          targetHandle = 'bottom-t'
        }
      }
    } else if (isPeering) {
      sourceHandle = 'right-s'
      targetHandle = 'left-t'
    } else if (e.target === 'internet') {
      sourceHandle = 'top-s'
      targetHandle = 'bottom-t'
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'customLoop',
      pathOptions: { borderRadius: 16 },
      ...(sourceHandle ? { sourceHandle } : {}),
      ...(targetHandle ? { targetHandle } : {}),
      style: {
        stroke: style.color,
        strokeWidth: 2,
        ...(style.dash ? { strokeDasharray: style.dash } : {}),
      },
      markerEnd: { type: 'arrowclosed' as const, color: style.color, width: 14, height: 14 },
      animated: false,
      ...(e.label
        ? {
            label: e.label,
            labelStyle: {
              fontSize: 10,
              fontWeight: 600,
              fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
              fill: style.color,
            },
            labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
            labelBgPadding: [4, 6] as [number, number],
            labelBgBorderRadius: 4,
          }
        : {}),
    }
  })
}

// ── SearchBar ────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  root: 'Root', ou: 'OU', account: 'Account', region: 'Region',
  vpc: 'VPC', 'subnet-public': 'Public Subnet', 'subnet-private': 'Private Subnet',
  'subnet-firewall': 'Firewall Subnet', 'subnet-tgw': 'TGW Subnet',
  tgw: 'Transit Gateway', vpn: 'VPN', cgw: 'Customer Gateway',
  'on-premises': 'On-Premises', 'security-hub': 'Security Hub',
  guardduty: 'GuardDuty', 'tgw-rt-group': 'Route Table Group',
  'network-firewall': 'Network Firewall', 'nat-gateway': 'NAT Gateway',
}

function SearchBar() {
  const { fitView, getNodes } = useReactFlow()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<Node[]>([])
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleInput = (q: string) => {
    setQuery(q)
    if (q.length < 1) { setResults([]); return }
    const lq = q.toLowerCase()
    setResults(
      getNodes()
        .filter(n => String(n.data?.label ?? '').toLowerCase().includes(lq))
        .slice(0, 8)
    )
  }

  const handleSelect = (node: Node) => {
    fitView({ nodes: [{ id: node.id }], duration: 700, padding: 0.5, maxZoom: 2 })
    setQuery('')
    setResults([])
    inputRef.current?.blur()
  }

  return (
    <Panel position="top-left" style={{ margin: 10 }}>
      <div style={{ position: 'relative', width: 260 }}>
        <div style={{ position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }}
            width="13" height="13" viewBox="0 0 13 13" fill="none"
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="#232F3E" strokeWidth="1.5"/>
            <path d="M9 9L11.5 11.5" stroke="#232F3E" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setQuery(''); setResults([]); inputRef.current?.blur() }
            }}
            placeholder="Search node… (⌘K)"
            style={{
              width: '100%',
              padding: '8px 10px 8px 30px',
              background: '#fff',
              border: '1.5px solid #ddd',
              borderRadius: 7,
              fontSize: 12,
              fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
              color: '#232F3E',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
        {focused && results.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 7,
            boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
            overflow: 'hidden',
            zIndex: 10000,
          }}>
            {results.map(n => {
              const kind  = String(n.data?.kind ?? '')
              const label = String(n.data?.label ?? n.id)
              return (
                <button
                  key={n.id}
                  onMouseDown={() => handleSelect(n)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f7ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{KIND_LABEL[kind] ?? kind}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────────

const LEGEND_EDGES = [
  { label: 'TGW Attachment', color: '#6B3FA0', dash: '6 3' },
  { label: 'VPN',            color: '#CC7700', dash: '4 4' },
  { label: 'Peering',        color: '#1A6CAE', dash: '5 3' },
  { label: 'Propagation',    color: '#6B3FA0', dash: '2 3' },
  { label: 'Internet Flow',  color: '#248814', dash: undefined },
]

const KBD: React.CSSProperties = {
  background: '#eee', padding: '1px 5px', borderRadius: 3,
  fontSize: 9, fontFamily: 'monospace', border: '1px solid #ccc',
}

function Legend() {
  const [open, setOpen] = useState(true)

  return (
    <Panel position="bottom-left" style={{ margin: 10 }}>
      <div style={{
        background: 'rgba(255,255,255,0.96)',
        border: '1.5px solid #ddd',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        overflow: 'hidden',
        fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
        minWidth: 190,
        userSelect: 'none',
      }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '7px 10px',
            background: '#F4F4F4',
            border: 'none',
            borderBottom: open ? '1px solid #eee' : 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            color: '#232F3E',
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <span>Legend</span>
          <span style={{ opacity: 0.45, fontSize: 9, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {LEGEND_EDGES.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="34" height="10" style={{ flexShrink: 0 }}>
                  <line x1="1" y1="5" x2="33" y2="5" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} />
                  <polygon points="29,2 33,5 29,8" fill={item.color} />
                </svg>
                <span style={{ fontSize: 11, color: '#444' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #eee', marginTop: 4, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#999', marginBottom: 1 }}>Shortcuts</div>
              <div style={{ fontSize: 10, color: '#888', display: 'flex', gap: 6, alignItems: 'center' }}>
                <kbd style={KBD}>F</kbd> Fit view
              </div>
              <div style={{ fontSize: 10, color: '#888', display: 'flex', gap: 6, alignItems: 'center' }}>
                <kbd style={KBD}>Esc</kbd> Deselect
              </div>
              <div style={{ fontSize: 10, color: '#888', display: 'flex', gap: 6, alignItems: 'center' }}>
                <kbd style={KBD}>⌘K</kbd> Search node
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

// ── Combined flow controller: keyboard + zoom + auto-fitView ─────────────────

function FlowController({ fitViewTrigger }: { fitViewTrigger: number }) {
  const { fitView, getViewport, setViewport, getNodes } = useReactFlow()
  const dispatch    = useDispatch()
  const config      = useConfig()
  const routingCtx  = useContext(EdgeRoutingContext)
  const prevTrigger = useRef(0)

  // Refs so the wheel handler always reads current values without re-registering
  const selectedNodeIdRef = useRef(config.selectedNodeId)
  const routingCtxRef     = useRef(routingCtx)
  useEffect(() => { selectedNodeIdRef.current = config.selectedNodeId })
  useEffect(() => { routingCtxRef.current = routingCtx })

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f' || e.key === 'F') fitView({ duration: 600, padding: 0.15 })
      if (e.key === 'Escape') dispatch({ type: 'SELECT_NODE', id: null })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fitView, dispatch])

  // Auto-fitView when model/view changes
  useEffect(() => {
    if (fitViewTrigger === prevTrigger.current) return
    prevTrigger.current = fitViewTrigger
    const timer = setTimeout(() => fitView({ duration: 400, padding: 0.15 }), 80)
    return () => clearTimeout(timer)
  }, [fitViewTrigger, fitView])

  // Custom wheel zoom registered once via refs.
  // capture:true fires before ReactFlow's d3-zoom handler; stopPropagation keeps it that way.
  useEffect(() => {
    const canvas = document.querySelector('.react-flow') as HTMLElement | null
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const { x: vx, y: vy, zoom } = getViewport()
      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newZoom    = Math.min(Math.max(zoom * zoomFactor, 0.08), 4)

      let pivotX: number
      let pivotY: number

      const selectedId = selectedNodeIdRef.current
      const ctx        = routingCtxRef.current

      if (selectedId && ctx) {
        const absPos = ctx.absPosMap.get(selectedId)
        const node   = getNodes().find(n => n.id === selectedId)
        if (absPos && node) {
          // Flow-space center of the selected node → screen-space pivot
          pivotX = (absPos.x + (node.width  ?? 100) / 2) * zoom + vx
          pivotY = (absPos.y + (node.height ?? 100) / 2) * zoom + vy
        } else {
          const rect = canvas.getBoundingClientRect()
          pivotX = e.clientX - rect.left
          pivotY = e.clientY - rect.top
        }
      } else {
        // No selection — zoom toward cursor
        const rect = canvas.getBoundingClientRect()
        pivotX = e.clientX - rect.left
        pivotY = e.clientY - rect.top
      }

      const ratio = newZoom / zoom
      setViewport({
        x: pivotX - (pivotX - vx) * ratio,
        y: pivotY - (pivotY - vy) * ratio,
        zoom: newZoom,
      })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => canvas.removeEventListener('wheel', onWheel, { capture: true })
  }, [getViewport, getNodes, setViewport])

  return null
}

// ── Main canvas ──────────────────────────────────────────────────────────────

interface Props {
  model: GraphModel | null
}

export function DiagramCanvas({ model }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [fitViewTrigger, setFitViewTrigger] = useState(0)
  const config   = useConfig()
  const dispatch = useDispatch()

  // Compute which node ids should be dimmed based on current selection
  const dimmedNodeIds = useMemo(() => {
    if (!config.selectedNodeId) return new Set<string>()
    const visible = new Set<string>([config.selectedNodeId])
    for (const e of edges) {
      if (e.source === config.selectedNodeId) visible.add(e.target)
      if (e.target === config.selectedNodeId) visible.add(e.source)
    }
    // Also keep ancestor group nodes undimmed (walk parentId chain)
    const allNodes = new Map(nodes.map(n => [n.id, n]))
    const withAncestors = new Set(visible)
    for (const id of visible) {
      let cur = allNodes.get(id)
      while (cur?.parentId) {
        withAncestors.add(cur.parentId)
        cur = allNodes.get(cur.parentId)
      }
    }
    return new Set(nodes.map(n => n.id).filter(id => !withAncestors.has(id)))
  }, [config.selectedNodeId, edges, nodes])

  const routingContextValue = useMemo(() => {
    if (nodes.length === 0) return null

    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const absPosMap = new Map<string, Point>()
    for (const n of nodes) {
      absPosMap.set(n.id, getAbsolutePosition(n.id, nodeMap))
    }

    const otherVerticals: Segment[] = []
    for (const e of edges) {
      const sN = nodeMap.get(e.source)
      const tN = nodeMap.get(e.target)
      if (!sN || !tN) continue
      const sa = absPosMap.get(e.source) ?? { x: 0, y: 0 }
      const ta = absPosMap.get(e.target) ?? { x: 0, y: 0 }
      const sp = getHandlePosition(sN, e.sourceHandle ?? null, sa)
      const tp = getHandlePosition(tN, e.targetHandle ?? null, ta)
      const segs = getEdgeSegments(sp.x, sp.y, tp.x, tp.y, e.sourceHandle ?? null, e.id)
      for (const s of segs) {
        if (!s.isHorizontal) {
          otherVerticals.push(s)
        }
      }
    }

    return { nodeMap, absPosMap, otherVerticals }
  }, [nodes, edges])

  // 1. Re-calculate layout ONLY when model changes
  useEffect(() => {
    if (!model) return
    const rawNodes = toFlowNodes(model)
    const rawEdges = toFlowEdges(model)
    applyElkLayout(rawNodes, rawEdges).then((laid) => {
      setNodes(sortParentsFirst(laid))
      setFitViewTrigger(k => k + 1)
    })
  }, [model, setNodes])

  // 2. Filter edges by toggle state + dim based on selection
  useEffect(() => {
    if (!model) return

    const connectedEdgeIds = new Set<string>()
    if (config.selectedNodeId) {
      for (const e of model.edges) {
        if (e.source === config.selectedNodeId || e.target === config.selectedNodeId) {
          connectedEdgeIds.add(e.id)
        }
      }
    }

    const filteredEdges = model.edges.filter((e) => {
      if (e.kind === 'propagation') return config.showPropagations
      if (e.kind === 'vpn')         return config.showVpnConnections
      if (e.kind === 'flow')        return config.showInternetFlows
      if (e.kind === 'tgw' || e.kind === 'tgw-hub') return config.showTgwAttachments
      return true
    })

    setEdges(
      toFlowEdges({ ...model, edges: filteredEdges }).map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: config.selectedNodeId && !connectedEdgeIds.has(e.id) ? 0.1 : 1,
        },
      }))
    )
  }, [
    model,
    setEdges,
    config.showPropagations,
    config.showTgwAttachments,
    config.showVpnConnections,
    config.showInternetFlows,
    config.selectedNodeId,
  ])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      dispatch({ type: 'SELECT_NODE', id: node.id })
    },
    [dispatch],
  )

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', id: null })
  }, [dispatch])

  if (!model || model.nodes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#888',
          fontFamily: '"Amazon Ember", "Helvetica Neue", sans-serif',
          flexDirection: 'column',
          gap: 16,
          background: '#fafafa',
        }}
      >
        <svg width="80" height="60" viewBox="0 0 80 60" fill="none">
          <rect x="1" y="1" width="78" height="58" rx="6" stroke="#232F3E" strokeWidth="2" strokeDasharray="6 3" fill="none"/>
          <rect x="10" y="8" width="60" height="6" rx="2" fill="#E7157B" opacity="0.3"/>
          <rect x="10" y="20" width="26" height="30" rx="4" fill="#E7157B" opacity="0.15" stroke="#E7157B" strokeWidth="1.5"/>
          <rect x="44" y="20" width="26" height="30" rx="4" fill="#8C4FFF" opacity="0.15" stroke="#8C4FFF" strokeWidth="1.5"/>
          <rect x="14" y="26" width="18" height="18" rx="3" fill="#FF9900" opacity="0.3"/>
          <rect x="48" y="26" width="18" height="18" rx="3" fill="#8C4FFF" opacity="0.3"/>
        </svg>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#232F3E' }}>
          Ladda LZA-konfigurationsfiler
        </div>
        <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 1.6 }}>
          {config.activeView === 'organization' && <><b>organization-config.yaml</b><br/>accounts-config.yaml</>}
          {config.activeView === 'network'      && <><b>network-config.yaml</b></>}
          {config.activeView === 'global'       && <><b>global-config.yaml</b></>}
          {config.activeView === 'customizations' && <><b>customizations-config.yaml</b></>}
        </div>
      </div>
    )
  }

  return (
    <HighlightContext.Provider value={{ dimmedNodeIds }}>
      <EdgeRoutingContext.Provider value={routingContextValue}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          attributionPosition="bottom-right"
          minZoom={0.1}
          maxZoom={3}
          zoomOnScroll={false}
          style={{ background: '#f8f8f8' }}
          elevateEdgesOnSelect
        >
          <Background color="#d0d0d0" gap={20} size={1} />
          <Controls style={{ borderRadius: 6 }} />
          <SearchBar />
          {config.activeView === 'network' && <Legend />}
          <ExportMenu />
          <FlowController fitViewTrigger={fitViewTrigger} />
          <MiniMap
            nodeColor={(n) => {
              const kind = (n.data as { kind?: string })?.kind ?? ''
              if (kind === 'on-premises')                             return '#5A5A5A'
              if (['root', 'ou', 'account'].includes(kind))          return '#E7157B'
              if (kind === 'vpc')                                     return '#8C4FFF'
              if (kind === 'subnet-public')                           return '#248814'
              if (kind === 'subnet-private')                          return '#1A6CAE'
              if (kind === 'subnet-firewall')                         return '#CC3300'
              if (kind === 'subnet-tgw')                             return '#6B3FA0'
              if (['tgw', 'vpn', 'cgw', 'dx'].includes(kind))        return '#6B3FA0'
              if (['security-hub', 'guardduty', 'macie', 'inspector'].includes(kind)) return '#DD3B25'
              return '#888'
            }}
            pannable
            zoomable
            style={{ borderRadius: 6 }}
          />
        </ReactFlow>
      </EdgeRoutingContext.Provider>
    </HighlightContext.Provider>
  )
}
