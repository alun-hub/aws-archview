import { useMemo, useState } from 'react'
import type { Finding, Severity } from '../../analysis'
import type { ViewKind } from '../../parser'
import { SEVERITY_COLOR, SEVERITY_GLYPH } from '../canvas/severityStyle'

const SEVERITY_LABEL: Record<Severity, string> = {
  error:   'Errors',
  warning: 'Warnings',
  info:    'Info',
}

const SEVERITIES: Severity[] = ['error', 'warning', 'info']

/** Matches the navigation panel's text column in App.tsx, so the severity
 *  groups and findings line up with every other label around them. Finding
 *  rows are full-bleed like the view buttons, with their severity accent
 *  sitting in the gutter. */
const GUTTER = 20

const FONT = '"Amazon Ember", "Helvetica Neue", Arial, sans-serif'

/** Small round severity marker, reused for the group headers and each row. */
export function SeverityDot({ severity, size = 14 }: { severity: Severity; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: SEVERITY_COLOR[severity],
        color: '#fff',
        fontSize: size * 0.64,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {SEVERITY_GLYPH[severity]}
    </span>
  )
}

interface Props {
  /** Every finding in the config set; the panel decides what to show. */
  findings: Finding[]
  activeView: ViewKind
  viewLabels: Record<ViewKind, string>
  /** Whether the config set is loaded enough for "no findings" to mean
   *  anything — with no files there is simply nothing to validate. */
  hasConfigs: boolean
  /** Set by clicking a node's badge on the diagram, so the badge can answer
   *  "which finding is this?" rather than just saying one exists. */
  focusNodeId: string | null
  focusNodeLabel: string | null
  onClearFocus(): void
  onSelect(finding: Finding): void
}

const chromeButton = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px',
  fontSize: 11,
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: FONT,
  border: `1px solid ${active ? '#0073bb' : '#d5dbdb'}`,
  background: active ? 'rgba(0,115,187,0.10)' : '#fff',
  color: active ? '#0073bb' : '#5f6b7a',
  fontWeight: active ? 700 : 400,
})

function bySeverity(list: Finding[]): Map<Severity, Finding[]> {
  const map = new Map<Severity, Finding[]>()
  for (const s of SEVERITIES) map.set(s, [])
  for (const f of list) map.get(f.severity)!.push(f)
  return map
}

function worstOf(list: Finding[]): Severity {
  if (list.some((f) => f.severity === 'error')) return 'error'
  if (list.some((f) => f.severity === 'warning')) return 'warning'
  return 'info'
}

function FindingRow({ finding, onSelect }: { finding: Finding; onSelect(f: Finding): void }) {
  return (
    <button
      onClick={() => onSelect(finding)}
      title={finding.nodeIds.length > 0 ? 'Show on the diagram' : `Defined in ${finding.configFile ?? 'the loaded configuration'}`}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: `6px ${GUTTER}px 6px ${GUTTER - 3}px`,
        background: 'transparent',
        border: 'none',
        borderLeft: `3px solid ${SEVERITY_COLOR[finding.severity]}`,
        borderRadius: '0 4px 4px 0',
        cursor: 'pointer',
        fontFamily: FONT,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{finding.title}</div>
      <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4, marginTop: 2 }}>{finding.detail}</div>
      {finding.configFile && (
        <div style={{ fontSize: 10, color: '#999', marginTop: 3, fontFamily: 'monospace' }}>
          {finding.configFile}
        </div>
      )}
    </button>
  )
}

