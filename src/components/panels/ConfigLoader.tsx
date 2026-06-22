import { useCallback, useMemo, useRef } from 'react'
import { useDispatch } from '../../store/configStore'
import { FILE_MAP, findIncludes } from '../../parser'

// Read all files from a FileSystemEntry recursively (handles folders with >100 entries)
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file((f) => resolve([f]), reject)
    })
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const entries: FileSystemEntry[] = []
    await new Promise<void>((resolve, reject) => {
      const readBatch = () =>
        reader.readEntries((batch) => {
          if (batch.length === 0) resolve()
          else { entries.push(...batch); readBatch() }
        }, reject)
      readBatch()
    })
    return (await Promise.all(entries.map(readEntry))).flat()
  }
  return []
}

export function ConfigLoader({ loadedFiles }: { loadedFiles: Record<string, string> }) {
  const dispatch    = useDispatch()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (!file.name.match(/\.(yaml|yml)$/i)) continue
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          dispatch({ type: 'SET_FILE', filename: file.name, content })
        }
        reader.readAsText(file)
      }
    },
    [dispatch],
  )

  const handleFolderSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.setAttribute('webkitdirectory', '')
      input.onchange = () => processFiles(Array.from(input.files ?? []))
      input.click()
    },
    [processFiles],
  )

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.items) {
        const entries = Array.from(e.dataTransfer.items)
          .map((item) => item.webkitGetAsEntry())
          .filter((entry): entry is FileSystemEntry => entry != null)
        const allFiles = (await Promise.all(entries.map(readEntry))).flat()
        processFiles(allFiles)
      } else {
        processFiles(Array.from(e.dataTransfer.files))
      }
    },
    [processFiles],
  )

  // Detect !include references that aren't yet loaded
  const unresolvedIncludes = useMemo(() => {
    const missing: string[] = []
    for (const content of Object.values(loadedFiles)) {
      for (const path of findIncludes(content)) {
        const basename = path.split('/').pop()!
        const found = Object.keys(loadedFiles).some(
          (k) => k === path || k === basename || k.split('/').pop() === basename,
        )
        if (!found && !missing.includes(basename)) missing.push(basename)
      }
    }
    return missing
  }, [loadedFiles])

  const hasFiles = Object.keys(loadedFiles).length > 0

  const expectedFiles  = Object.keys(FILE_MAP)
  const auxiliaryFiles = Object.keys(loadedFiles).filter((f) => !(f in FILE_MAP))

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
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => processFiles(Array.from(e.target.files ?? []))}
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

      {/* Unresolved include warnings */}
      {unresolvedIncludes.length > 0 && (
        <div style={{
          background: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: 6,
          padding: '8px 10px',
          marginBottom: 12,
          fontSize: 11,
          color: '#7c5c00',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Missing included files:</div>
          {unresolvedIncludes.map((f) => (
            <div key={f} style={{ fontFamily: 'monospace', opacity: 0.85 }}>↳ {f}</div>
          ))}
        </div>
      )}

      {/* Expected config files */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>
        Expected files
      </div>
      {expectedFiles.map((f) => {
        const loaded = f in loadedFiles
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
