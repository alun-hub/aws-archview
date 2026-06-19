import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, kindBackground, kindBorderColor, type IconKind } from '../../icons/AwsIcon'

export interface GroupNodeData {
  label: string
  kind: string
  sublabel?: string
  dashed?: boolean
  [key: string]: unknown
}

export function GroupNode({ data, selected, width, height }: NodeProps) {
  const d = data as GroupNodeData
  const border = kindBorderColor(d.kind)
  const bg = kindBackground(d.kind)
  const autoDash = d.dashed || d.kind === 'subnet-tgw' || d.kind === 'subnet-firewall'

  return (
    <div
      style={{
        width: width ?? 200,
        height: height ?? 80,
        border: `${autoDash ? '1.5px dashed' : '2px solid'} ${border}`,
        borderRadius: 8,
        background: selected ? bg.replace(/0\.\d+\)/, '0.14)') : bg,
        position: 'relative',
        boxSizing: 'border-box',
        boxShadow: selected ? `0 0 0 2px ${border}44` : 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Top-left label */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 1,
        }}
      >
        <AwsIcon kind={d.kind as IconKind} size={22} />
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: border,
              fontFamily: '"Amazon Ember", "Helvetica Neue", sans-serif',
              lineHeight: 1.2,
            }}
          >
            {d.label}
          </div>
          {d.sublabel && (
            <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>
              {d.sublabel}
            </div>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
