import { useMemo, useState } from 'react'
import AppLayout from '@cloudscape-design/components/app-layout'
import SideNavigation from '@cloudscape-design/components/side-navigation'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'

import { ConfigProvider, useConfig, useDispatch } from './store/configStore'
import { buildNetworkGraph, buildOrganizationGraph, type ViewKind } from './parser'
import { ConfigLoader } from './components/panels/ConfigLoader'
import { DetailPanel } from './components/panels/DetailPanel'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import type { GraphNode } from './parser'

const NAV_ITEMS = [
  {
    type: 'section' as const,
    text: 'Vyer',
    items: [
      { type: 'link' as const, text: 'Organisation', href: '#organization' },
      { type: 'link' as const, text: 'Nätverk', href: '#network' },
    ],
  },
]

function AppContent() {
  const config = useConfig()
  const dispatch = useDispatch()
  const [navOpen, setNavOpen] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(true)

  const orgGraph = useMemo(() => buildOrganizationGraph(config.configs), [config.configs])
  const netGraph = useMemo(() => buildNetworkGraph(config.configs), [config.configs])

  const activeGraph = config.activeView === 'organization' ? orgGraph : netGraph

  const selectedNode = useMemo<GraphNode | null>(() => {
    if (!config.selectedNodeId || !activeGraph) return null
    return activeGraph.nodes.find((n) => n.id === config.selectedNodeId) ?? null
  }, [config.selectedNodeId, activeGraph])

  const viewLabel = config.activeView === 'organization' ? 'Organisation' : 'Nätverk'

  return (
    <AppLayout
      navigationOpen={navOpen}
      onNavigationChange={({ detail }) => setNavOpen(detail.open)}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      navigation={
        <SideNavigation
          header={{ text: 'AWS ArchView', href: '#' }}
          activeHref={`#${config.activeView}`}
          items={NAV_ITEMS}
          onFollow={(e) => {
            e.preventDefault()
            const view = e.detail.href.replace('#', '') as ViewKind
            dispatch({ type: 'SET_VIEW', view })
          }}
        />
      }
      tools={
        <SpaceBetween size="m">
          <Container header={<Header variant="h3">Konfiguration</Header>}>
            <ConfigLoader loadedFiles={config.loadedFiles} />
          </Container>
          <Container header={<Header variant="h3">Detaljer</Header>}>
            <DetailPanel node={selectedNode} />
          </Container>
        </SpaceBetween>
      }
      toolsWidth={300}
      content={
        <Container
          header={<Header variant="h2">{viewLabel}</Header>}
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
