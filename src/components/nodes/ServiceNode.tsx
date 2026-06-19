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
        justifyContent: 'center',
        gap: 6,
        padding: '10px 8px 8px',
        borderRadius: 10,
        background: selected ? 'rgba(74,144,217,0.10)' : 'rgba(255,255,255,0.7)',
        border: selected ? '2px solid #4a90d9' : '1.5px solid rgba(200,200,200,0.6)',
        boxShadow: selected
          ? '0 0 0 3px rgba(74,144,217,0.25), 0 2px 8px rgba(0,0,0,0.1)'
          : '0 1px 4px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        minWidth: 80,
        minHeight: 90,
      }}
    >
      <AwsIcon kind={d.kind as IconKind} size={56} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#232F3E',
          textAlign: 'center',
          fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          lineHeight: 1.3,
          maxWidth: 88,
          wordBreak: 'break-word',
        }}
      >
        {d.label}
      </div>
      {d.sublabel && (
        <div style={{ fontSize: 9, color: '#888', fontFamily: 'monospace', textAlign: 'center' }}>
          {d.sublabel}
        </div>
      )}

      <Handle type="source" position={Position.Top}    id="top-s"    style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top}    id="top-t"    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left}   id="left-s"   style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   id="left-t"   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right-s"  style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right}  id="right-t"  style={{ opacity: 0 }} />
    </div>
  )
}
