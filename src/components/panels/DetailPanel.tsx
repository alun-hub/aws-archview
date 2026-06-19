import type { GraphNode } from '../../parser'

const kindLabel: Record<string, string> = {
  root: 'Organization Root',
  ou: 'Organizational Unit',
  account: 'AWS Account',
  vpc: 'VPC',
  subnet: 'Subnet',
  tgw: 'Transit Gateway',
  service: 'AWS Service',
}

const kindColor: Record<string, string> = {
  root: '#E7157B',
  ou: '#E7157B',
  account: '#FF9900',
  vpc: '#8C4FFF',
  subnet: '#248814',
  tgw: '#8C4FFF',
}

interface Props {
  node: GraphNode | null
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === '') return null
  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#232F3E', wordBreak: 'break-all', fontFamily: typeof value === 'object' ? 'monospace' : 'inherit' }}>
        {display}
      </div>
    </div>
  )
}

export function DetailPanel({ node }: Props) {
  if (!node) {
    return (
      <div style={{ color: '#aaa', fontSize: 12, fontFamily: 'sans-serif', padding: '8px 0' }}>
        Klicka på en nod i diagrammet för att se detaljer.
      </div>
    )
  }

  const color = kindColor[node.kind] ?? '#232F3E'

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div
        style={{
          display: 'inline-block',
          background: color,
          color: '#fff',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 10,
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {kindLabel[node.kind] ?? node.kind}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#232F3E', marginBottom: 12 }}>
        {node.label}
      </div>
      {Object.entries(node.data).map(([k, v]) => (
        <Row key={k} label={k} value={v} />
      ))}
      <Row label="Parent" value={node.parentId} />
    </div>
  )
}
