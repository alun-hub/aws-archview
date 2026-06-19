import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, kindBackground, kindBorderColor, type IconKind } from '../../icons/AwsIcon'

export interface GroupNodeData {
  label: string
  kind: string
  sublabel?: string
  dashed?: boolean
  [key: string]: unknown
}

// Kinds that render as compact "leaf" containers (no children, centered layout)
const COMPACT_KINDS = new Set(['subnet-public', 'subnet-private', 'subnet-firewall', 'subnet-tgw'])

export function GroupNode({ data, selected, width, height }: NodeProps) {
  const d = data as GroupNodeData
  const border = kindBorderColor(d.kind)
  const bg = kindBackground(d.kind)
  const autoDash = d.dashed || d.kind === 'subnet-tgw' || d.kind === 'subnet-firewall' || d.kind === 'on-premises'
  const isCompact = COMPACT_KINDS.has(d.kind)
  const iconSize = isCompact ? 24 : 32

  return (
    <div
      style={{
        width: width ?? 200,
        height: height ?? 80,
        border: `${autoDash ? '2px dashed' : '2px solid'} ${border}`,
        borderRadius: 10,
        background: selected ? bg.replace(/0\.\d+\)/, '0.18)') : bg,
        position: 'relative',
        boxSizing: 'border-box',
        boxShadow: selected
          ? `0 0 0 3px ${border}55, 0 2px 8px rgba(0,0,0,0.12)`
          : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Label bar */}
      <div
        style={{
          position: 'absolute',
          top: isCompact ? 8 : 10,
          left: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          zIndex: 1,
        }}
      >
        <AwsIcon kind={d.kind as IconKind} size={iconSize} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: isCompact ? 11 : 13,
              fontWeight: 700,
              color: border,
              fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {d.label}
          </div>
          {d.sublabel && (
            <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace', marginTop: 1 }}>
              {d.sublabel}
            </div>
          )}
        </div>
      </div>

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
