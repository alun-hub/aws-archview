import { useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { GroupNode } from '../nodes/GroupNode'
import { ServiceNode } from '../nodes/ServiceNode'
import { useDispatch } from '../../store/configStore'
import type { GraphModel } from '../../parser'
import { applyElkLayout } from './elkLayout'

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
}

// Default sizes for leaf vs group nodes (ELK will compute group sizes)
// Leaf nodes: fixed dimensions passed to ELK (no compound children)
const LEAF_W = 100
const LEAF_H = 110

// Per-kind size overrides for compact service nodes
const LEAF_SIZE_OVERRIDE: Record<string, { w: number; h: number }> = {
  'tgw-rt': { w: 80, h: 80 },
}
const LEAF_SIZE = new Set([
  'tgw', 'tgw-rt', 'vpn', 'cgw', 'client-vpn', 'dx', 'route53', 'nlb', 'alb', 'igw',
  'network-firewall', 'nat-gateway', 'igw', 'security-hub', 'guardduty',
  'inspector', 'macie', 'iam', 'iam-core', 'detective', 'audit-manager',
  'acm', 'kms', 'firewall-manager', 's3', 'backup', 'lambda', 'ec2',
  'cloudwatch', 'cloudtrail', 'config', 'control-tower', 'organizations',
  'cloudformation', 'systems-manager', 'service-catalog', 'service', 'subnet',
])

// Container nodes: initial dimensions (ELK resizes when they have children)
const GROUP_MIN: Record<string, { w: number; h: number }> = {
  root:              { w: 380, h: 160 },
  ou:                { w: 280, h: 120 },
  account:           { w: 240, h: 110 },
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
  'tgw':     { color: '#6B3FA0', dash: '6 3' },
  'tgw-hub': { color: '#6B3FA0', dash: '6 3' }, // same style, different handle routing
  'vpn':     { color: '#CC7700', dash: '4 4' },
  'peering': { color: '#1A6CAE', dash: '5 3' },
  'flow':    { color: '#248814' },
}

function toFlowEdges(model: GraphModel): Edge[] {
  return model.edges.map((e) => {
    const style = EDGE_STYLES[e.kind ?? 'tgw']

    // tgw-hub:  TGW below hub account → TGW top-s → hub bottom-t
    // tgw:      TGW above spokes     → TGW bottom-s → spoke top-t
    // vpn→tgw:  On-Premises is RIGHT of TGW → VPN left-s → TGW right-t
    const isTgwHub    = e.kind === 'tgw-hub'
    const isTgwSpoke  = e.kind === 'tgw'
    const isVpnToTgw  = e.kind === 'vpn' && e.source.startsWith('vpn:') && e.target.startsWith('tgw:')

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      pathOptions: { borderRadius: 16 },
      ...(isTgwHub   ? { sourceHandle: 'top-s',    targetHandle: 'bottom-t' } : {}),
      ...(isTgwSpoke ? { sourceHandle: 'bottom-s', targetHandle: 'top-t'    } : {}),
      ...(isVpnToTgw ? { sourceHandle: 'left-s',   targetHandle: 'right-t'  } : {}),
      style: {
        stroke: style.color,
        strokeWidth: 2,
        ...(style.dash ? { strokeDasharray: style.dash } : {}),
      },
      markerEnd: { type: 'arrowclosed' as const, color: style.color, width: 14, height: 14 },
      zIndex: 9999,
      animated: false,
      // Route table label shown as a small pill on the edge
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

interface Props {
  model: GraphModel | null
}

export function DiagramCanvas({ model }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const dispatch = useDispatch()

  useEffect(() => {
    if (!model) return
    const rawNodes = toFlowNodes(model)
    const rawEdges = toFlowEdges(model)
    applyElkLayout(rawNodes, rawEdges).then((laid) => {
      // ReactFlow requires parents before children in the array
      setNodes(sortParentsFirst(laid))
      setEdges(rawEdges)
    })
  }, [model, setNodes, setEdges])

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
        {/* AWS-style placeholder illustration */}
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
          organization-config.yaml<br/>accounts-config.yaml<br/>network-config.yaml
        </div>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      attributionPosition="bottom-right"
      minZoom={0.1}
      maxZoom={3}
      style={{ background: '#f8f8f8' }}
      elevateEdgesOnSelect
      defaultEdgeOptions={{ zIndex: 9999 }}
    >
      {/* Subtle dot grid like draw.io */}
      <Background color="#d0d0d0" gap={20} size={1} />
      <Controls style={{ borderRadius: 6 }} />
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
  )
}
