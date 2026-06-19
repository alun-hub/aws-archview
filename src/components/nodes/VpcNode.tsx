import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon } from '../../icons/AwsIcon'

export interface VpcNodeData {
  label: string
  account?: string
  region?: string
  cidrs?: string[]
  internetGateway?: boolean
  [key: string]: unknown
}

export function VpcNode({ data, selected }: NodeProps) {
  const d = data as VpcNodeData
  return (
    <div
      style={{
        background: selected ? '#f5f0ff' : '#fff',
        border: `2px solid #8C4FFF`,
        borderRadius: 8,
        padding: '8px 14px 8px 10px',
        minWidth: 180,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: selected ? '0 0 0 2px #8C4FFF55' : '0 1px 4px #0002',
        fontFamily: 'sans-serif',
      }}
    >
      <AwsIcon kind="vpc" size={28} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1a' }}>{d.label}</div>
        <div style={{ fontSize: 10, color: '#888' }}>
          {d.region} · {d.account}
        </div>
        {d.cidrs?.[0] && (
          <div style={{ fontSize: 10, color: '#8C4FFF', fontFamily: 'monospace' }}>{d.cidrs[0]}</div>
        )}
      </div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
