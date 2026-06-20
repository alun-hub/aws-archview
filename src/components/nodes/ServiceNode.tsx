import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, type IconKind } from '../../icons/AwsIcon'
import { useHighlight } from '../canvas/HighlightContext'

export interface ServiceNodeData {
  label: string
  kind: string
  sublabel?: string
  [key: string]: unknown
}

export function ServiceNode({ id, data, selected }: NodeProps) {
  const d = data as ServiceNodeData
  const { dimmedNodeIds } = useHighlight()
  const dimmed = dimmedNodeIds.has(id)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        width: '100%',
        height: '100%',
        opacity: dimmed ? 0.2 : 1,
        transition: 'opacity 0.15s',
        cursor: 'pointer',
      }}
    >
      {/* White card — icon + label only */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 8px 8px',
          borderRadius: 10,
          background: selected ? 'rgba(74,144,217,0.10)' : 'rgba(255,255,255,0.85)',
          border: selected ? '2px solid #4a90d9' : '1.5px solid rgba(200,200,200,0.6)',
          boxShadow: selected
            ? '0 0 0 3px rgba(74,144,217,0.25), 0 2px 8px rgba(0,0,0,0.1)'
            : '0 1px 4px rgba(0,0,0,0.08)',
          width: '100%',
          boxSizing: 'border-box' as const,
          flexShrink: 0,
        }}
      >
        <AwsIcon kind={d.kind as IconKind} size={52} />
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
      </div>

      {/* Sublabel below the card — AWS-style */}
      {d.sublabel && (
        <div style={{
          fontSize: 9,
          color: '#666',
          fontFamily: 'monospace',
          textAlign: 'center',
          maxWidth: 104,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
          flexShrink: 0,
        }}>
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
