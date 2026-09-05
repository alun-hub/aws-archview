import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './diagram.css'

import { GroupNode } from '../nodes/GroupNode'
import { ServiceNode } from '../nodes/ServiceNode'
import { ExportMenu } from './ExportMenu'
import { useConfig, useDispatch } from '../../store/configStore'
import type { GraphModel, GraphNode } from '../../parser'
import { applyElkLayout } from './elkLayout'
import { EdgeRoutingContext, getAbsolutePosition, getHandlePosition, getEdgeSegments, type Point, type Segment } from './edgeRouting'
import { LoopEdge } from './LoopEdge'
import { HighlightContext } from './HighlightContext'
import { KIND_LABEL } from './kindLabels'
import { ancestorChain, isNodeVisible } from './visibility'
import { useFileDrop } from '../../hooks/useFileDrop'
import { SAMPLE_CONFIGS } from '../../parser/sampleConfigs'


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
  'access-analyzer': ServiceNode,
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
  'inspector', 'macie', 'iam', 'iam-core', 'detective', 'audit-manager', 'access-analyzer',
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

function toFlowNodes(model: GraphModel, collapsedNodes: Set<string>): Node[] {
  return model.nodes.map((n) => {
    const isLeaf = LEAF_SIZE.has(n.kind)
    const isCollapsed = collapsedNodes.has(n.id)
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
        : isCollapsed
          ? { width: 150, height: 46 }
          : { width: group?.w ?? 220, height: group?.h ?? 100 }),
      ...(n.parentId ? { extent: 'parent' as const } : {}),
    }
  })
}

// Each family gets its own hue, not just its own dash pattern — at the zoom
// levels a real diagram gets viewed at (or for anyone color-weak), a dash
// difference alone doesn't read; tgw/dx/propagation used to all share the
// same purple.
const EDGE_STYLES: Record<string, { color: string; dash?: string }> = {
  'tgw':         { color: '#6B3FA0', dash: '6 3' },
  'tgw-hub':     { color: '#6B3FA0', dash: '6 3' },
  'vpn':         { color: '#CC7700', dash: '4 4' },
  'dx':          { color: '#146EB4', dash: '8 2 2 2' },
  'peering':     { color: '#1A6CAE', dash: '5 3' },
  'flow':        { color: '#248814' },
  'propagation': { color: '#008296', dash: '2 3' },
}

