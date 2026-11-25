/**
 * What the submission workflow does with one GitHub event: store a submitted measure, replace it
 * when its issue is edited, or remove it when the issue author comments `/withdraw`. A measure of
 * a headset missing from the catalog is checked but not stored; the issue waits for a maintainer,
 * who adds the model, sets the issue's headset to its id, and the edit or a `/recheck` comment
 * from a maintainer processes it again.
 *
 * Every change to a FOV Atlas measure also rebuilds the model's averaged
 * rendered field of view (`renderedAverage.ts`). A new measure whose headset reports drawing far
 * from that average is still stored; the issue is flagged for a maintainer to look at.
 *
 * The event payload is attacker-controlled (issue body, comment, logins), so it is read field by
 * field here. Comments posted back are fixed sentences: nothing from the issue is echoed except
 * the validated headset id and numbers worked out from validated values.
 */

import { otherHeadset } from './headsets.ts'
import { parseIssueBody, type IssueError, type ParseOptions } from './issueForm.ts'
import type { PlainTextProblem } from './plainText.ts'
import {
  differsFromAverageDegrees,
  renderedAverageOf,
  renderedDifferences,
  renderedPath,
  renderedValueLabelOf,
  type RenderedDifference,
} from './renderedAverage.ts'
import { formatDegrees } from './degrees.ts'
import { readsOwnEdges, toolNameOf, tools, type Submission, type TextField, type Tool } from './submission.ts'
import {
  aggregatePages,
  aggregatePath,
  emptyIndex,
  emptyLookup,
  emptyPage,
  entriesPerPage,
  headsetsOf,
  indexPath,
  loginPattern,
  lookupNumberOf,
  lookupPath,
  pagePath,
  parseIndex,
  parseLookup,
  parsePage,
  serialize,
  serializeLookup,
  serializePage,
  withEntry,
  withLocation,
  withoutEntry,
  withRendered,
  withSummary,
  type DataIndex,
  type IssueLookup,
  type Location,
  type Page,
} from './submissionStore.ts'

/** The repository's data files, relative to its root. */
export interface DataFiles {
  read(path: string): string | null
  write(path: string, content: string): void
  remove(path: string): void
}

export const submissionLabel = 'submission'
export const withdrawnLabel = 'withdrawn'
export const withdrawCommand = '/withdraw'
export const recheckCommand = '/recheck'
/** GitHub's `author_association` values of people with write access to the repository. */
const maintainerAssociations: readonly unknown[] = ['OWNER', 'MEMBER', 'COLLABORATOR']

export type ActionEvent =
  | { readonly kind: 'submission'; readonly issue: number; readonly author: string; readonly body: string }
  | { readonly kind: 'withdraw'; readonly issue: number; readonly author: string }

export type Outcome = 'accepted' | 'invalid' | 'new-headset' | 'withdrawn' | 'not-found'
export interface ActionResult {
  readonly outcome: Outcome
  /** The comment posted on the issue. */
  readonly message: string
  readonly commitMessage: string
  /** An accepted measure whose rendered field of view differs from its model's average. */
  readonly renderedDiffers: boolean
}

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
 * label or already withdrawn, pull requests, edits that leave the body alone, `/withdraw` from
 * anyone but the issue author, and `/recheck` from anyone without write access.
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
    const command = typeof text === 'string' ? text.trim() : ''
    // Logins are case-insensitive on GitHub.
    if (command === withdrawCommand && commenter?.toLowerCase() === author.toLowerCase()) {
      return { kind: 'withdraw', issue: number, author }
    }
    if (command === recheckCommand && maintainerAssociations.includes(field(comment, 'author_association'))) {
      const body = field(issue, 'body')
      return { kind: 'submission', issue: number, author, body: typeof body === 'string' ? body : '' }
    }
  }
  return null
}

