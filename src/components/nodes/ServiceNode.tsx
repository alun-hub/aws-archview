import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, type IconKind } from '../../icons/AwsIcon'

export interface ServiceNodeData {
  label: string
  kind: string
  sublabel?: string
  [key: string]: unknown
}

export function ServiceNode({ data, selected }: NodeProps) {
  const d = data as ServiceNodeData

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderRadius: 8,
        background: selected ? '#f0f4ff' : 'transparent',
        border: selected ? '1.5px solid #4a90d9' : '1.5px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.15s',
        minWidth: 72,
      }}
    >
      <AwsIcon kind={d.kind as IconKind} size={48} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#232F3E',
          textAlign: 'center',
          fontFamily: '"Amazon Ember", "Helvetica Neue", sans-serif',
          lineHeight: 1.3,
          maxWidth: 90,
        }}
      >
        {d.label}
      </div>
      {d.sublabel && (
        <div style={{ fontSize: 10, color: '#888', fontFamily: 'monospace', textAlign: 'center' }}>
          {d.sublabel}
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
