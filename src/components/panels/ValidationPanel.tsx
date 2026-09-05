import { useMemo, useState } from 'react'
import type { Finding, Severity } from '../../analysis'
import { SEVERITY_COLOR } from '../canvas/severityStyle'

const SEVERITY_LABEL: Record<Severity, string> = {
  error:   'Errors',
  warning: 'Warnings',
  info:    'Info',
}

const SEVERITY_GLYPH: Record<Severity, string> = {
  error:   '✕',
  warning: '!',
  info:    'i',
}

const SEVERITIES: Severity[] = ['error', 'warning', 'info']

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
  findings: Finding[]
  /** Whether the config set is loaded enough for "no findings" to mean
   *  anything — with no files there is simply nothing to validate. */
  hasConfigs: boolean
  onSelect(finding: Finding): void
}

export function ValidationPanel({ findings, hasConfigs, onSelect }: Props) {
  // Errors open by default: they are the reason someone opens this panel.
  const [openSeverities, setOpenSeverities] = useState<Set<Severity>>(new Set<Severity>(['error']))

  const grouped = useMemo(() => {
    const map = new Map<Severity, Finding[]>()
    for (const s of SEVERITIES) map.set(s, [])
    for (const f of findings) map.get(f.severity)!.push(f)
    return map
  }, [findings])

  if (!hasConfigs) {
    return (
      <div style={{ padding: '6px 12px 10px', fontSize: 12, color: '#888', fontFamily: FONT }}>
        Load configuration files to run validation.
      </div>
    )
  }

  if (findings.length === 0) {
    return (
      <div style={{ padding: '6px 12px 10px', fontSize: 12, color: '#248814', fontFamily: FONT }}>
        ✓ No issues found in the loaded configuration.
      </div>
    )
  }

  const toggle = (s: Severity) =>
    setOpenSeverities((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  return (
    <div style={{ padding: '2px 8px 10px', fontFamily: FONT }}>
      {SEVERITIES.map((severity) => {
        const list = grouped.get(severity)!
        if (list.length === 0) return null
        const open = openSeverities.has(severity)
        return (
          <div key={severity} style={{ marginBottom: 4 }}>
            <button
              onClick={() => toggle(severity)}
              aria-expanded={open}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                width: '100%',
                padding: '5px 4px',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
                {list.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onSelect(f)}
                    title={f.nodeIds.length > 0 ? 'Show on the diagram' : `Defined in ${f.configFile ?? 'the loaded configuration'}`}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderLeft: `3px solid ${SEVERITY_COLOR[f.severity]}`,
                      borderRadius: '0 4px 4px 0',
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{f.title}</div>
                    <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4, marginTop: 2 }}>{f.detail}</div>
                    {f.configFile && (
                      <div style={{ fontSize: 10, color: '#999', marginTop: 3, fontFamily: 'monospace' }}>
                        {f.configFile}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
