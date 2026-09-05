import type { CSSProperties } from 'react'
import type { Severity } from '../../analysis'

export const SEVERITY_COLOR: Record<Severity, string> = {
  error:   '#d13212',
  warning: '#b7791f',
  info:    '#0073bb',
}

/** Ring drawn around a node the validation rules flagged. `outline` is used
 *  deliberately: `border` would shift the node's box, and `boxShadow` is
 *  already carrying the selection state on both node components. */
export function severityOutline(severity: Severity | undefined): CSSProperties {
  if (!severity) return {}
  return {
    outline: `2px solid ${SEVERITY_COLOR[severity]}`,
    outlineOffset: 2,
  }
}
