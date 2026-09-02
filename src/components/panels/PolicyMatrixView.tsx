import type { PolicyMatrix, PolicyColumnType, PolicyMatrixCellState } from '../../parser'

const FONT = '"Amazon Ember", "Helvetica Neue", Arial, sans-serif'

const GROUP: Record<PolicyColumnType, { bg: string; dot: string; label: string }> = {
  scp:     { bg: '#fdf0ee', dot: '#DD3B25', label: 'SCP' },
  tagging: { bg: '#eaf3fb', dot: '#1A6CAE', label: 'Tagging' },
  backup:  { bg: '#f3eefc', dot: '#6B3FA0', label: 'Backup' },
}

function Cell({ state, color }: { state: PolicyMatrixCellState; color: string }) {
  if (state === 'none') return null
  return (
    <span
      title={state === 'direct' ? 'Directly attached' : 'Inherited from an ancestor OU'}
      style={{
        display: 'inline-block',
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: state === 'direct' ? color : 'transparent',
        border: `1.5px solid ${color}`,
        opacity: state === 'direct' ? 1 : 0.6,
      }}
    />
  )
}

interface Props {
  matrix: PolicyMatrix | null
  selectedId?: string | null
  onSelect: (nodeId: string) => void
}

export function PolicyMatrixView({ matrix, selectedId, onSelect }: Props) {
  if (!matrix) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 12,
          color: '#888',
          fontFamily: FONT,
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, color: '#232F3E' }}>No policies to show</div>
        <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
          Load <b>organization-config.yaml</b> and <b>accounts-config.yaml</b> with at least one
          Service Control Policy, Tagging Policy, or Backup Policy defined.
        </div>
      </div>
    )
  }

  const ROW_H      = 34
  const COL_W      = 120
  const LEFT_W     = 240
  const NAME_LINES  = 3
  const NAME_LINE_H = 12.5
  const NAME_H      = Math.ceil(NAME_LINE_H * NAME_LINES) // reserved, so a 1-line name takes the same space as a 3-line one
  const HEADER_PAD_TOP = 8
  const HEADER_PAD_BOTTOM = 6
  const LABEL_H     = 11
  const LABEL_GAP   = 4
  const HEADER_H    = HEADER_PAD_TOP + LABEL_H + LABEL_GAP + NAME_H + HEADER_PAD_BOTTOM

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#fff', fontFamily: FONT }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky', top: 0, left: 0, zIndex: 3,
                background: '#fff', borderBottom: '2px solid #232F3E', borderRight: '2px solid #232F3E',
                width: LEFT_W, minWidth: LEFT_W, height: HEADER_H, padding: '8px 12px', textAlign: 'left',
                verticalAlign: 'bottom',
                fontSize: 11, fontWeight: 700, color: '#232F3E',
              }}
            >
              Organization
            </th>
            {matrix.columns.map((col) => {
              const g = GROUP[col.type]
              return (
                <th
                  key={col.key}
                  style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: g.bg, borderBottom: '2px solid #232F3E', borderLeft: '1px solid #e5e5e5',
                    width: COL_W, minWidth: COL_W, maxWidth: COL_W, height: HEADER_H,
                    padding: `${HEADER_PAD_TOP}px 4px ${HEADER_PAD_BOTTOM}px`,
                  }}
                >
                  {/* Both rows are top-aligned with a fixed-height name box
                      (not just line-clamped) so the type label sits at the
                      same y on every column, and short names don't get
                      pulled down to align with long, wrapped ones. */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: g.dot, letterSpacing: 0.3 }}>{g.label}</span>
                    <div style={{ height: NAME_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: '100%' }}>
                      <span
                        title={col.name}
                        style={{
                          fontSize: 10, fontWeight: 600, color: '#414d5c',
                          display: '-webkit-box',
                          WebkitLineClamp: NAME_LINES,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          wordBreak: 'break-word',
                          textAlign: 'center',
                          lineHeight: `${NAME_LINE_H}px`,
                        }}
                      >
                        {col.name}
                      </span>
                    </div>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const selected = row.id === selectedId
            const rowBg = selected ? '#eaf3fb' : '#fff'
            return (
              <tr key={row.id}>
                <td
                  style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    background: rowBg, borderRight: '2px solid #232F3E', borderBottom: '1px solid #f0f0f0',
                    height: ROW_H, padding: 0,
                  }}
                >
                  <button
                    onClick={() => onSelect(row.id)}
                    title="Show details"
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%', height: ROW_H,
                      padding: `0 12px 0 ${12 + row.depth * 16}px`,
                      background: rowBg, border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontFamily: FONT, fontSize: row.kind === 'ou' ? 12 : 11.5,
                      fontWeight: row.kind === 'ou' ? 700 : 400,
                      color: row.kind === 'ou' ? '#232F3E' : '#414d5c',
                    }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = '#f5f7ff' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = rowBg }}
                  >
                    {row.kind === 'account' && <span style={{ color: '#bbb', marginRight: 6 }}>↳</span>}
                    {row.label}
                  </button>
                </td>
                {matrix.columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      width: COL_W, minWidth: COL_W, maxWidth: COL_W, height: ROW_H,
                      background: rowBg,
                      borderLeft: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
                      textAlign: 'center',
                    }}
                  >
                    <Cell state={row.cells[col.key]} color={GROUP[col.type].dot} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 16px', borderTop: '1px solid #eee', fontSize: 11, color: '#666' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Cell state="direct" color="#666" /> Directly attached
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Cell state="inherited" color="#666" /> Inherited from an ancestor OU
        </span>
        <span>Click a row to see its details in the panel on the right.</span>
      </div>
    </div>
  )
}
