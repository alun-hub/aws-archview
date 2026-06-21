import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@cloudscape-design/components/app-layout'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Checkbox from '@cloudscape-design/components/checkbox'
import ExpandableSection from '@cloudscape-design/components/expandable-section'
import Button from '@cloudscape-design/components/button'

import { ConfigProvider, useConfig, useDispatch } from './store/configStore'
import {
  buildNetworkGraph,
  buildOrganizationGraph,
  buildGlobalGraph,
  buildCustomizationsGraph,
  buildSecurityGraph,
  buildIamGraph,
  type ViewKind,
} from './parser'
import { ConfigLoader } from './components/panels/ConfigLoader'
import { DetailPanel } from './components/panels/DetailPanel'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import type { GraphNode } from './parser'

// ── Left navigation panel ────────────────────────────────────────────────────

const VIEWS: { id: ViewKind; label: string; requiredConfig: string }[] = [
  { id: 'organization',   label: 'Organization',   requiredConfig: 'organization-config.yaml'  },
  { id: 'network',        label: 'Network',        requiredConfig: 'network-config.yaml'        },
  { id: 'security',       label: 'Security',       requiredConfig: 'security-config.yaml'       },
  { id: 'iam',            label: 'IAM',            requiredConfig: 'iam-config.yaml'            },
  { id: 'global',         label: 'Global',         requiredConfig: 'global-config.yaml'         },
  { id: 'customizations', label: 'Customizations', requiredConfig: 'customizations-config.yaml' },
]

function LeftPanel({ activeGraph }: { activeGraph: any }) {
  const config   = useConfig()
  const dispatch = useDispatch()

  const parentIds = useMemo<string[]>(() => {
    if (!activeGraph) return []
    const pIds = new Set<string>(activeGraph.nodes.filter((n: any) => n.parentId).map((n: any) => String(n.parentId)))
    return Array.from(pIds)
  }, [activeGraph])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* App header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid #e9ebed',
        fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#232F3E', letterSpacing: 0.2 }}>
          AWS ArchView
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          LZA Configuration Visualizer
        </div>
      </div>

      {/* Scrollable sections */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Views */}
        <ExpandableSection header="Views" defaultExpanded variant="navigation">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0' }}>
            {VIEWS.map(({ id, label, requiredConfig }) => {
              const active  = config.activeView === id
              const loaded  = requiredConfig in config.loadedFiles
              return (
                <button
                  key={id}
                  onClick={() => dispatch({ type: 'SET_VIEW', view: id })}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 12px',
                    background: active ? 'rgba(0, 115, 187, 0.10)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '3px solid #0073bb' : '3px solid transparent',
                    borderRadius: '0 4px 4px 0',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    color: active ? '#0073bb' : loaded ? '#414d5c' : '#aaa',
                    fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                    transition: 'all 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{label}</span>
                  {loaded && (
                    <span style={{ fontSize: 10, color: active ? '#0073bb' : '#248814', opacity: 0.7 }}>✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </ExpandableSection>

        {/* Configuration */}
        <ExpandableSection header="Configuration" defaultExpanded variant="navigation">
          <div style={{ padding: '4px 0 8px' }}>
            <ConfigLoader loadedFiles={config.loadedFiles} />
          </div>
        </ExpandableSection>

        {/* Diagram Tools */}
        {parentIds.length > 0 && (
          <ExpandableSection header="Diagram Tools" defaultExpanded variant="navigation">
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                variant="normal"
                onClick={() => dispatch({ type: 'COLLAPSE_ALL', ids: parentIds })}
                disabled={config.collapsedNodes.size === parentIds.length}
              >
                Collapse All
              </Button>
              <Button
                variant="normal"
                onClick={() => dispatch({ type: 'EXPAND_ALL' })}
                disabled={config.collapsedNodes.size === 0}
              >
                Expand All
              </Button>
            </div>
          </ExpandableSection>
        )}

        {/* Show / Hide connections — only in network view */}
        {config.activeView === 'network' && (
          <ExpandableSection header="Show / Hide connections" defaultExpanded variant="navigation">
            <div style={{ padding: '4px 0 8px' }}>
              <SpaceBetween size="s">
                <Checkbox
                  checked={config.showTgwAttachments}
                  onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: 'tgwAttachments' })}
                >
                  Transit Gateway attachments
                </Checkbox>
                <Checkbox
                  checked={config.showPropagations}
                  onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: 'propagations' })}
                >
                  TGW RT propagations
                </Checkbox>
                <Checkbox
                  checked={config.showVpnConnections}
                  onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: 'vpnConnections' })}
                >
                  VPN connections
                </Checkbox>
                <Checkbox
                  checked={config.showInternetFlows}
                  onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: 'internetFlows' })}
                >
                  Internet flows
                </Checkbox>
              </SpaceBetween>
            </div>
          </ExpandableSection>
        )}
      </div>
    </div>
  )
}

// ── App shell ────────────────────────────────────────────────────────────────

const VIEW_LABELS: Record<ViewKind, string> = {
  organization:   'Organization',
  network:        'Network',
  global:         'Global',
  customizations: 'Customizations',
  security:       'Security',
  iam:            'IAM',
}

function AppContent() {
  const config = useConfig()
  const [navOpen,   setNavOpen]   = useState(true)
  const [toolsOpen, setToolsOpen] = useState(false)

  const orgGraph      = useMemo(() => buildOrganizationGraph(config.configs),   [config.configs])
  const netGraph      = useMemo(() => buildNetworkGraph(config.configs),         [config.configs])
  const globalGraph   = useMemo(() => buildGlobalGraph(config.configs),          [config.configs])
  const customGraph   = useMemo(() => buildCustomizationsGraph(config.configs),  [config.configs])
  const securityGraph = useMemo(() => buildSecurityGraph(config.configs),        [config.configs])
  const iamGraph      = useMemo(() => buildIamGraph(config.configs),             [config.configs])

  const activeGraph = (() => {
    switch (config.activeView) {
      case 'organization':   return orgGraph
      case 'network':        return netGraph
      case 'global':         return globalGraph
      case 'customizations': return customGraph
      case 'security':       return securityGraph
      case 'iam':            return iamGraph
    }
  })()

  const selectedNode = useMemo<GraphNode | null>(() => {
    if (!config.selectedNodeId || !activeGraph) return null
    return activeGraph.nodes.find((n) => n.id === config.selectedNodeId) ?? null
  }, [config.selectedNodeId, activeGraph])

  // Auto-open detail panel when a node is selected
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (config.selectedNodeId) setToolsOpen(true)
  }, [config.selectedNodeId])

  return (
    <AppLayout
      maxContentWidth={Number.MAX_VALUE}
      navigationOpen={navOpen}
      onNavigationChange={({ detail }) => setNavOpen(detail.open)}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      navigationWidth={300}
      toolsWidth={280}
      navigation={<LeftPanel activeGraph={activeGraph} />}
      tools={
        <Container header={<Header variant="h3">Details</Header>}>
          <DetailPanel node={selectedNode} />
        </Container>
      }
      content={
        <Container
          header={<Header variant="h2">{VIEW_LABELS[config.activeView]}</Header>}
          disableContentPaddings
          fitHeight
        >
          <div style={{ height: 'calc(100vh - 160px)' }}>
            <DiagramCanvas model={activeGraph} />
          </div>
        </Container>
      }
    />
  )
}

export default function App() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  )
}
