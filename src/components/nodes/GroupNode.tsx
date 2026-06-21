import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, type IconKind } from '../../icons/AwsIcon'
import { kindBackground, kindBorderColor } from '../../icons/awsIconStyles'
import { useHighlight } from '../canvas/HighlightContext'

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

export function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as GroupNodeData
  const border = kindBorderColor(d.kind)
  const bg = kindBackground(d.kind)
  const { dimmedNodeIds } = useHighlight()
  const dimmed = dimmedNodeIds.has(id)

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
        borderRadius: 0,
        opacity: dimmed ? 0.2 : 1,
        background: selected
          ? `linear-gradient(${bg.replace(/0\.\d+\)/, '0.15)')}, ${bg.replace(/0\.\d+\)/, '0.15)')}), #ffffff`
          : `linear-gradient(${bg}, ${bg}), #ffffff`,
        position: 'relative',
        boxSizing: 'border-box',
        boxShadow: selected
          ? `0 0 0 3px ${border}44`
          : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s, opacity 0.2s',
      }}
    >
      {isSubnet ? (
        <div
          style={{
            position: 'absolute',
            top: -9,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '0 6px',
              fontSize: 11,
              fontWeight: 700,
              color: '#1a1a1a',
              fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {d.label}
          </div>
          {(d.cidr || d.sublabel || d.az) && (
            <div
              style={{
                fontSize: 9,
                color: '#666',
                marginTop: 1,
                background: '#fff',
                padding: '0 4px',
                whiteSpace: 'nowrap',
                fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
              }}
            >
              {d.cidr || d.sublabel} {d.az ? `[${d.az.toUpperCase()}]` : ''}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Top-left square badge containing the white icon */}
          <div
            style={{
              position: 'absolute',
              top: -2,
              left: -2,
              width: 24,
              height: 24,
              background: border,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <AwsIcon kind={d.kind as IconKind} size={16} style={{ filter: 'brightness(0) invert(1)' }} />
          </div>

          {/* Top-right text sitting on the border with a white background to mask it */}
          <div
            style={{
              position: 'absolute',
              top: -9,
              right: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              zIndex: 2,
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: '0 6px',
                fontSize: 11,
                fontWeight: 700,
                color: '#1a1a1a',
                fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {getHeaderText()}
            </div>
            {Array.isArray(d.scps) && d.scps.length > 0 && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: '#232F3E',
                  color: '#fff',
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 9,
                  fontWeight: 800,
                  border: '1px solid rgba(255,255,255,0.25)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                }}
                title={`${d.scps.length} SCP active`}
              >
                <AwsIcon kind="scp" size={10} style={{ filter: 'brightness(0) invert(1)' }} />
                <span>{d.scps.length} SCP</span>
              </div>
            )}
          </div>
        </>
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
