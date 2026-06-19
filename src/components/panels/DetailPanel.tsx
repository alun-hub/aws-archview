import type { GraphNode } from '../../parser'

const KIND_LABEL: Record<string, string> = {
  root:           'Organization Root',
  ou:             'Organizational Unit',
  account:        'AWS Account',
  vpc:            'VPC',
  subnet:         'Subnet',
  tgw:            'Transit Gateway',
  'tgw-rt-group': 'Route Table Group',
  'tgw-rt':       'TGW Route Table',
  vpn:            'VPN Connection',
  cgw:            'Customer Gateway',
  igw:            'Internet Gateway',
  'on-premises':  'On-Premises',
  service:        'AWS Service',
}

const KIND_COLOR: Record<string, string> = {
  root:           '#E7157B',
  ou:             '#E7157B',
  account:        '#FF9900',
  'management-account': '#FF9900',
  vpc:            '#8C4FFF',
  tgw:            '#6B3FA0',
  'tgw-rt-group': '#6B3FA0',
  'tgw-rt':       '#6B3FA0',
  vpn:            '#CC7700',
  cgw:            '#CC7700',
  igw:            '#007DB8',
  'on-premises':  '#5A5A5A',
}

// Human-readable labels for known data keys
const FIELD_LABEL: Record<string, string> = {
  kind:             'Type',
  account:          'Account',
  region:           'Region',
  asn:              'ASN',
  cidrs:            'CIDRs',
  internetGateway:  'Internet Gateway',
  subnets:          'Subnets',
  azs:              'Availability Zones',
  ip:               'IP Address',
  staticRoutes:     'Static Routes Only',
  tgw:              'Transit Gateway',
  routeTables:      'Route Tables',
  associations:     'Associations',
  propagatesFrom:   'Propagations (from)',
  sublabel:         'Account',
}

// Keys to skip from raw data (shown separately or irrelevant)
const SKIP_KEYS = new Set(['kind'])

interface Props {
  node: GraphNode | null
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null

  if (Array.isArray(value)) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          {label}
        </div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {(value as unknown[]).map((item, i) => (
            <li key={i} style={{ fontSize: 12, color: '#232F3E', marginBottom: 2 }}>
              {String(item)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#232F3E', wordBreak: 'break-all' }}>
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

  const color = KIND_COLOR[node.kind] ?? '#232F3E'

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
        {KIND_LABEL[node.kind] ?? node.kind}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#232F3E', marginBottom: 12 }}>
        {node.label}
      </div>
      {Object.entries(node.data)
        .filter(([k]) => !SKIP_KEYS.has(k))
        .map(([k, v]) => (
          <Row key={k} label={FIELD_LABEL[k] ?? k} value={v} />
        ))}
      {node.parentId && (
        <Row label="Parent" value={node.parentId.replace(/^(account|vpc|ou):/, '')} />
      )}
    </div>
  )
}
