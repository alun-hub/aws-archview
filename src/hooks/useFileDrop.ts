import { useCallback } from 'react'
import type { Dispatch } from 'react'
import type { Action } from '../store/configStore'

// A File paired with its path relative to the dropped/selected root, so
// nested folders (e.g. per-region subfolders with same-named files like
// vpc-templates.yaml) don't collide into a single basename.
interface PickedFile {
  file: File
  path: string
}

// Read all files from a FileSystemEntry recursively (handles folders with >100 entries).
// The Drag & Drop Entries API never populates File.webkitRelativePath (that's an
// <input webkitdirectory>-only quirk), so the relative path has to be tracked by
// hand from entry.fullPath or it's lost — collapsing every nested file to its
// bare basename and risking silent collisions between same-named files in
// different subfolders.
async function readEntry(entry: FileSystemEntry): Promise<PickedFile[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(
        (f) => resolve([{ file: f, path: entry.fullPath.replace(/^\/+/, '') }]),
        reject,
      )
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

// File objects from an <input> (plain or webkitdirectory) do carry
// webkitRelativePath already — normalize them into the same PickedFile shape.
function fromFileList(files: File[]): PickedFile[] {
  return files.map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}

// Shared by every drop target in the app (the Configuration panel's drop
// zone, and the empty-canvas call-to-action) so drag-and-drop, "Select
// files"/"Select folder", and reading each file's content behave identically
// no matter where the user drops.
export function useFileDrop(dispatch: Dispatch<Action>) {
  const processFiles = useCallback(
    (files: PickedFile[]) => {
      for (const { file, path } of files) {
        if (!file.name.match(/\.(yaml|yml|txt|rules|json)$/i)) continue
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          dispatch({ type: 'SET_FILE', filename: path, content })
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
      input.onchange = () => processFiles(fromFileList(Array.from(input.files ?? [])))
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
        processFiles(fromFileList(Array.from(e.dataTransfer.files)))
      }
    },
    [processFiles],
  )

  return { processFiles, handleFolderSelect, onDrop, fromFileList }
}
