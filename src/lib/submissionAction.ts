/**
 * What the submission workflow does with one GitHub event: store a submitted measure, replace it
 * when its issue is edited, or remove it when the issue author comments `/withdraw`.
 *
 * The event payload is attacker-controlled (issue body, comment, logins), so it is read field by
 * field here. Comments posted back are fixed sentences: nothing from the issue is echoed except
 * the validated headset id.
 */

import { parseIssueBody, type IssueError, type ParseOptions } from './issueForm.ts'
import type { PlainTextProblem } from './plainText.ts'
import { tools, type Submission, type TextField, type Tool } from './submission.ts'
import {
  aggregatePath,
  aggregateShard,
  emptyIndex,
  emptyShard,
  indexPath,
  parseIndex,
  parseShard,
  serialize,
  shardDirectory,
  shardPath,
  withCount,
  withEntry,
  withoutEntry,
  type Shard,
} from './submissionStore.ts'

/** The repository's data files, relative to its root. */
export interface DataFiles {
  read(path: string): string | null
  write(path: string, content: string): void
  remove(path: string): void
  /** Every file below `shardDirectory`, as paths relative to the repository root. */
  listShards(): readonly string[]
}

export const submissionLabel = 'submission'
export const withdrawnLabel = 'withdrawn'
export const withdrawCommand = '/withdraw'

export type ActionEvent =
  | { readonly kind: 'submission'; readonly issue: number; readonly author: string; readonly body: string }
  | { readonly kind: 'withdraw'; readonly issue: number; readonly author: string }

export type Outcome = 'accepted' | 'invalid' | 'withdrawn' | 'not-found'
export interface ActionResult {
  readonly outcome: Outcome
  /** The comment posted on the issue. */
  readonly message: string
  readonly commitMessage: string
}

const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

function field(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  return Object.getOwnPropertyDescriptor(value, name)?.value
}

function loginOf(user: unknown): string | null {
  const login = field(user, 'login')
  return typeof login === 'string' && loginPattern.test(login) ? login : null
}

function labelsOf(issue: unknown): readonly string[] {
  const labels = field(issue, 'labels')
  return Array.isArray(labels) ? labels.map((label) => field(label, 'name')).filter((name) => typeof name === 'string') : []
}

/**
 * The event to act on, or null for anything else: other actions, issues without the submission
 * label or already withdrawn, pull requests, edits that leave the body alone, and `/withdraw`
 * from anyone but the issue author.
 */
export function readEvent(eventName: string, payload: unknown): ActionEvent | null {
  const issue = field(payload, 'issue')
  const action = field(payload, 'action')
  const number = field(issue, 'number')
  const author = loginOf(field(issue, 'user'))
  const labels = labelsOf(issue)
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1 || author === null) return null
  if (!labels.includes(submissionLabel) || labels.includes(withdrawnLabel)) return null
  if (field(issue, 'pull_request') !== undefined) return null

  if (eventName === 'issues') {
    const bodyChanged = field(field(payload, 'changes'), 'body') !== undefined
    if (action !== 'opened' && !(action === 'edited' && bodyChanged)) return null
    const body = field(issue, 'body')
    return { kind: 'submission', issue: number, author, body: typeof body === 'string' ? body : '' }
  }
  if (eventName === 'issue_comment' && action === 'created') {
    const comment = field(payload, 'comment')
    const text = field(comment, 'body')
    const commenter = loginOf(field(comment, 'user'))
    const isCommand = typeof text === 'string' && text.trim() === withdrawCommand
    // Logins are case-insensitive on GitHub.
    if (isCommand && commenter?.toLowerCase() === author.toLowerCase()) return { kind: 'withdraw', issue: number, author }
  }
  return null
}

const toolNames: Readonly<Record<Tool, string>> = {
  atlas: 'FOV Atlas',
  vrhp: 'VR Headset Picker',
  wimfov: 'WIMFOV',
  testhmd: 'TestHMD',
}

const textFieldNames: readonly (readonly [TextField, string])[] = [
  ['tuning-details', 'Tuning details'],
  ['facial-interface', 'Facial interface and cushion'],
  ['note', 'Note'],
]

const textProblemSentences: readonly (readonly [PlainTextProblem, string])[] = [
  ['too-long', 'is too long'],
  ['control-character', 'contains control or text-direction characters'],
  ['markup', 'contains `<` or `>`; plain text only'],
  ['heading-line', 'has a line starting with `#`'],
]

