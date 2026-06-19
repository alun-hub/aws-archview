import { useCallback, useRef } from 'react'
import { useDispatch } from '../../store/configStore'
import type { LzaConfigs } from '../../parser'
import { parseYaml } from '../../parser'
import type { AccountsConfig, NetworkConfig, OrganizationConfig, SecurityConfig, IamConfig } from '../../parser/types'

const FILE_MAP: Record<string, keyof LzaConfigs> = {
  'organization-config.yaml': 'organization',
  'accounts-config.yaml': 'accounts',
  'network-config.yaml': 'network',
  'security-config.yaml': 'security',
  'iam-config.yaml': 'iam',
}

function resolveConfigKey(filename: string): keyof LzaConfigs | null {
  const base = filename.toLowerCase().replace(/.*[\\/]/, '')
  return FILE_MAP[base] ?? null
}

function parsedForKey(key: keyof LzaConfigs, content: string): Partial<LzaConfigs> {
  switch (key) {
    case 'organization':
      return { organization: parseYaml<OrganizationConfig>(content) }
    case 'accounts':
      return { accounts: parseYaml<AccountsConfig>(content) }
    case 'network':
      return { network: parseYaml<NetworkConfig>(content) }
    case 'security':
      return { security: parseYaml<SecurityConfig>(content) }
    case 'iam':
      return { iam: parseYaml<IamConfig>(content) }
  }
}

export function ConfigLoader({ loadedFiles }: { loadedFiles: Record<string, string> }) {
  const dispatch = useDispatch()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      Array.from(files).forEach((file) => {
        const key = resolveConfigKey(file.name)
        if (!key) return
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          dispatch({ type: 'SET_FILE', filename: file.name, content, parsed: parsedForKey(key, content) })
        }
        reader.readAsText(file)
      })
    },
    [dispatch],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const expectedFiles = Object.keys(FILE_MAP)

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '16px 0' }}>
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Dra och släpp YAML-filer här</div>
        <div style={{ color: '#aaa', fontSize: 11 }}>eller klicka för att välja</div>
        <input
          ref={inputRef}
          type="file"
          accept=".yaml,.yml"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>
        Förväntade filer
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
    </div>
  )
}
