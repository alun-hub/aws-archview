import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AwsIcon, type IconKind } from '../../icons/AwsIcon'
import { useHighlight } from '../canvas/HighlightContext'
import { SEVERITY_COLOR, severityOutline } from '../canvas/severityStyle'
import { useDispatch } from '../../store/configStore'

export interface ServiceNodeData {
  label: string
  kind: string
  service?: string
  sublabel?: string
  [key: string]: unknown
}

export function ServiceNode({ id, data, selected }: NodeProps) {
  const d = data as ServiceNodeData
  const { dimmedNodeIds, severityByNodeId } = useHighlight()
  const dimmed = dimmedNodeIds.has(id)
  const findings = severityByNodeId.get(id)
  const severity = findings?.severity
  const dispatch = useDispatch()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        height: '100%',
        opacity: dimmed ? 0.2 : 1,
        transition: 'opacity 0.15s',
        cursor: 'pointer',
      }}
    >
      {/* Icon Wrapper with AWS selection indicator border/glow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 4,
          borderRadius: 8,
          border: selected ? '2px solid #4a90d9' : '2px solid transparent',
          background: selected ? 'rgba(74,144,217,0.10)' : 'transparent',
          boxShadow: selected ? '0 0 0 3px rgba(74,144,217,0.25)' : 'none',
          transition: 'all 0.15s',
          boxSizing: 'border-box' as const,
          flexShrink: 0,
          position: 'relative',
          ...severityOutline(severity),
        }}
      >
        <AwsIcon kind={d.kind as IconKind} service={d.service as string} size={52} />
        {/* The ring says something is wrong; this says what. */}
        {findings && (
          <button
            className="nodrag"
            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_VALIDATION_FOCUS', id }) }}
            title={`${findings.count} validation finding${findings.count === 1 ? '' : 's'} — click to list them`}
            aria-label={`${findings.count} validation findings`}
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 14,
              height: 14,
              padding: 0,
              borderRadius: '50%',
              border: '1.5px solid #fff',
              cursor: 'pointer',
              background: SEVERITY_COLOR[findings.severity],
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
          />
        )}
      </div>

      {/* Main Label below the icon */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#232F3E',
          textAlign: 'center',
          fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          lineHeight: 1.3,
          maxWidth: 96,
          wordBreak: 'break-word',
        }}
      >
        {d.label}
      </div>

      {/* Sublabel below the main label */}
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
