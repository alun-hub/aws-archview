import { useState, useRef, useEffect } from 'react'
import { Panel, useReactFlow } from '@xyflow/react'
import { exportToPng, exportToSvg, exportToPdf, exportToDrawio } from './exportUtils'

interface ExportItem {
  id:    string
  label: string
  sub:   string
  icon:  string
}

const ITEMS: ExportItem[] = [
  { id: 'png',    label: 'PNG',     sub: 'Rasterbild · dela enkelt',    icon: '🖼' },
  { id: 'svg',    label: 'SVG',     sub: 'Vektorgrafik · redigerbar',   icon: '✏️' },
  { id: 'pdf',    label: 'PDF',     sub: 'A3 Liggande · utskrift',       icon: '📄' },
  { id: 'drawio', label: 'draw.io', sub: '.drawio · AWS-stenciler',      icon: '📐' },
]

export function ExportMenu() {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { fitView, getNodes, getEdges } = useReactFlow()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handle(id: string) {
    setOpen(false)
    setLoading(id)
    try {
      if (id === 'drawio') {
        exportToDrawio(getNodes(), getEdges())
      } else {
        // Fit all nodes into view before rasterizing
        await fitView({ duration: 0, padding: 0.1 })
        await new Promise((r) => requestAnimationFrame(r))
        await new Promise((r) => requestAnimationFrame(r))

        if (id === 'png')  await exportToPng()
        if (id === 'svg')  await exportToSvg()
        if (id === 'pdf')  await exportToPdf()
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <Panel position="top-right" className="export-menu-panel" style={{ margin: 10 }}>
      <div ref={menuRef} style={{ position: 'relative', userSelect: 'none' }}>
        {/* Trigger button */}
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={!!loading}
          style={btnStyle}
          title="Exportera diagram"
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner /> Exporterar…
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a.75.75 0 0 1 .75.75v7.19l2.47-2.47a.75.75 0 1 1 1.06 1.06L8.53 11.28a.75.75 0 0 1-1.06 0L3.72 7.53a.75.75 0 1 1 1.06-1.06L7.25 8.94V1.75A.75.75 0 0 1 8 1zM2.5 13.25a.75.75 0 0 0 0 1.5h11a.75.75 0 0 0 0-1.5h-11z"/>
              </svg>
              Exportera
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
              </svg>
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div style={dropdownStyle}>
            {ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handle(item.id)}
                style={itemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#232F3E' }}>{item.label}</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{item.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            6,
  padding:        '7px 14px',
  background:     '#232F3E',
  color:          '#fff',
  border:         'none',
  borderRadius:   6,
  fontSize:       12,
  fontFamily:     '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
  fontWeight:     600,
  cursor:         'pointer',
  boxShadow:      '0 2px 6px rgba(0,0,0,0.25)',
  whiteSpace:     'nowrap',
}

const dropdownStyle: React.CSSProperties = {
  position:       'absolute',
  top:            'calc(100% + 6px)',
  right:          0,
  background:     '#fff',
  border:         '1px solid #ddd',
  borderRadius:   8,
  boxShadow:      '0 4px 16px rgba(0,0,0,0.14)',
  minWidth:       200,
  zIndex:         10000,
  overflow:       'hidden',
}

const itemStyle: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            12,
  width:          '100%',
  padding:        '10px 16px',
  background:     'transparent',
  border:         'none',
  cursor:         'pointer',
  textAlign:      'left',
  fontFamily:     '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
  transition:     'background 0.1s',
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="6" cy="6" r="5" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
      <path d="M6 1a5 5 0 0 1 5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