type FixedError = Exclude<IssueError, `${TextField}-${PlainTextProblem}`>

const errorMessages: Readonly<Record<FixedError, string>> = {
  'body-too-long': 'The issue body is far longer than a submission.',
  'body-malformed': 'The issue body does not match the submission form: every section of the form must be there, once, with its heading unchanged.',
  'tool-invalid': '“Measuring tool” must be one of `atlas`, `vrhp`, `wimfov` or `testhmd`.',
  'headset-invalid': '“Headset model” must be a model id such as `bigscreen-beyond-2`.',
  'measure-missing': '“Measure” is empty.',
  'measure-invalid': '“Measure” is not in the format this tool expects.',
  'wimfov-link-wrong-tool': 'A WIMFOV link was given, but the measuring tool is not `wimfov`.',
  'wimfov-page-unavailable': 'The WIMFOV result page could not be read. Check the link, or paste the `points` value instead.',
  'wimfov-mismatch': 'The pasted WIMFOV points differ from the result behind the WIMFOV link. Keep only one of them.',
  'wimfov-points-invalid': 'The WIMFOV points must be `left|right`, with 16 comma-separated values per eye.',
  'wimfov-angle-out-of-range': 'A WIMFOV value is above 90°.',
  'wimfov-link-not-read-only':
    'Only the WIMFOV read-only link (`https://andreasaronsson.com/!apps/wimfov/?id=…`) is accepted. Never post your WIMFOV edit link in public: anyone holding it can change or delete your result. If you posted it here, remove it from the issue.',
  'wimfov-page-too-large': 'The WIMFOV link did not lead to a WIMFOV result page.',
  'wimfov-page-unrecognised': 'The WIMFOV link did not lead to a WIMFOV result page.',
  'wimfov-page-id-mismatch': 'The WIMFOV result page is for a different result than the link.',
  'eye-depth-invalid': '“Eyes vs brow” must be `deep-set`, `in-between` or `almost-flush`.',
  'nose-bridge-invalid': '“Nose bridge” must be `low`, `in-between` or `high`.',
  'modded-invalid': '“Physically modded” must be `yes` or `no`.',
  'tuned-invalid': '“Driver tuned” must be `yes` or `no`.',
  'gaze-invalid': '“Gaze while measuring” must be `fixed` or `free`.',
  'ipd-invalid': '“Lens IPD (mm)” must be a number of millimetres such as `63` or `63.5`.',
  'testhmd-out-of-range': 'The TestHMD figures must be above 0° and at most 180°, with at most one decimal.',
  'vrhp-too-long': 'The VR Headset Picker link is too long.',
  'vrhp-no-results-parameter': 'The VR Headset Picker link has no results in it. Copy the share link from your results page.',
  'vrhp-not-base64url': 'The VR Headset Picker link is damaged. Copy the share link again.',
  'vrhp-too-short': 'The VR Headset Picker link is cut short. Copy the share link again.',
  'vrhp-unsupported-version': 'This VR Headset Picker link comes from a version that is not supported yet.',
  'vrhp-angle-out-of-range': 'An angle in the VR Headset Picker link is outside 0–90°.',
  'vrhp-total-out-of-range': 'A rendered total in the VR Headset Picker link is above 360°.',
  'vrhp-headset-name-invalid': 'The headset name inside the VR Headset Picker link is not plain text.',
  'unknown-tool': '“Measuring tool” is not a known tool.',
  'missing-direction': 'A required direction is missing from the measure.',
  'unexpected-direction': 'The measure has a direction this tool does not measure.',
  'angle-out-of-range': 'An angle is outside 0–90° or has more than two decimals.',
  'testhmd-not-symmetric': 'The TestHMD values must split evenly over both sides.',
  'ceiling-not-allowed': 'This tool cannot carry a rendered ceiling of that kind.',
  'ceiling-out-of-range': 'The rendered ceiling is out of range.',
  'corner-mask-not-allowed': 'The corner-mask state does not fit this measure.',
  'input-not-allowed': 'This tool cannot be entered that way.',
  'reported-headset-invalid': 'The headset name reported by the tool is not plain text or is too long.',
  'ipd-out-of-range': '“Lens IPD (mm)” must be between 45 and 85 mm.',
}

