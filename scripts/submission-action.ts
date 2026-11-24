/**
 * Entry point of the submission workflow, run with Node's type stripping (no build step).
 *
 *   prepare  writes `wimfov_id`, the WIMFOV result the workflow must fetch, or an empty value
 *   process  applies the event to the data files and writes `outcome`, `message`, `commit_message`
 *            and `rendered_differs` (`true` or `false`)
 *
 * The event comes from the file GitHub names in GITHUB_EVENT_PATH; outputs go to GITHUB_OUTPUT.
 * The fetched WIMFOV page, if any, is read from WIMFOV_PAGE_PATH.
 */

import { wimfovResultToFetch } from '../src/lib/issueForm.ts'
import { readEvent, runAction } from '../src/lib/submissionAction.ts'
import { maximumPageLength } from '../src/lib/wimfov.ts'
import { appendText, dataFiles, readText } from './files.ts'

function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') throw new Error(`${name} is not set`)
  return value
}

function writeOutput(name: string, value: string): void {
  // Values are fixed sentences or validated ids; a line break would let one forge other outputs.
  if (/[\r\n]/.test(value)) throw new Error(`Output ${name} spans several lines`)
  appendText(required(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT'), `${name}=${value}\n`)
}

const files = dataFiles(process.cwd())

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
    writeOutput('rendered_differs', String(result.renderedDiffers))
  }
} else {
  throw new Error('Usage: submission-action.ts prepare|process')
}
