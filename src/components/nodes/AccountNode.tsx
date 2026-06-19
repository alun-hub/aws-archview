import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon } from '../../icons/AwsIcon'

export interface AccountNodeData {
  label: string
  email?: string
  description?: string
  [key: string]: unknown
}

export function AccountNode({ data, selected }: NodeProps) {
  const d = data as AccountNodeData
  return (
    <div
      style={{
        background: selected ? '#fff8f0' : '#fff',
        border: `2px solid #FF9900`,
        borderRadius: 8,
        padding: '8px 14px 8px 10px',
        minWidth: 160,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: selected ? '0 0 0 2px #FF990055' : '0 1px 4px #0002',
        fontFamily: 'sans-serif',
      }}
    >
      <AwsIcon kind="account" size={28} />
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{d.label}</div>
        {d.email && (
          <div style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
            {d.email}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
