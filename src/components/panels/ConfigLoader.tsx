import { useMemo, useRef } from 'react'
import { useConfig, useDispatch } from '../../store/configStore'
import { FILE_MAP, findIncludes, findUnresolvedReplacements, resolveConfigKey } from '../../parser'
import { SAMPLE_CONFIGS } from '../../parser/sampleConfigs'
import { useFileDrop } from '../../hooks/useFileDrop'

// Callout pointing at the Validation panel, where loading problems are now
// reported alongside every other finding.
const noticeWarn = {
  borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 11,
  background: '#fffbe6', border: '1px solid #ffe58f', color: '#7c5c00',
}

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

  // How many findings concern getting the files in rather than what is in
  // them — the ones a user fixes right here at the drop zone.
  const problemCount = useMemo(() => {
    const missingIncludes = new Set<string>()
    for (const content of Object.values(loadedFiles)) {
      for (const path of findIncludes(content, loadedFiles)) {
        const basename = path.split('/').pop()!
        const found = Object.keys(loadedFiles).some(
          (k) => k === path || k === basename || k.split('/').pop() === basename,
        )
        if (!found) missingIncludes.add(basename)
      }
    }
    return Object.keys(parseErrors).length
      + missingIncludes.size
      + findUnresolvedReplacements(loadedFiles).length
  }, [loadedFiles, parseErrors])

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
          padding: '18px 10px',
          textAlign: 'center',
          cursor: 'pointer',
          background: '#fafafa',
          color: '#555',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop YAML files or folder here</div>
        {/* The panel gutter leaves this box around 220px wide, so the three
            links wrap as a group rather than breaking mid-phrase. Spacing does
            the separating: a middot would be left dangling at a line end. */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          flexWrap: 'wrap', columnGap: 12, rowGap: 3, fontSize: 11, color: '#aaa',
        }}>
          <span
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
            style={{ textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Select files
          </span>
          <span
            onClick={handleFolderSelect}
            style={{ textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Select folder
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); loadSample() }}
            title="Load a small built-in LZA config so you can try every view without your own files"
            style={{ textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
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

      {/* Parse failures, missing !include files and unresolved {{ }} tokens all
          surface as findings in the Validation panel now, so they are ranked
          alongside everything else rather than repeated here in their own
          boxes. This line is the pointer from where you load files to where
          the problems are reported. */}
      {problemCount > 0 && (
        <div style={noticeWarn}>
          {problemCount} loading {problemCount === 1 ? 'problem' : 'problems'} with these files —
          see <strong>Validation</strong> above.
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
