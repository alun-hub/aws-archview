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
  vpc:               GroupNode,
  'subnet-public':   GroupNode,
  'subnet-private':  GroupNode,
  'subnet-firewall': GroupNode,
  'subnet-tgw':      GroupNode,
  // ── Leaf service kinds ───────────────────────────────────────────────────
  tgw:               ServiceNode,
  vpn:               ServiceNode,
  cgw:               ServiceNode,
  'client-vpn':      ServiceNode,
  dx:                ServiceNode,
  route53:           ServiceNode,
  nlb:               ServiceNode,
  alb:               ServiceNode,
  'network-firewall': ServiceNode,
  'nat-gateway':     ServiceNode,
  igw:               ServiceNode,
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
const LEAF_W = 96
const LEAF_H = 96
const LEAF_SIZE = new Set([
  'tgw', 'vpn', 'cgw', 'client-vpn', 'dx', 'route53', 'nlb', 'alb',
  'network-firewall', 'nat-gateway', 'igw', 'security-hub', 'guardduty',
  'inspector', 'macie', 'iam', 'iam-core', 'detective', 'audit-manager',
  'acm', 'kms', 'firewall-manager', 's3', 'backup', 'lambda', 'ec2',
  'cloudwatch', 'cloudtrail', 'config', 'control-tower', 'organizations',
  'cloudformation', 'systems-manager', 'service-catalog', 'service', 'subnet',
])

// Container nodes: initial dimensions (ELK resizes when they have children)
const GROUP_MIN: Record<string, { w: number; h: number }> = {
  root:              { w: 340, h: 140 },
  ou:                { w: 260, h: 110 },
  account:           { w: 220, h: 100 },
  vpc:               { w: 220, h: 100 },
  'subnet-public':   { w: 180, h:  80 },
  'subnet-private':  { w: 180, h:  80 },
  'subnet-firewall': { w: 180, h:  80 },
  'subnet-tgw':      { w: 180, h:  80 },
}

function toFlowNodes(model: GraphModel): Node[] {
  return model.nodes.map((n) => {
    const isLeaf = LEAF_SIZE.has(n.kind)
    const group = GROUP_MIN[n.kind]
    return {
      id: n.id,
      type: n.kind,
      data: { label: n.label, kind: n.kind, ...n.data },
      position: { x: 0, y: 0 },
      parentId: n.parentId,
      ...(isLeaf
        ? { width: LEAF_W, height: LEAF_H }
        : { width: group?.w ?? 220, height: group?.h ?? 100 }),
      ...(n.parentId ? { extent: 'parent' as const } : {}),
    }
  })
}

const EDGE_STYLES: Record<string, { color: string; dash?: string }> = {
  tgw:     { color: '#6B3FA0', dash: '6 3' },
  vpn:     { color: '#CC7700', dash: '4 4' },
  peering: { color: '#1A6CAE', dash: '5 3' },
  flow:    { color: '#248814' },
}

function toFlowEdges(model: GraphModel): Edge[] {
  return model.edges.map((e) => {
    const style = EDGE_STYLES[e.kind ?? 'tgw']
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: {
        stroke: style.color,
        strokeWidth: 1.5,
        ...(style.dash ? { strokeDasharray: style.dash } : {}),
      },
      markerEnd: { type: 'arrowclosed' as const, color: style.color, width: 12, height: 12 },
      zIndex: 9999,
      animated: false,
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
