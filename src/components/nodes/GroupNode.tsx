import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, type IconKind } from '../../icons/AwsIcon'
import { kindBackground, kindBorderColor } from '../../icons/awsIconStyles'

export interface GroupNodeData {
  label: string
  kind: string
  cidr?: string
  az?: string
  sublabel?: string
  cidrs?: string[]
  email?: string
  [key: string]: unknown
}

export function GroupNode({ data, selected }: NodeProps) {
  const d = data as GroupNodeData
  const border = kindBorderColor(d.kind)
  const bg = kindBackground(d.kind)

  const isSubnet = d.kind.startsWith('subnet')
  const isDashed =
    d.dashed ||
    d.kind === 'root' ||
    d.kind === 'on-premises' ||
    isSubnet
  const borderStyle = isDashed ? 'dashed' : 'solid'

  const getHeaderText = () => {
    if (d.kind === 'vpc') {
      const firstCidr = Array.isArray(d.cidrs) && d.cidrs.length > 0
        ? d.cidrs[0]
        : (typeof d.cidr === 'string' ? d.cidr : '')
      return `${d.label}${firstCidr ? ` (${firstCidr})` : ''}`
    }
    if (d.kind === 'account' || d.kind === 'management-account') {
      return d.label
    }
    return d.label
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: `2px ${borderStyle} ${border}`,
        borderRadius: 8,
        background: selected ? bg.replace(/0\.\d+\)/, '0.15)') : bg,
        position: 'relative',
        boxSizing: 'border-box',
        boxShadow: selected
          ? `0 0 0 3px ${border}44`
          : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
      }}
    >
      {isSubnet ? (
        <div
          style={{
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <AwsIcon kind={d.kind as IconKind} size={22} />
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: border,
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {d.label}
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#666',
                lineHeight: 1.25,
                marginTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {d.cidr || d.sublabel} {d.az ? `[AZ: ${d.az.toUpperCase()}]` : ''}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: -2,
            background: border,
            color: '#fff',
            padding: '4px 10px',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 8,
            borderBottomLeftRadius: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
            whiteSpace: 'nowrap',
            zIndex: 2,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <AwsIcon kind={d.kind as IconKind} size={14} style={{ filter: 'brightness(0) invert(1)' }} />
          <span>{getHeaderText()}</span>
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
