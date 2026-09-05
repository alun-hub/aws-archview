import { useMemo, useRef } from 'react'
import { useConfig, useDispatch } from '../../store/configStore'
import { FILE_MAP, findIncludes, findUnresolvedReplacements, resolveConfigKey } from '../../parser'
import { SAMPLE_CONFIGS } from '../../parser/sampleConfigs'
import { useFileDrop } from '../../hooks/useFileDrop'

// Shared style for the parse-error / missing-file / unresolved-token callouts.
const noticeBase = { borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 11 }
const noticeError = { ...noticeBase, background: '#fdf0ee', border: '1px solid #f0b5ac', color: '#8b2c1e' }
const noticeWarn  = { ...noticeBase, background: '#fffbe6', border: '1px solid #ffe58f', color: '#7c5c00' }

export function ConfigLoader({ loadedFiles }: { loadedFiles: Record<string, string> }) {
  const dispatch    = useDispatch()
  const { parseErrors } = useConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { processFiles, handleFolderSelect, onDrop, fromFileList } = useFileDrop(dispatch)

  const loadSample = () => {
    for (const [filename, content] of Object.entries(SAMPLE_CONFIGS)) {
      dispatch({ type: 'SET_FILE', filename, content })
    }
  }

  // Detect !include references that aren't yet loaded
  const unresolvedIncludes = useMemo(() => {
    const missing: string[] = []
    for (const content of Object.values(loadedFiles)) {
      for (const path of findIncludes(content, loadedFiles)) {
        const basename = path.split('/').pop()!
        const found = Object.keys(loadedFiles).some(
          (k) => k === path || k === basename || k.split('/').pop() === basename,
        )
        if (!found && !missing.includes(basename)) missing.push(basename)
      }
    }
    return missing
  }, [loadedFiles])

  // {{ TOKEN }} placeholders in !include paths that aren't defined in
  // replacements-config.yaml — the usual reason a whole batch of includes
  // shows up as "missing" with templated-looking names.
  const unresolvedReplacements = useMemo(
    () => findUnresolvedReplacements(loadedFiles),
    [loadedFiles],
  )

  const hasFiles = Object.keys(loadedFiles).length > 0

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '16px 0' }}>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #ccc',
          borderRadius: 8,
          padding: '20px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: '#fafafa',
          color: '#555',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop YAML files or folder here</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: 11, color: '#aaa' }}>
          <span
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
            style={{ textDecoration: 'underline', cursor: 'pointer' }}
          >
            Select files
          </span>
          <span>·</span>
          <span
            onClick={handleFolderSelect}
            style={{ textDecoration: 'underline', cursor: 'pointer' }}
          >
            Select folder
          </span>
          <span>·</span>
          <span
            onClick={(e) => { e.stopPropagation(); loadSample() }}
            title="Load a small built-in LZA config so you can try every view without your own files"
            style={{ textDecoration: 'underline', cursor: 'pointer' }}
          >
            Try a sample config
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.txt,.rules,.json"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => processFiles(fromFileList(Array.from(e.target.files ?? [])))}
        />
      </div>

      {/* Clear button */}
      {hasFiles && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={() => dispatch({ type: 'CLEAR_FILES' })}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: '#c0392b',
              padding: '2px 4px',
              borderRadius: 3,
              fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#fdf0ee')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Parse errors */}
      {Object.keys(parseErrors).length > 0 && (
        <div style={noticeError}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Files that failed to parse:</div>
          {Object.entries(parseErrors).map(([f, msg]) => (
            <div key={f} style={{ marginBottom: 4 }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>✗ {f}</div>
              <div style={{ opacity: 0.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Unresolved replacement tokens — explains templated "missing" names */}
      {unresolvedReplacements.length > 0 && (
        <div style={noticeWarn}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Unresolved replacements:</div>
          <div style={{ marginBottom: 4, opacity: 0.85 }}>
            These <code>{'{{ }}'}</code> tokens in <code>!include</code> paths have no value —
            add them to <code>replacements-config.yaml</code> (and make sure that file is loaded).
          </div>
          {unresolvedReplacements.map((k) => (
            <div key={k} style={{ fontFamily: 'monospace', opacity: 0.85 }}>↳ {'{{ '}{k}{' }}'}</div>
          ))}
        </div>
      )}

      {/* Unresolved include warnings */}
      {unresolvedIncludes.length > 0 && (
        <div style={noticeWarn}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Missing included files:</div>
          {unresolvedIncludes.map((f) => (
            <div key={f} style={{ fontFamily: 'monospace', opacity: 0.85 }}>↳ {f}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Separate from the drop zone so the caller can place the (often long) file
// list somewhere else in the layout — e.g. lower down, below Diagram Tools.
export function ConfigFileList({ loadedFiles }: { loadedFiles: Record<string, string> }) {
  // Keys in loadedFiles may carry a folder prefix (e.g. "MyLZA/organization-config.yaml")
  // when a config folder was dropped or selected, so match top-level config files by
  // basename via resolveConfigKey rather than an exact key match.
  const expectedFiles  = Object.keys(FILE_MAP)
  const auxiliaryFiles = Object.keys(loadedFiles).filter((f) => resolveConfigKey(f) == null)

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {/* Expected config files */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>
        Expected files
      </div>
      {expectedFiles.map((f) => {
        const loaded = Object.keys(loadedFiles).some((k) => resolveConfigKey(k) === FILE_MAP[f])
        return (
          <div
            key={f}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 0',
              fontSize: 12,
              borderBottom: '1px solid #f0f0f0',
              color: loaded ? '#248814' : '#aaa',
            }}
          >
            <span style={{ fontSize: 14 }}>{loaded ? '✓' : '○'}</span>
            <span style={{ fontFamily: 'monospace' }}>{f}</span>
          </div>
        )
      })}

      {/* Auxiliary / included files */}
      {auxiliaryFiles.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6, marginTop: 14 }}>
            Included files
          </div>
          {auxiliaryFiles.map((f) => (
            <div
              key={f}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                fontSize: 12,
                borderBottom: '1px solid #f0f0f0',
                color: '#1A6CAE',
              }}
            >
              <span style={{ fontSize: 14 }}>↳</span>
              <span style={{ fontFamily: 'monospace' }}>{f}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