const textFieldNames: readonly (readonly [TextField, string])[] = [
  ['headset-name', 'Headset name, if not listed'],
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
  'headset-invalid': '“Headset model” must be the id of a model in the FOV Atlas catalog, such as `bigscreen-beyond-2`, or `other`.',
  'headset-name-missing': '“Headset model” is `other`, so “Headset name, if not listed” must give the model’s name.',
  'headset-name-unexpected': '“Headset name, if not listed” must be empty when “Headset model” is a catalog id.',
  'measure-missing': '“Measure” is empty.',
  'measure-invalid': '“Measure” is not in the format this tool expects.',
  'wimfov-link-wrong-tool': 'A WIMFOV link was given, but the measuring tool is not `wimfov`.',
  'wimfov-page-unavailable': 'The WIMFOV result page could not be read. Check the link, or paste the `points` value instead.',
  'wimfov-mismatch': 'The pasted WIMFOV points differ from the result behind the WIMFOV link. Keep only one of them.',
  'wimfov-points-invalid': 'The WIMFOV points must be `left|right`, with 16 comma-separated values per eye.',
  'wimfov-angle-out-of-range': 'A WIMFOV value is above 180°.',
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
  'testhmd-out-of-range': 'The TestHMD figures must be above 0° and at most 360°, with at most one decimal.',
  'vrhp-too-long': 'The VR Headset Picker link is too long.',
  'vrhp-no-results-parameter': 'The VR Headset Picker link has no results in it. Copy the share link from your results page.',
  'vrhp-not-base64url': 'The VR Headset Picker link is damaged. Copy the share link again.',
  'vrhp-too-short': 'The VR Headset Picker link is cut short. Copy the share link again.',
  'vrhp-trailing-data': 'The VR Headset Picker link has unexpected data at its end. Copy the share link again.',
  'vrhp-unsupported-version': 'This VR Headset Picker link comes from a version that is not supported yet.',
  'vrhp-angle-out-of-range': 'An angle in the VR Headset Picker link is negative, or 90° or more, which its format cannot hold.',
  'vrhp-total-out-of-range': 'A rendered total in the VR Headset Picker link is above 360°.',
  'vrhp-headset-name-invalid': 'The headset name inside the VR Headset Picker link is not plain text.',
  'vrhp-headset-id-invalid': 'The headset id inside the VR Headset Picker link is malformed.',
  'unknown-tool': '“Measuring tool” is not a known tool.',
  'missing-direction': 'A required direction is missing from the measure.',
  'unexpected-direction': 'The measure has a direction this tool does not measure.',
  'angle-out-of-range': 'An angle is negative, above 180°, or has more than two decimals.',
  'testhmd-not-symmetric': 'The TestHMD values must split evenly over both sides.',
  'ceiling-not-allowed': 'This tool cannot carry a rendered field of view of that kind.',
  'ceiling-out-of-range': 'The rendered field of view is out of range.',
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

function readIndex(files: DataFiles): DataIndex {
  const json = files.read(indexPath)
  const index = json === null ? emptyIndex() : parseIndex(json)
  if (index === null) throw new Error(`${indexPath} is corrupt`)
  return index
}

function readLookup(files: DataFiles, lookupNumber: number): IssueLookup {
  const json = files.read(lookupPath(lookupNumber))
  const lookup = json === null ? emptyLookup(lookupNumber) : parseLookup(json, lookupNumber)
  if (lookup === null) throw new Error(`${lookupPath(lookupNumber)} is corrupt`)
  return lookup
}

const locationIn = (lookup: IssueLookup, issue: number): Location | null => lookup.issues[String(issue)] ?? null

const locationOf = (files: DataFiles, issue: number): Location | null => locationIn(readLookup(files, lookupNumberOf(issue)), issue)

function writeLookup(files: DataFiles, lookup: IssueLookup): void {
  const path = lookupPath(lookup.lookup)
  if (Object.keys(lookup.issues).length === 0) files.remove(path)
  else files.write(path, serializeLookup(lookup))
}

/** Every page of a headset, as many as the index lists; a listed page that is missing is corruption. */
function readPages(files: DataFiles, index: DataIndex, tool: Tool, headset: string): Page[] {
  const pageCount = headsetsOf(index, tool).get(headset)?.pages ?? 0
  return Array.from({ length: pageCount }, (_, pageNumber) => {
    const path = pagePath(tool, headset, pageNumber)
    const json = files.read(path)
    const page = json === null ? null : parsePage(json, tool, headset, pageNumber)
    if (page === null) throw new Error(`${path} is ${json === null ? 'missing' : 'corrupt'}`)
    return page
  })
}

function writeAggregate(files: DataFiles, tool: Tool, headset: string, pages: readonly Page[]): void {
  files.write(aggregatePath(tool, headset), serialize(aggregatePages(tool, headset, pages)))
}

/**
 * Rebuilds every headset's aggregate from its pages, for when the aggregate format changes and
 * the site's code and data must ship together. Returns how many aggregates were written.
 */
export function rebuildAggregates(files: DataFiles): number {
  const index = readIndex(files)
  const headsets = tools.flatMap((tool) => [...headsetsOf(index, tool).keys()].map((headset) => ({ tool, headset })))
  for (const { tool, headset } of headsets) writeAggregate(files, tool, headset, readPages(files, index, tool, headset))
  return headsets.length
}

const entryCount = (page: Page): number => Object.keys(page.entries).length

/**
 * Writes the changed page, drops trailing pages left empty, and rebuilds the headset's aggregate
 * from all its pages. Returns the index with the headset's new summary, for the caller to write.
 */
function savePages(files: DataFiles, index: DataIndex, pages: readonly Page[], changed: Page): DataIndex {
  const { tool, headset } = changed
  const updated = pages.map((page) => (page.page === changed.page ? changed : page))
  if (changed.page === pages.length) updated.push(changed)
  for (let last = updated.at(-1); last !== undefined && entryCount(last) === 0; last = updated.at(-1)) {
    files.remove(pagePath(tool, headset, last.page))
    updated.pop()
  }
  if (changed.page < updated.length) files.write(pagePath(tool, headset, changed.page), serializePage(changed))
  const count = updated.reduce((total, page) => total + entryCount(page), 0)
  if (count === 0) files.remove(aggregatePath(tool, headset))
  else writeAggregate(files, tool, headset, updated)
  const summary = count === 0 ? null : { count, pages: updated.length }
  const updatedIndex = withSummary(index, tool, headset, summary)
  return readsOwnEdges(tool) ? saveRendered(files, updatedIndex, headset, updated) : updatedIndex
}

const submissionsOf = (pages: readonly Page[], leftOut: number | null = null): Submission[] => {
  const leftOutKey = leftOut === null ? null : String(leftOut)
  return pages.flatMap((page) =>
    Object.entries(page.entries).flatMap(([issue, { submission }]) => (issue === leftOutKey ? [] : [submission])),
  )
}

/**
 * Rewrites or removes a headset's averaged rendered field of view, which only the measures that
 * read their headset's edges feed; returns the index listing it.
 */
function saveRendered(files: DataFiles, index: DataIndex, headset: string, pages: readonly Page[]): DataIndex {
  const average = renderedAverageOf(headset, submissionsOf(pages))
  if (average === null) {
    files.remove(renderedPath(headset))
    return withRendered(index, headset, null)
  }
  files.write(renderedPath(headset), serialize(average))
  return withRendered(index, headset, average.count)
}

function pageHolding(pages: readonly Page[], location: Location, issue: number): Page {
  const page = pages[location.page]
  if (page?.entries[String(issue)] === undefined) {
    throw new Error(`${lookupPath(lookupNumberOf(issue))} points issue ${String(issue)} to a page without it`)
  }
  return page
}

/** Takes the issue's entry off its page; returns the index for the caller to write. */
function removeEntry(files: DataFiles, index: DataIndex, location: Location, issue: number): DataIndex {
  const pages = readPages(files, index, location.tool, location.headset)
  return savePages(files, index, pages, withoutEntry(pageHolding(pages, location, issue), issue))
}

function removeIssue(files: DataFiles, issue: number): boolean {
  const lookup = readLookup(files, lookupNumberOf(issue))
  const location = locationIn(lookup, issue)
  if (location === null) return false
  files.write(indexPath, serialize(removeEntry(files, readIndex(files), location, issue)))
  writeLookup(files, withLocation(lookup, issue, null))
  return true
}

/**
 * Replaces the entry in place when the issue stays on its headset; otherwise moves it to the last
 * page of its new one. The index and the issue's lookup are read once and written once. Returns
 * how the measure's rendered field of view differs from the average of the model's other measures.
 */
function store(files: DataFiles, issue: number, author: string, submission: Submission): RenderedDifference[] {
  const { tool, headset } = submission
  const lookup = readLookup(files, lookupNumberOf(issue))
  const location = locationIn(lookup, issue)
  const staysOnHeadset = location?.tool === tool && location.headset === headset
  let index = readIndex(files)
  if (location !== null && !staysOnHeadset) index = removeEntry(files, index, location, issue)
  const pages = readPages(files, index, tool, headset)
  const differences = readsOwnEdges(tool)
    ? renderedDifferences(submission, renderedAverageOf(headset, submissionsOf(pages, issue)))
    : []
  const last = pages[pages.length - 1]
  const hasRoom = last !== undefined && entryCount(last) < entriesPerPage
  const target = staysOnHeadset ? pageHolding(pages, location, issue) : hasRoom ? last : emptyPage(tool, headset, pages.length)
  index = savePages(files, index, pages, withEntry(target, issue, { author, submission }))
  files.write(indexPath, serialize(index))
  writeLookup(files, withLocation(lookup, issue, { tool, headset, page: target.page }))
  return differences
}

function differenceSentence({ name, value, mean, count }: RenderedDifference): string {
  const others = count === 1 ? 'the 1 other measure' : `the ${String(count)} other measures`
  return `${renderedValueLabelOf(name).toLowerCase()}: ${formatDegrees(value)}, against ${formatDegrees(mean)} on average over ${others} (${formatDegrees(Math.abs(value - mean))} apart)`
}

const differencesNote = (differences: readonly RenderedDifference[]): string =>
  differences.length === 0
    ? ''
    : ` Note for the maintainers: what this headset reports drawing differs by more than ${String(differsFromAverageDegrees)}° from the average of this model's other measures, which may be a different version of the model or a mistake. ${differences.map(differenceSentence).join('; ')}. The measure is published anyway.`

const keptNote = ' The version accepted earlier stays published until a valid edit replaces it.'

export function runAction(event: ActionEvent, files: DataFiles, options: ParseOptions = {}): ActionResult {
  if (event.kind === 'withdraw') {
    return removeIssue(files, event.issue)
      ? {
          outcome: 'withdrawn',
          message: 'Your measure has been removed from FOV Atlas. It disappears from the site with the next deploy.',
          commitMessage: `Withdraw submission #${String(event.issue)}`,
          renderedDiffers: false,
        }
      : { outcome: 'not-found', message: 'There is no stored measure for this issue.', commitMessage: '', renderedDiffers: false }
  }
  const parsed = parseIssueBody(event.body, options)
  if (!parsed.ok) {
    return {
      outcome: 'invalid',
      message: `This submission could not be accepted: ${messageFor(parsed.error)} Edit the issue to fix it; it is checked again after every edit.${locationOf(files, event.issue) === null ? '' : keptNote}`,
      commitMessage: '',
      renderedDiffers: false,
    }
  }
  const { submission } = parsed
  if (submission.headset === otherHeadset) {
    return {
      outcome: 'new-headset',
      message: `Thanks! Everything else in this submission is valid, but its headset is not in the FOV Atlas catalog yet. A maintainer will check the model by hand and add it to the catalog; until then this issue stays open and the measure is not published.${locationOf(files, event.issue) === null ? '' : keptNote}`,
      commitMessage: '',
      renderedDiffers: false,
    }
  }
  const differences = store(files, event.issue, event.author, submission)
  return {
    outcome: 'accepted',
    message: `Thanks! Your ${toolNameOf(submission.tool)} measure of \`${submission.headset}\` is stored and appears on the site with the next deploy. Comment \`${withdrawCommand}\` here at any time to remove it.${differencesNote(differences)}`,
    commitMessage: `Store submission #${String(event.issue)} (${submission.tool}/${submission.headset})`,
    renderedDiffers: differences.length > 0,
  }
}
