import type { TraceEndpoint, TraceHop, TraceResult } from '../../analysis/pathTrace'

function endpointLabel(e: TraceEndpoint | null): string {
  if (!e) return 'Click to pick…'
  return e.subnetName ? `${e.vpcName}/${e.subnetName}` : e.vpcName
}

const STATUS_COLOR: Record<TraceHop['status'], string> = {
  ok: '#248814',
  broken: '#d13212',
  caveat: '#8c6d00',
}

const STATUS_ICON: Record<TraceHop['status'], string> = {
  ok: '✓',
  broken: '✕',
  caveat: '!',
}

interface EndpointPickerProps {
  role: 'source' | 'destination'
  label: string
  endpoint: TraceEndpoint | null
  picking: boolean
  onPick(): void
  onClear(): void
}

function EndpointPicker({ role, label, endpoint, picking, onPick, onClear }: EndpointPickerProps) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#5f6b7a', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={onPick}
          aria-pressed={picking}
          style={{
            flex: 1,
            textAlign: 'left',
            padding: '6px 10px',
            fontSize: 12,
            borderRadius: 6,
            cursor: 'pointer',
            border: `1.5px solid ${picking ? '#0073bb' : '#d5dbdb'}`,
            background: picking ? 'rgba(0, 115, 187, 0.08)' : '#fff',
            color: endpoint ? '#232F3E' : '#888',
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          {picking ? `Picking ${role}…` : endpointLabel(endpoint)}
        </button>
        {endpoint && (
          <button
            onClick={onClear}
            aria-label={`Clear ${role}`}
            title={`Clear ${role}`}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

interface PathTracePanelProps {
  source: TraceEndpoint | null
  destination: TraceEndpoint | null
  picking: 'source' | 'destination' | null
  result: TraceResult | null
  onPick(role: 'source' | 'destination'): void
  onClearEndpoint(role: 'source' | 'destination'): void
  onClearAll(): void
  onSelectHop(nodeIds: string[]): void
}

/**
 * Traces whether traffic can flow between two VPCs or subnets by walking the
 * same route-table / TGW-attachment / peering chain LZA itself resolves —
 * see `analysis/pathTrace.ts`. Endpoints are picked by clicking VPC or
 * subnet nodes on the canvas rather than typed, since that is also how
 * everything else on this diagram is addressed.
 */
export function PathTracePanel({ source, destination, picking, result, onPick, onClearEndpoint, onClearAll, onSelectHop }: PathTracePanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <EndpointPicker
        role="source" label="Source"
        endpoint={source} picking={picking === 'source'}
        onPick={() => onPick('source')} onClear={() => onClearEndpoint('source')}
      />
      <EndpointPicker
        role="destination" label="Destination"
        endpoint={destination} picking={picking === 'destination'}
        onPick={() => onPick('destination')} onClear={() => onClearEndpoint('destination')}
      />

      {(source || destination) && (
        <button
          onClick={onClearAll}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#0073bb', cursor: 'pointer' }}
        >
          Clear trace
        </button>
      )}

      {result && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: result.forwardReachable
              ? (result.returnReachable ? '#eefaf0' : '#fff8e8')
              : '#fdf0ee',
            color: result.forwardReachable
              ? (result.returnReachable ? '#248814' : '#8c6d00')
              : '#d13212',
            border: `1px solid ${result.forwardReachable ? (result.returnReachable ? '#c3e6cb' : '#f0d98c') : '#f0b5ac'}`,
          }}>
            {result.summary}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {result.hops.map((hop, i) => (
              <button
                key={i}
                onClick={() => onSelectHop(hop.nodeIds)}
                disabled={hop.nodeIds.length === 0}
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  cursor: hop.nodeIds.length === 0 ? 'default' : 'pointer',
                  fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                }}
                onMouseEnter={(e) => { if (hop.nodeIds.length > 0) e.currentTarget.style.background = '#f5f7ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  background: STATUS_COLOR[hop.status],
                }}>
                  {STATUS_ICON[hop.status]}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{hop.title}</span>
                  <span style={{ fontSize: 11, color: '#666', lineHeight: 1.4 }}>{hop.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!result && (source || destination) && (
        <div style={{ fontSize: 11, color: '#888' }}>Pick both a source and a destination to trace between them.</div>
      )}
    </div>
  )
}
