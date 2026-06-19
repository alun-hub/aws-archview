import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon } from '../../icons/AwsIcon'

export interface OUNodeData {
  label: string
  kind: 'root' | 'ou'
  [key: string]: unknown
}

export function OUNode({ data, selected }: NodeProps) {
  const d = data as OUNodeData
  return (
    <div
      style={{
        background: selected ? '#f0f4ff' : '#fff',
        border: `2px solid ${d.kind === 'root' ? '#E7157B' : '#8C4FFF'}`,
        borderRadius: 8,
        padding: '8px 14px 8px 10px',
        minWidth: 140,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: selected ? '0 0 0 2px #8C4FFF55' : '0 1px 4px #0002',
        fontFamily: 'sans-serif',
      }}
    >
      <AwsIcon kind={d.kind} size={28} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1a' }}>{d.label}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{d.kind === 'root' ? 'Organization Root' : 'Organizational Unit'}</div>
      </div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
