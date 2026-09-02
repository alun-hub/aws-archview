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
import { ConfigLoader, ConfigFileList } from './components/panels/ConfigLoader'
import { DetailPanel } from './components/panels/DetailPanel'
import { DiagramCanvas, KIND_LABEL } from './components/canvas/DiagramCanvas'
import { ErrorBoundary } from './components/ErrorBoundary'
import type { GraphNode, GraphModel } from './parser'
import type { NodeKind } from './parser/types'

// ── Left navigation panel ────────────────────────────────────────────────────

const VIEWS: { id: ViewKind; label: string; requiredConfig: string }[] = [
  { id: 'organization',   label: 'Organization',   requiredConfig: 'organization-config.yaml'  },
  { id: 'network',        label: 'Network',        requiredConfig: 'network-config.yaml'        },
  { id: 'security',       label: 'Security',       requiredConfig: 'security-config.yaml'       },
  { id: 'iam',            label: 'IAM',            requiredConfig: 'iam-config.yaml'            },
  { id: 'global',         label: 'Global',         requiredConfig: 'global-config.yaml'         },
  { id: 'customizations', label: 'Customizations', requiredConfig: 'customizations-config.yaml' },
]

function LeftPanel({ activeGraph }: { activeGraph: GraphModel | null }) {
  const config   = useConfig()
  const dispatch = useDispatch()
  const [expandedKinds, setExpandedKinds] = useState<Set<NodeKind>>(new Set())

  const parentIds = useMemo<string[]>(() => {
    if (!activeGraph) return []
    const pIds = new Set<string>(activeGraph.nodes.filter((n) => n.parentId).map((n) => String(n.parentId)))
    return Array.from(pIds)
  }, [activeGraph])

  // Node kinds present in the current view, grouped with their individual
  // instances, for the "Node types" filter — lets users hide a whole kind
  // (e.g. all Accounts) or pick specific instances (e.g. just 2 of 9 accounts).
  const kindGroups = useMemo<{ kind: NodeKind; label: string; nodes: { id: string; label: string }[] }[]>(() => {
    if (!activeGraph) return []
    const byKind = new Map<NodeKind, { id: string; label: string }[]>()
    for (const n of activeGraph.nodes) {
      const list = byKind.get(n.kind)
      if (list) list.push({ id: n.id, label: n.label })
      else byKind.set(n.kind, [{ id: n.id, label: n.label }])
    }
    return Array.from(byKind.entries())
      .map(([kind, nodes]) => ({
        kind,
        label: KIND_LABEL[kind] ?? kind,
        nodes: nodes.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [activeGraph])

  const toggleExpanded = (kind: NodeKind) => {
    setExpandedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  // No wrapper here manages its own scrolling — Cloudscape's navigation
  // panel already applies overflow-y: auto to itself. Nesting a second
  // `overflow: auto` container inside it produced two stacked scrollbars.
  return (
    <div>
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

      {/* Sections */}
      <div>

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
              {config.activeView === 'customizations' && (
                <div style={{ marginTop: 8 }}>
                  <Checkbox
                    checked={config.aggregateStacks}
                    onChange={() => dispatch({ type: 'TOGGLE_AGGREGATE_STACKS' })}
                  >
                    Aggregate Redundant Stacks
                  </Checkbox>
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #eaeded', paddingTop: 8 }}>
                <Checkbox
                  checked={config.enableFocusMode}
                  onChange={() => dispatch({ type: 'TOGGLE_FOCUS_MODE' })}
                >
                  Focus Selection (Solo Mode)
                </Checkbox>
                <Checkbox
                  checked={config.enableSemanticZoom}
                  onChange={() => dispatch({ type: 'TOGGLE_SEMANTIC_ZOOM' })}
                >
                  Semantic Zoom (LOD)
                </Checkbox>
              </div>
            </div>
          </ExpandableSection>
        )}

        {/* Node types — visibility filter for the current view's diagram.
            Each kind can be hidden wholesale, or expanded to hide/show
            individual instances (e.g. specific accounts). */}
        {kindGroups.length > 0 && (
          <ExpandableSection header="Node types" variant="navigation">
            <div style={{ padding: '4px 12px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <button
                  onClick={() => dispatch({ type: 'SHOW_ALL_NODES' })}
                  disabled={config.hiddenNodeIds.size === 0}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontSize: 11, color: config.hiddenNodeIds.size === 0 ? '#bbb' : '#0073bb',
                    cursor: config.hiddenNodeIds.size === 0 ? 'default' : 'pointer',
                    fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                  }}
                >
                  Show all
                </button>
              </div>
              <SpaceBetween size="xs">
                {kindGroups.map(({ kind, label, nodes }) => {
                  const hiddenCount = nodes.filter((n) => config.hiddenNodeIds.has(n.id)).length
                  const allHidden   = hiddenCount === nodes.length
                  const someHidden  = hiddenCount > 0 && !allHidden
                  const expanded    = expandedKinds.has(kind)
                  const canExpand   = nodes.length > 1
                  return (
                    <div key={kind}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {canExpand ? (
                          <button
                            onClick={() => toggleExpanded(kind)}
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '0 2px', fontSize: 9, color: '#888', lineHeight: 1,
                            }}
                          >
                            {expanded ? '▼' : '▶'}
                          </button>
                        ) : (
                          <span style={{ width: 13 }} />
                        )}
                        <Checkbox
                          checked={!allHidden}
                          indeterminate={someHidden}
                          onChange={() =>
                            dispatch({
                              type: 'SET_NODES_HIDDEN',
                              ids: nodes.map((n) => n.id),
                              hidden: !allHidden,
                            })
                          }
                        >
                          <span style={{ fontSize: 13 }}>
                            {label} <span style={{ color: '#999' }}>({nodes.length})</span>
                          </span>
                        </Checkbox>
                      </div>
                      {expanded && (
                        <div style={{ marginLeft: 21, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {nodes.map((n) => (
                            <Checkbox
                              key={n.id}
                              checked={!config.hiddenNodeIds.has(n.id)}
                              onChange={() => dispatch({ type: 'TOGGLE_NODE_VISIBILITY', id: n.id })}
                            >
                              <span style={{ fontSize: 12, color: '#555' }}>{n.label}</span>
                            </Checkbox>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </SpaceBetween>
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
                  VPN / Direct Connect
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

        {/* Files — expected/loaded config file status, moved to the bottom
            so it doesn't push the more frequently used tools down */}
        <ExpandableSection header="Files" variant="navigation">
          <div style={{ padding: '4px 12px 8px' }}>
            <ConfigFileList loadedFiles={config.loadedFiles} />
          </div>
        </ExpandableSection>
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

  // Graph builders run during render; guard each so an unexpected config shape
  // surfaces as a per-view error instead of a blank white page that takes down
  // the whole app (including the file/config panel).
  const graphs = useMemo(() => {
    const safe = <T,>(fn: () => T | null): { graph: T | null; error: string | null } => {
      try {
        return { graph: fn(), error: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('Graph build failed', e)
        return { graph: null, error: msg }
      }
    }
    return {
      organization:   safe(() => buildOrganizationGraph(config.configs, config.loadedFiles)),
      network:        safe(() => buildNetworkGraph(config.configs, config.loadedFiles)),
      global:         safe(() => buildGlobalGraph(config.configs)),
      customizations: safe(() => buildCustomizationsGraph(config.configs, config.aggregateStacks)),
      security:       safe(() => buildSecurityGraph(config.configs)),
      iam:            safe(() => buildIamGraph(config.configs, config.loadedFiles)),
    }
  }, [config.configs, config.aggregateStacks, config.loadedFiles])

  const activeEntry  = graphs[config.activeView]
  const activeGraph  = activeEntry?.graph ?? null
  const buildError   = activeEntry?.error ?? null

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
            {buildError ? (
              <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#8b2c1e', maxWidth: 760 }}>
                <h2 style={{ marginTop: 0 }}>Could not render the {VIEW_LABELS[config.activeView]} view</h2>
                <p style={{ color: '#555' }}>
                  One of your configuration files uses a structure this view does not yet handle.
                  Other views are unaffected. See the browser console for the full stack trace.
                </p>
                <pre style={{
                  background: '#fdf0ee', border: '1px solid #f0b5ac', borderRadius: 6,
                  padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {buildError}
                </pre>
              </div>
            ) : (
              <ErrorBoundary>
                <DiagramCanvas model={activeGraph} />
              </ErrorBoundary>
            )}
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
