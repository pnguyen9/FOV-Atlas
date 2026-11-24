/** File access for the submission workflow; nothing else in the scripts touches the file system. */

import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import type { DataFiles } from '../src/lib/submissionAction.ts'
import { dataRootOf } from '../src/lib/submissionStore.ts'

const isMissingFile = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'

/*
 * Paths are either built by the store module from validated tool and headset ids and integers
 * (and pass through `dataFilePath`), or named by the runner through its own environment variables.
 */
/* eslint-disable security/detect-non-literal-fs-filename */
export function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

export function appendText(path: string, content: string): void {
  appendFileSync(path, content)
}

function removeFile(path: string): void {
  rmSync(path, { force: true })
}
/* eslint-enable security/detect-non-literal-fs-filename */

/**
 * The absolute path of a data file, refusing anything that is not a data file path or that
 * resolves outside the data directory it names. The store only builds valid paths; this holds
 * even if a corrupt id ever got past its checks.
 */
export function dataFilePath(root: string, path: string): string {
  const dataDirectory = dataRootOf(path)
  const resolved = resolve(root, path)
  if (dataDirectory === null || !resolved.startsWith(`${resolve(root, dataDirectory)}${sep}`)) {
    throw new Error(`Refusing to touch ${path} outside the data directories`)
  }
  return resolved
}

/** The data files of the repository checked out at `root`. */
export function dataFiles(root: string): DataFiles {
  return {
    read: (path) => readText(dataFilePath(root, path)),
    write: (path, content) => {
      writeText(dataFilePath(root, path), content)
    },
    remove: (path) => {
      removeFile(dataFilePath(root, path))
    },
  }
}