const messages = new Map<string, string>([
  ...Object.entries(errorMessages),
  ...textFieldNames.flatMap(([fieldId, fieldName]) =>
    textProblemSentences.map(([problem, sentence]): [string, string] => [`${fieldId}-${problem}`, `“${fieldName}” ${sentence}.`]),
  ),
])

export function messageFor(error: IssueError): string {
  return messages.get(error) ?? 'The submission is invalid.'
}

const shardFilePattern = /^([a-z]+)\/([a-z0-9-]+)\.json$/

function readShard(files: DataFiles, tool: Tool, headset: string): Shard {
  const json = files.read(shardPath(tool, headset))
  if (json === null) return emptyShard(tool, headset)
  const shard = parseShard(json, tool, headset)
  if (shard === null) throw new Error(`${shardPath(tool, headset)} is corrupt`)
  return shard
}

/** Every stored shard holding this issue, as [tool, headset] pairs. */
function shardsHolding(files: DataFiles, issue: number): [Tool, string][] {
  return files.listShards().flatMap((path): [Tool, string][] => {
    const prefix = `${shardDirectory}/`
    const match = path.startsWith(prefix) ? shardFilePattern.exec(path.slice(prefix.length)) : null
    const [, tool, headset] = match ?? []
    if (!tools.includes(tool as Tool) || headset === undefined) throw new Error(`Unexpected file ${path}`)
    return String(issue) in readShard(files, tool as Tool, headset).entries ? [[tool as Tool, headset]] : []
  })
}

/** Writes the shard with its aggregate and count, or removes both once it is empty. */
function saveShard(files: DataFiles, shard: Shard): void {
  const count = Object.keys(shard.entries).length
  if (count === 0) {
    files.remove(shardPath(shard.tool, shard.headset))
    files.remove(aggregatePath(shard.tool, shard.headset))
  } else {
    files.write(shardPath(shard.tool, shard.headset), serialize(shard))
    files.write(aggregatePath(shard.tool, shard.headset), serialize(aggregateShard(shard)))
  }
  const indexJson = files.read(indexPath)
  const index = indexJson === null ? emptyIndex() : parseIndex(indexJson)
  if (index === null) throw new Error(`${indexPath} is corrupt`)
  files.write(indexPath, serialize(withCount(index, shard.tool, shard.headset, count)))
}

function removeIssue(files: DataFiles, issue: number): number {
  const holders = shardsHolding(files, issue)
  for (const [tool, headset] of holders) saveShard(files, withoutEntry(readShard(files, tool, headset), issue))
  return holders.length
}

function store(files: DataFiles, issue: number, author: string, submission: Submission): void {
  removeIssue(files, issue)
  const shard = readShard(files, submission.tool, submission.headset)
  saveShard(files, withEntry(shard, issue, { author, submission }))
}

const keptNote = ' The version accepted earlier stays published until a valid edit replaces it.'

export function runAction(event: ActionEvent, files: DataFiles, options: ParseOptions = {}): ActionResult {
  if (event.kind === 'withdraw') {
    const removed = removeIssue(files, event.issue)
    return removed > 0
      ? {
          outcome: 'withdrawn',
          message: 'Your measure has been removed from FOV Atlas. It disappears from the site with the next deploy.',
          commitMessage: `Withdraw submission #${String(event.issue)}`,
        }
      : { outcome: 'not-found', message: 'There is no stored measure for this issue.', commitMessage: '' }
  }
  const parsed = parseIssueBody(event.body, options)
  if (!parsed.ok) {
    return {
      outcome: 'invalid',
      message: `This submission could not be accepted: ${messageFor(parsed.error)} Edit the issue to fix it; it is checked again after every edit.${shardsHolding(files, event.issue).length > 0 ? keptNote : ''}`,
      commitMessage: '',
    }
  }
  const { submission } = parsed
  store(files, event.issue, event.author, submission)
  return {
    outcome: 'accepted',
    message: `Thanks! Your ${toolNames[submission.tool]} measure of \`${submission.headset}\` is stored and appears on the site with the next deploy. Comment \`${withdrawCommand}\` here at any time to remove it.`,
    commitMessage: `Store submission #${String(event.issue)} (${submission.tool}/${submission.headset})`,
  }
}
