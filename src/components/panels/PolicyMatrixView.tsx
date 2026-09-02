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
  onNavigate: (nodeId: string) => void
}

export function PolicyMatrixView({ matrix, onNavigate }: Props) {
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

  const ROW_H  = 34
  const COL_W  = 108
  const LEFT_W = 240

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#fff', fontFamily: FONT }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky', top: 0, left: 0, zIndex: 3,
                background: '#fff', borderBottom: '2px solid #232F3E', borderRight: '2px solid #232F3E',
                width: LEFT_W, minWidth: LEFT_W, padding: '8px 12px', textAlign: 'left',
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
                    width: COL_W, minWidth: COL_W, maxWidth: COL_W,
                    padding: '6px 4px', verticalAlign: 'bottom',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: g.dot, letterSpacing: 0.3 }}>{g.label}</span>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 600, color: '#414d5c',
                        whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center', lineHeight: 1.25,
                      }}
                    >
                      {col.name}
                    </span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.id}>
              <td
                style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  background: '#fff', borderRight: '2px solid #232F3E', borderBottom: '1px solid #f0f0f0',
                  height: ROW_H, padding: 0,
                }}
              >
                <button
                  onClick={() => onNavigate(row.id)}
                  title="Open in Organization view"
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', height: ROW_H,
                    padding: `0 12px 0 ${12 + row.depth * 16}px`,
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontFamily: FONT, fontSize: row.kind === 'ou' ? 12 : 11.5,
                    fontWeight: row.kind === 'ou' ? 700 : 400,
                    color: row.kind === 'ou' ? '#232F3E' : '#414d5c',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f7ff')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
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
                    borderLeft: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
                    textAlign: 'center',
                  }}
                >
                  <Cell state={row.cells[col.key]} color={GROUP[col.type].dot} />
                </td>
              ))}
            </tr>
          ))}
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
        <span>Click a row to open that node in the Organization view.</span>
      </div>
    </div>
  )
}
