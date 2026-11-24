/**
 * Entry point of the submission workflow, run with Node's type stripping (no build step).
 *
 *   prepare  writes `wimfov_id`, the WIMFOV result the workflow must fetch, or an empty value
 *   process  applies the event to the data files and writes `outcome`, `message`, `commit_message`
 *
 * The event comes from the file GitHub names in GITHUB_EVENT_PATH; outputs go to GITHUB_OUTPUT.
 * The fetched WIMFOV page, if any, is read from WIMFOV_PAGE_PATH.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { wimfovResultToFetch } from '../src/lib/issueForm.ts'
import { readEvent, runAction, type DataFiles } from '../src/lib/submissionAction.ts'
import { shardDirectory } from '../src/lib/submissionStore.ts'
import { maximumPageLength } from '../src/lib/wimfov.ts'

function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

const isMissingFile = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'

/*
 * The only file access. Paths are either built by the store module from validated tool and
 * headset ids, or named by the runner through its own environment variables.
 */
/* eslint-disable security/detect-non-literal-fs-filename */
function readText(path: string): string | null {
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

function appendText(path: string, content: string): void {
  appendFileSync(path, content)
}

function removeFile(path: string): void {
  rmSync(path, { force: true })
}

function listFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
}
/* eslint-enable security/detect-non-literal-fs-filename */

function writeOutput(name: string, value: string): void {
  // Values are fixed sentences or validated ids; a line break would let one forge other outputs.
  if (/[\r\n]/.test(value)) throw new Error(`Output ${name} spans several lines`)
  appendText(required(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT'), `${name}=${value}\n`)
}

const root = process.cwd()
const files: DataFiles = {
  read: (path) => readText(join(root, path)),
  write: (path, content) => {
    writeText(join(root, path), content)
  },
  remove: (path) => {
    removeFile(join(root, path))
  },
  listShards: () => listFiles(join(root, shardDirectory)).map((path) => relative(root, path)),
}

function readWimfovPage(): string | undefined {
  const path = process.env.WIMFOV_PAGE_PATH
  const page = path === undefined || path === '' ? null : readText(path)
  return page === null || page.length > maximumPageLength ? undefined : page
}

const command = process.argv[2]
const eventJson = required(readText(required(process.env.GITHUB_EVENT_PATH, 'GITHUB_EVENT_PATH')) ?? undefined, 'event')
const event = readEvent(required(process.env.GITHUB_EVENT_NAME, 'GITHUB_EVENT_NAME'), JSON.parse(eventJson))

if (command === 'prepare') {
  writeOutput('wimfov_id', event?.kind === 'submission' ? (wimfovResultToFetch(event.body) ?? '') : '')
} else if (command === 'process') {
  if (event === null) {
    writeOutput('outcome', 'ignored')
  } else {
    const result = runAction(event, files, { wimfovPage: readWimfovPage() })
    writeOutput('outcome', result.outcome)
    writeOutput('message', result.message)
    writeOutput('commit_message', result.commitMessage)
  }
} else {
  throw new Error('Usage: submission-action.ts prepare|process')
}
