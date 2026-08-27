// Locate a loaded file's content by a path referenced from within a config
// (rulesFile, an SCP's policy path, etc). Tolerant of relative-path prefixes,
// Windows-style separators, and a bare basename with no directory at all —
// mirrors the matching rules !include already uses, so every "external file
// reference" field behaves consistently regardless of how it was dropped
// (drag-and-drop folder, "Select folder", or individual files).
export function findFileContent(path: string, loadedFiles: Record<string, string>): string | undefined {
  if (loadedFiles[path] != null) return loadedFiles[path]
  const pathSuffix = path.replace(/^[.\\/]+/, '')
  for (const [k, v] of Object.entries(loadedFiles)) {
    const keySuffix = k.replace(/^[.\\/]+/, '')
    if (keySuffix.endsWith(pathSuffix) || pathSuffix.endsWith(keySuffix)) {
      return v
    }
  }
  const basename = path.split(/[\\/]/).pop()!
  for (const [k, v] of Object.entries(loadedFiles)) {
    if (k.split(/[\\/]/).pop() === basename) {
      return v
    }
  }
  return undefined
}