function toFlowEdges(model: GraphModel): Edge[] {
  return model.edges.map((e) => {
    const style = EDGE_STYLES[e.kind ?? 'tgw'] ?? { color: '#6B3FA0' }

    const isTgwHub       = e.kind === 'tgw-hub'
    const isTgwSpoke     = e.kind === 'tgw'
    const isVpnToTgw     = (e.kind === 'vpn' || e.kind === 'dx') && (e.source.startsWith('vpn:') || e.source.startsWith('dx:')) && e.target.startsWith('tgw:')
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
      data: { kind: e.kind },
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

interface SearchBarProps {
  /** Full, unfiltered model — search must find a result even when it's
   *  tucked behind a collapsed container or a "Node types" filter. */
  model: GraphModel | null
  /** Currently rendered nodes, so a just-revealed result can be framed as
   *  soon as it actually exists on the canvas (relayout is async). */
  nodes: Node[]
}

function SearchBar({ model, nodes }: SearchBarProps) {
  const { fitView } = useReactFlow()
  const dispatch = useDispatch()
  const config   = useConfig()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<GraphNode[]>([])
  const [focused, setFocused] = useState(false)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
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
    if (!model || q.length < 1) { setResults([]); return }
    const lq = q.toLowerCase()
    setResults(model.nodes.filter(n => n.label.toLowerCase().includes(lq)).slice(0, 8))
  }

  const handleSelect = (result: GraphNode) => {
    if (!model) return
    // A result buried under a collapsed container or a hidden node-type
    // would otherwise look like search "found" it but nothing happens.
    if (!isNodeVisible(model, result.id, config.collapsedNodes, config.hiddenNodeIds)) {
      dispatch({ type: 'REVEAL_NODES', ids: [result.id, ...ancestorChain(model, result.id)] })
    }
    dispatch({ type: 'SELECT_NODE', id: result.id })
    setPendingFocusId(result.id)
    setQuery('')
    setResults([])
    inputRef.current?.blur()
  }

  // Frame the selected result once it's actually on the canvas — a reveal
  // triggers an async ELK relayout, so the node may not exist in `nodes` yet
  // on the render where it was requested. Give up after a few seconds so a
  // result that never renders (e.g. its parent kind stays hidden) doesn't
  // leave this watching forever.
  useEffect(() => {
    if (!pendingFocusId) return
    if (nodes.some(n => n.id === pendingFocusId)) {
      fitView({ nodes: [{ id: pendingFocusId }], duration: 700, padding: 0.5, maxZoom: 2 })
      const clear = setTimeout(() => setPendingFocusId(null), 0)
      return () => clearTimeout(clear)
    }
    const timer = setTimeout(() => setPendingFocusId(null), 4000)
    return () => clearTimeout(timer)
  }, [pendingFocusId, nodes, fitView])

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
              const hidden = model != null && !isNodeVisible(model, n.id, config.collapsedNodes, config.hiddenNodeIds)
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{n.label}</span>
                    {hidden && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: '#7c5c00', background: '#fffbe6',
                        border: '1px solid #ffe58f', borderRadius: 8, padding: '0 5px', lineHeight: '14px',
                      }}>
                        hidden
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{KIND_LABEL[n.kind] ?? n.kind}</span>
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

const LEGEND_EDGES: { label: string; color: string; dash?: string; kinds: string[] }[] = [
  { label: 'TGW Attachment',  color: '#6B3FA0', dash: '6 3',        kinds: ['tgw', 'tgw-hub'] },
  { label: 'VPN',              color: '#CC7700', dash: '4 4',        kinds: ['vpn'] },
  { label: 'Direct Connect',   color: '#146EB4', dash: '8 2 2 2',    kinds: ['dx'] },
  { label: 'Peering',          color: '#1A6CAE', dash: '5 3',        kinds: ['peering'] },
  { label: 'Propagation',      color: '#008296', dash: '2 3',        kinds: ['propagation'] },
  { label: 'Internet Flow',    color: '#248814', dash: undefined,    kinds: ['flow'] },
]

const KBD: React.CSSProperties = {
  background: '#eee', padding: '1px 5px', borderRadius: 3,
  fontSize: 9, fontFamily: 'monospace', border: '1px solid #ccc',
}

function Legend({ presentEdgeKinds }: { presentEdgeKinds: Set<string> }) {
  const [open, setOpen] = useState(false)
  // Only show color rows for connection types this view actually draws —
  // the legend is shared across all views now, and most only use a subset.
  const edgeItems = LEGEND_EDGES.filter(item => item.kinds.some(k => presentEdgeKinds.has(k)))

  return (
    <Panel position="bottom-left" style={{ margin: '0 10px 10px' }}>
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
            {edgeItems.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="34" height="10" style={{ flexShrink: 0 }}>
                  <line x1="1" y1="5" x2="33" y2="5" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} />
                  <polygon points="29,2 33,5 29,8" fill={item.color} />
                </svg>
                <span style={{ fontSize: 11, color: '#444' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ borderTop: edgeItems.length > 0 ? '1px solid #eee' : 'none', marginTop: edgeItems.length > 0 ? 4 : 0, paddingTop: edgeItems.length > 0 ? 6 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
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

// ── Hidden node-type filter badge ─────────────────────────────────────────────

// Node-type filtering (the "Node types" section in the left panel) leaves no
// trace on the canvas otherwise — a diagram that's missing half its accounts
// looks like a bug, not a filter someone set five minutes ago.
function HiddenFilterBadge() {
  const config   = useConfig()
  const dispatch = useDispatch()
  const count = config.hiddenNodeIds.size
  if (count === 0) return null

  return (
    <Panel position="top-right" style={{ margin: '54px 10px 0 0' }}>
      <button
        onClick={() => dispatch({ type: 'SHOW_ALL_NODES' })}
        title="Some nodes are hidden by the Node types filter — click to show all"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#fffbe6',
          border: '1.5px solid #ffe58f',
          borderRadius: 20,
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 700,
          color: '#7c5c00',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {count} node{count === 1 ? '' : 's'} hidden
        <span style={{ opacity: 0.6 }}>✕</span>
      </button>
    </Panel>
  )
}

// ── Zoom indicator ───────────────────────────────────────────────────────────

function ZoomIndicator() {
  const { zoom, x, y } = useViewport()
  const { setViewport, fitView } = useReactFlow()

  // Click resets to 100% around the viewport center; alt-click fits the
  // whole diagram — the number was purely informational before, with no way
  // to act on it short of the scroll wheel or the separate Controls widget.
  const reset = (e: React.MouseEvent) => {
    if (e.altKey) { fitView({ duration: 400, padding: 0.15 }); return }
    const el = document.querySelector('.react-flow') as HTMLElement | null
    const cx = (el?.clientWidth ?? 0) / 2
    const cy = (el?.clientHeight ?? 0) / 2
    const ratio = 1 / zoom
    setViewport({ x: cx - (cx - x) * ratio, y: cy - (cy - y) * ratio, zoom: 1 }, { duration: 250 })
  }

  return (
    // The MiniMap anchors to the same corner at its default 200x150 and isn't
    // part of this flex-stacked Panel group, so it silently covers anything
    // placed too close to the bottom edge here — clear its footprint.
    <Panel position="bottom-right" style={{ margin: '0 10px 175px' }}>
      <button
        onClick={reset}
        title="Click: reset to 100%  ·  Alt-click: fit whole diagram"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1.5px solid #e0e0e0',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: '#444',
          fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          userSelect: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          cursor: 'pointer',
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
    </Panel>
  )
}

// ── Breadcrumb navigation ─────────────────────────────────────────────────────

function BreadcrumbNav() {
  const { fitView, getNodes } = useReactFlow()
  const config = useConfig()

  if (!config.selectedNodeId) return null

  const allNodes = getNodes()
  const nodeMap = new Map(allNodes.map(n => [n.id, n]))

  const path: Node[] = []
  let cur = nodeMap.get(config.selectedNodeId)
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined
  }

  if (path.length <= 1) return null

  return (
    <Panel position="top-center" style={{ margin: '8px 0 0' }}>
      <div style={{
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #ddd',
        borderRadius: 6,
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
        fontSize: 11,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}>
        {path.map((n, i) => (
          <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {i > 0 && <span style={{ color: '#bbb', margin: '0 2px' }}>›</span>}
            <button
              onMouseDown={() => fitView({ nodes: [{ id: n.id }], duration: 500, padding: 0.3 })}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '1px 5px',
                borderRadius: 3,
                fontSize: 11,
                color: i === path.length - 1 ? '#0073bb' : '#444',
                fontWeight: i === path.length - 1 ? 700 : 400,
                fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {String(n.data?.label ?? n.id)}
            </button>
          </span>
        ))}
      </div>
    </Panel>
  )
}

// ── Combined flow controller: keyboard + zoom + auto-fitView ─────────────────

function FlowController({ fitViewTrigger }: { fitViewTrigger: number }) {
  const { fitView, getViewport, setViewport } = useReactFlow()
  const dispatch    = useDispatch()
  const prevTrigger = useRef(0)

  // Keyboard shortcuts, plus Enter/Space to select a Tab-focused node.
  // elementsSelectable is off (selection is driven through the store, not
  // React Flow's own selection model), so React Flow's built-in keyboard
  // activation of a focused node doesn't fire a click for us — do it by hand.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f' || e.key === 'F') fitView({ duration: 600, padding: 0.15 })
      if (e.key === 'Escape') dispatch({ type: 'SELECT_NODE', id: null })
      if (e.key === 'Enter' || e.key === ' ') {
        const el = e.target as HTMLElement
        const nodeEl = el.closest('.react-flow__node')
        const nodeId = nodeEl?.getAttribute('data-id')
        if (nodeId) {
          e.preventDefault()
          dispatch({ type: 'SELECT_NODE', id: nodeId })
        }
      }
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

  // Custom wheel handling registered once — always relative to the current
  // getViewport()/setViewport(), so no dependency on selection or routing state.
  // capture:true fires before ReactFlow's d3-zoom handler; stopPropagation keeps it that way.
  useEffect(() => {
    const canvas = document.querySelector('.react-flow') as HTMLElement | null
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const { x: vx, y: vy, zoom } = getViewport()

      // Pinch-to-zoom on a trackpad reports as a wheel event with ctrlKey set
      // (same for a physical mouse's ctrl+wheel) — treat that, and only that,
      // as a zoom gesture, always pivoting on the cursor position so the
      // point under the pointer stays put. Matches minZoom/maxZoom on <ReactFlow>.
      if (e.ctrlKey) {
        const rect = canvas.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top

        const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        const newZoom    = Math.min(Math.max(zoom * zoomFactor, 0.1), 3)
        const ratio       = newZoom / zoom

        setViewport({
          x: cursorX - (cursorX - vx) * ratio,
          y: cursorY - (cursorY - vy) * ratio,
          zoom: newZoom,
        })
        return
      }

      // Plain wheel / two-finger trackpad scroll → pan. Shift+scroll (mouse
      // wheels that don't report deltaX) pans horizontally instead.
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY
      setViewport({ x: vx - dx, y: vy - dy, zoom })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => canvas.removeEventListener('wheel', onWheel, { capture: true })
  }, [getViewport, setViewport])

  return null
}

interface SemanticZoomControllerProps {
  enableSemanticZoom: boolean
}

function SemanticZoomController({ enableSemanticZoom }: SemanticZoomControllerProps) {
  const { zoom } = useViewport()

  useEffect(() => {
    const el = document.querySelector('.diagram-canvas-wrapper')
    if (!el) return
    const isOut = enableSemanticZoom && zoom < 0.5
    if (isOut) {
      el.classList.add('rf-zoom-out')
    } else {
      el.classList.remove('rf-zoom-out')
    }
  }, [zoom, enableSemanticZoom])

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
  const [elkEdgeSegments, setElkEdgeSegments] = useState<Map<string, Segment[]>>(new Map())
  const config   = useConfig()
  const dispatch = useDispatch()
  const { collapsedNodes, hiddenNodeIds } = config
  const { onDrop } = useFileDrop(dispatch)
  const loadSample = () => {
    for (const [filename, content] of Object.entries(SAMPLE_CONFIGS)) {
      dispatch({ type: 'SET_FILE', filename, content })
    }
  }





  // Which nodeIds have children in the full (unfiltered) model
  const nodeParentIds = useMemo(() => {
    if (!model) return new Set<string>()
    return new Set(model.nodes.filter(n => n.parentId).map(n => n.parentId!))
  }, [model])

  // Connection kinds this graph actually draws — the Legend is shared across
  // every view, but each only uses a subset of edge kinds.
  const presentEdgeKinds = useMemo(() => {
    if (!model) return new Set<string>()
    return new Set(model.edges.map(e => e.kind ?? 'tgw'))
  }, [model])

  // Filter out descendants of collapsed nodes and nodes hidden (individually,
  // or via an ancestor) through the "Node types" filter
  const filteredModel = useMemo(() => {
    if (!model) return null
    const visibleIds = new Set(
      model.nodes.filter(n => isNodeVisible(model, n.id, collapsedNodes, hiddenNodeIds)).map(n => n.id),
    )
    return {
      nodes: model.nodes.filter(n => visibleIds.has(n.id)),
      edges: model.edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)),
    }
  }, [model, collapsedNodes, hiddenNodeIds])

  // Compute which node ids should be dimmed — either because an SCP is
  // pinned for highlighting (click an SCP chip in the detail panel: show
  // exactly the OUs/accounts it targets), or based on the current selection
  // (focus mode).
  const dimmedNodeIds = useMemo(() => {
    const allNodes = new Map(nodes.map(n => [n.id, n]))
    const withAncestorsOf = (visible: Set<string>) => {
      const withAncestors = new Set(visible)
      for (const id of visible) {
        let cur = allNodes.get(id)
        while (cur?.parentId) {
          withAncestors.add(cur.parentId)
          cur = allNodes.get(cur.parentId)
        }
      }
      return withAncestors
    }

    if (config.highlightedScp) {
      const visible = new Set<string>()
      for (const n of nodes) {
        const names = (n.data as { scpNames?: unknown }).scpNames
        if (Array.isArray(names) && names.includes(config.highlightedScp)) visible.add(n.id)
      }
      return new Set(nodes.map(n => n.id).filter(id => !withAncestorsOf(visible).has(id)))
    }

    if (!config.enableFocusMode) return new Set<string>()
    if (!config.selectedNodeId) return new Set<string>()
    const visible = new Set<string>([config.selectedNodeId])
    for (const e of edges) {
      if (e.source === config.selectedNodeId) visible.add(e.target)
      if (e.target === config.selectedNodeId) visible.add(e.source)
    }
    return new Set(nodes.map(n => n.id).filter(id => !withAncestorsOf(visible).has(id)))
  }, [config.selectedNodeId, config.highlightedScp, edges, nodes, config.enableFocusMode])

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

      const segs = elkEdgeSegments.get(e.id) ?? (() => {
        const sa = absPosMap.get(e.source) ?? { x: 0, y: 0 }
        const ta = absPosMap.get(e.target) ?? { x: 0, y: 0 }
        const sp = getHandlePosition(sN, e.sourceHandle ?? null, sa)
        const tp = getHandlePosition(tN, e.targetHandle ?? null, ta)
        return getEdgeSegments(sp.x, sp.y, tp.x, tp.y, e.sourceHandle ?? null, e.id)
      })()

      for (const s of segs) {
        if (!s.isHorizontal) {
          otherVerticals.push(s)
        }
      }
    }

    return { nodeMap, absPosMap, otherVerticals, elkSegments: elkEdgeSegments }
  }, [nodes, edges, elkEdgeSegments])

  // Ref so the layout effect always reads the current selection without
  // taking it as a dependency — selecting a node must not re-trigger a full
  // ELK relayout (expensive, and would also re-fit the viewport).
  const selectedNodeIdRef = useRef(config.selectedNodeId)
  useEffect(() => { selectedNodeIdRef.current = config.selectedNodeId })

  // 1. Re-calculate layout when model or collapse state changes.
  // Only re-fit the viewport when `model` itself changed identity (a new view
  // or newly-loaded config) — expanding/collapsing a container or toggling a
  // node-type filter re-lays-out the diagram but must not yank the camera
  // away from what the user was just looking at.
  const prevModelRef = useRef<GraphModel | null>(null)
  useEffect(() => {
    if (!filteredModel) return
    const rawNodes = toFlowNodes(filteredModel, collapsedNodes).map(n => ({
      ...n,
      data: { ...n.data, hasChildren: nodeParentIds.has(n.id) },
      selected: n.id === selectedNodeIdRef.current,
    }))
    const rawEdges = toFlowEdges(filteredModel)
    applyElkLayout(rawNodes, rawEdges).then(({ nodes: laidNodes, edgeSegments }) => {
      setNodes(sortParentsFirst(laidNodes))
      setElkEdgeSegments(edgeSegments)
      if (prevModelRef.current !== model) {
        setFitViewTrigger(k => k + 1)
      }
      prevModelRef.current = model
    })
  }, [filteredModel, nodeParentIds, setNodes, collapsedNodes, model])

  // Keep node `selected` in sync with the store outside of full relayouts too
  // (e.g. selecting via search or the breadcrumb) so the clicked node always
  // gets its highlight ring — this is a cheap array map, not an ELK relayout.
  useEffect(() => {
    setNodes(nds => nds.map(n =>
      n.selected === (n.id === config.selectedNodeId)
        ? n
        : { ...n, selected: n.id === config.selectedNodeId }
    ))
  }, [config.selectedNodeId, setNodes])

  // 2. Filter edges by toggle state + dim based on selection
  useEffect(() => {
    if (!filteredModel) return

    const connectedEdgeIds = new Set<string>()
    if (config.selectedNodeId) {
      for (const e of filteredModel.edges) {
        if (e.source === config.selectedNodeId || e.target === config.selectedNodeId) {
          connectedEdgeIds.add(e.id)
        }
      }
    }

    const filteredEdges = filteredModel.edges.filter((e) => {
      if (e.kind === 'propagation') return config.showPropagations
      if (e.kind === 'vpn' || e.kind === 'dx') return config.showVpnConnections
      if (e.kind === 'flow')        return config.showInternetFlows
      if (e.kind === 'tgw' || e.kind === 'tgw-hub') return config.showTgwAttachments
      return true
    })

    setEdges(
      toFlowEdges({ ...filteredModel, edges: filteredEdges }).map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: config.enableFocusMode && config.selectedNodeId && !connectedEdgeIds.has(e.id) ? 0.1 : 1,
        },
      }))
    )
  }, [
    filteredModel,
    setEdges,
    config.showPropagations,
    config.showTgwAttachments,
    config.showVpnConnections,
    config.showInternetFlows,
    config.selectedNodeId,
    config.enableFocusMode,
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
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
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
          Drop LZA configuration files here
        </div>
        <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 1.6 }}>
          {config.activeView === 'organization'   && <><b>organization-config.yaml</b><br/>accounts-config.yaml</>}
          {config.activeView === 'network'        && <><b>network-config.yaml</b></>}
          {config.activeView === 'global'         && <><b>global-config.yaml</b></>}
          {config.activeView === 'customizations' && <><b>customizations-config.yaml</b></>}
          {config.activeView === 'security'       && <><b>security-config.yaml</b></>}
          {config.activeView === 'iam'            && <><b>iam-config.yaml</b></>}
        </div>
        <div style={{ fontSize: 12, color: '#bbb' }}>or</div>
        <button
          onClick={loadSample}
          style={{
            background: '#fff',
            border: '1.5px solid #0073bb',
            color: '#0073bb',
            fontWeight: 700,
            fontSize: 12,
            padding: '7px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          Try a sample configuration
        </button>
      </div>
    )
  }

  return (
    <HighlightContext.Provider value={{ dimmedNodeIds }}>
      <EdgeRoutingContext.Provider value={routingContextValue}>
        <div className="diagram-canvas-wrapper" style={{ width: '100%', height: '100%' }}>
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
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <SemanticZoomController enableSemanticZoom={config.enableSemanticZoom} />
            <Background color="#d0d0d0" gap={20} size={1} />
            {/* Lifted clear of the Legend, which now sits at the very bottom
                of this corner instead of floating over the diagram. */}
            <Controls style={{ borderRadius: 6, marginBottom: 44 }} />
            <SearchBar model={model} nodes={nodes} />
            <BreadcrumbNav />
            <ZoomIndicator />
            <Legend presentEdgeKinds={presentEdgeKinds} />
            <HiddenFilterBadge />
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
        </div>
      </EdgeRoutingContext.Provider>
    </HighlightContext.Provider>
  )
}