/** One severity group: a header with a count, rows underneath when open. */
function SeverityGroup({ severity, list, open, onToggle, onSelect, indent }: {
  severity: Severity
  list: Finding[]
  open: boolean
  onToggle(): void
  onSelect(f: Finding): void
  indent: number
}) {
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          width: '100%',
          padding: `5px ${GUTTER}px 5px ${GUTTER + indent}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 700,
          color: '#414d5c',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 9, color: '#888', width: 8 }}>{open ? '▼' : '▶'}</span>
        <SeverityDot severity={severity} />
        <span>{SEVERITY_LABEL[severity]}</span>
        <span style={{ color: '#999', fontWeight: 400 }}>({list.length})</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.map((f) => <FindingRow key={f.id} finding={f} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

export function ValidationPanel({
  findings, activeView, viewLabels, hasConfigs, focusNodeId, focusNodeLabel, onClearFocus, onSelect,
}: Props) {
  // Scoped to the current view by default. A count in the navigation that does
  // not match the list under it is worse than no count at all — you cannot
  // tell which of 38 findings the "14" beside Network refers to.
  const [showAll, setShowAll] = useState(false)
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set(['error']))
  const [openViews, setOpenViews] = useState<Set<ViewKind>>(new Set())

  const inView = useMemo(() => findings.filter((f) => f.view === activeView), [findings, activeView])
  const focused = useMemo(
    () => (focusNodeId ? findings.filter((f) => f.nodeIds.includes(focusNodeId)) : []),
    [findings, focusNodeId],
  )
  const byView = useMemo(() => {
    const map = new Map<ViewKind, Finding[]>()
    for (const f of findings) {
      const list = map.get(f.view)
      if (list) list.push(f)
      else map.set(f.view, [f])
    }
    return map
  }, [findings])

  if (!hasConfigs) {
    return (
      <div style={{ padding: `6px ${GUTTER}px 10px`, fontSize: 12, color: '#888', fontFamily: FONT }}>
        Load configuration files to run validation.
      </div>
    )
  }

  if (findings.length === 0) {
    return (
      <div style={{ padding: `6px ${GUTTER}px 10px`, fontSize: 12, color: '#248814', fontFamily: FONT }}>
        ✓ No issues found in the loaded configuration.
      </div>
    )
  }

  const visible = focusNodeId ? focused : showAll ? findings : inView

  const toggleKey = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleView = (view: ViewKind) =>
    setOpenViews((prev) => {
      const next = new Set(prev)
      if (next.has(view)) next.delete(view)
      else next.add(view)
      return next
    })

  return (
    <div style={{ padding: '2px 0 10px', fontFamily: FONT }}>
      {/* Scope */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `2px ${GUTTER}px 8px`, flexWrap: 'wrap' }}>
        {focusNodeId ? (
          <button
            onClick={onClearFocus}
            title="Back to the findings for this whole view"
            style={{ ...chromeButton(true), display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}
          >
            <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {focusNodeLabel ?? 'Selected node'}
            </span>
            <span style={{ opacity: 0.7 }}>✕</span>
          </button>
        ) : (
          <>
            <button onClick={() => setShowAll(false)} style={chromeButton(!showAll)}>
              {viewLabels[activeView]} ({inView.length})
            </button>
            <button onClick={() => setShowAll(true)} style={chromeButton(showAll)}>
              All ({findings.length})
            </button>
          </>
        )}
      </div>

      {visible.length === 0 && (
        <div style={{ padding: `2px ${GUTTER}px 8px`, fontSize: 12, color: '#248814' }}>
          {focusNodeId
            ? '✓ Nothing reported for this node.'
            : `✓ Nothing to report in ${viewLabels[activeView]}.`}
        </div>
      )}

      {/* One node, or one view: severity groups only. */}
      {(focusNodeId || !showAll) && SEVERITIES.map((severity) => {
        const list = bySeverity(visible).get(severity)!
        if (list.length === 0) return null
        return (
          <SeverityGroup
            key={severity}
            severity={severity}
            list={list}
            // A focused node has a handful of findings — open them rather than
            // making someone expand a group to reach the one they clicked.
            open={focusNodeId ? true : openKeys.has(severity)}
            onToggle={() => toggleKey(severity)}
            onSelect={onSelect}
            indent={0}
          />
        )
      })}

      {/* Everything: view → severity → findings, so the full set reads as a
          tree you can walk instead of one long undifferentiated list. */}
      {!focusNodeId && showAll && [...byView.entries()]
        .sort(([a], [b]) => viewLabels[a].localeCompare(viewLabels[b]))
        .map(([view, list]) => {
          const open = openViews.has(view) || view === activeView
          return (
            <div key={view} style={{ marginBottom: 4 }}>
              <button
                onClick={() => toggleView(view)}
                aria-expanded={open}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                  padding: `6px ${GUTTER}px`, background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 700,
                  color: view === activeView ? '#0073bb' : '#232F3E', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 9, color: '#888', width: 8 }}>{open ? '▼' : '▶'}</span>
                <SeverityDot severity={worstOf(list)} size={11} />
                <span>{viewLabels[view]}</span>
                <span style={{ color: '#999', fontWeight: 400 }}>({list.length})</span>
              </button>
              {open && SEVERITIES.map((severity) => {
                const rows = bySeverity(list).get(severity)!
                if (rows.length === 0) return null
                const key = `${view}:${severity}`
                return (
                  <SeverityGroup
                    key={key}
                    severity={severity}
                    list={rows}
                    open={openKeys.has(key) || (view === activeView && severity === 'error')}
                    onToggle={() => toggleKey(key)}
                    onSelect={onSelect}
                    indent={14}
                  />
                )
              })}
            </div>
          )
        })}
    </div>
  )
}
