import type { CSSProperties } from 'react'
import type { Severity } from '../../analysis'

export const SEVERITY_COLOR: Record<Severity, string> = {
  error:   '#d13212',
  warning: '#b7791f',
  info:    '#0073bb',
}

export const SEVERITY_GLYPH: Record<Severity, string> = {
  error:   '✕',
  warning: '!',
  info:    'i',
}

export const SEVERITY_WORD: Record<Severity, string> = {
  error:   'Error',
  warning: 'Warning',
  info:    'Info',
}

/**
 * Ring drawn around a *leaf* node the validation rules flagged.
 *
 * Only for nodes that have no border of their own. On a container the ring sat
 * a couple of pixels outside the container's own border and read as a second
 * border rather than as an annotation — containers get a badge in their header
 * instead, alongside the SCP and DNS pills.
 */
export function severityOutline(severity: Severity | undefined): CSSProperties {
  if (!severity) return {}
  return {
    outline: `2px solid ${SEVERITY_COLOR[severity]}`,
    outlineOffset: 2,
  }
}
