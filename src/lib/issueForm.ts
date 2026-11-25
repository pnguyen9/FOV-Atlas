/**
 * The submission issue: the prefilled link the site opens, and the parser that reads the issue
 * body back into a validated submission.
 *
 * GitHub renders an issue form as one `### <label>` section per field, with `_No response_` for
 * an empty one. Only text inputs and textareas can be prefilled from the link, so every field is
 * one, holding the canonical value. The fields and labels here must match
 * `.github/ISSUE_TEMPLATE/submission.yml`.
 *
 * The tool's raw data travels as the tool gave it (a VR Headset Picker share link, WIMFOV's
 * points or read-only link, TestHMD's two figures) and is decoded again here, so an edited issue
 * goes through the same checks as a fresh one.
 */

import { catalogHeadset, otherHeadset } from './headsets.ts'
import {
  cornerMaskStates,
  directions,
  eyeDepths,
  gazes,
  headsetProblem,
  noseBridges,
  submissionProblem,
  tools,
  type Ceiling,
  type CornerMask,
  type EdgeAngles,
  type EyeMeasure,
  type EyeMeasures,
  type Provenance,
  type Submission,
  type SubmissionError,
  type Tool,
} from './submission.ts'
import { testHmdMeasures, testHmdTotals } from './testHmd.ts'
import { decodeVrhpLink, extractResultsParameter, type VrhpDecodeError, type VrhpMeasure } from './vrhpLink.ts'
import {
  formatWimfovPoints,
  parseWimfovLink,
  parseWimfovPage,
  parseWimfovPoints,
  wimfovResultLink,
  type WimfovError,
} from './wimfov.ts'

export const issueFields = [
  { id: 'tool', label: 'Measuring tool' },
  { id: 'headset', label: 'Headset model' },
  { id: 'headset-name', label: 'Headset name, if not listed' },
  { id: 'measure', label: 'Measure' },
  { id: 'wimfov-link', label: 'WIMFOV read-only link' },
  { id: 'eye-depth', label: 'Eyes vs brow' },
  { id: 'nose-bridge', label: 'Nose bridge' },
  { id: 'modded', label: 'Physically modded' },
  { id: 'tuned', label: 'Driver tuned' },
  { id: 'tuning-details', label: 'Tuning details' },
  { id: 'gaze', label: 'Gaze while measuring' },
  { id: 'ipd', label: 'Lens IPD (mm)' },
  { id: 'facial-interface', label: 'Facial interface and cushion' },
  { id: 'note', label: 'Note' },
] as const
export type FieldId = (typeof issueFields)[number]['id']
export type IssueFields = Readonly<Record<FieldId, string>>

export const issueTemplate = 'submission.yml'
const issuesUrl = 'https://github.com/pnguyen9/FOV-Atlas/issues'
export const newIssueUrl = `${issuesUrl}/new`

/** The GitHub page of an accepted submission's issue. */
export function issueUrl(issue: number): string {
  return `${issuesUrl}/${String(issue)}`
}
/** Browsers and GitHub start refusing links somewhere above 8 000 characters. */
export const maximumUrlLength = 8000
/** Far above any valid body; caps the work done on hostile input. */
export const maximumBodyLength = 20_000
const maximumMeasureLength = 4096
const emptyResponse = '_No response_'

export type IssueError =
  | 'body-too-long'
  | 'body-malformed'
  | 'tool-invalid'
  | 'measure-missing'
  | 'measure-invalid'
  | 'wimfov-link-wrong-tool'
  | 'wimfov-page-unavailable'
  | 'wimfov-mismatch'
  | 'eye-depth-invalid'
  | 'nose-bridge-invalid'
  | 'modded-invalid'
  | 'tuned-invalid'
  | 'gaze-invalid'
  | 'ipd-invalid'
  | 'testhmd-out-of-range'
  | `vrhp-${VrhpDecodeError}`
  | WimfovError
  | SubmissionError

export type IssueParseResult =
  | { readonly ok: true; readonly submission: Submission }
  | { readonly ok: false; readonly error: IssueError }

export type IssueFormResult =
  | { readonly ok: true; readonly fields: IssueFields }
  | { readonly ok: false; readonly error: 'body-too-long' | 'body-malformed' }

export interface ParseOptions {
  /** The fetched WIMFOV result page, when the issue gives a WIMFOV read-only link. */
  readonly wimfovPage?: string | undefined
}

const headingPattern = /^### (.*)$/
const fieldIdByLabel = new Map<string, FieldId>(issueFields.map(({ id, label }) => [label, id]))

/** Splits a rendered issue form into its fields; every field must appear exactly once. */
export function readIssueForm(markdown: string): IssueFormResult {
  if (markdown.length > maximumBodyLength) return { ok: false, error: 'body-too-long' }
  const malformed = { ok: false, error: 'body-malformed' } as const
  const values = new Map<FieldId, string[]>()
  let current: string[] | null = null
  for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
    const label = headingPattern.exec(line)?.[1]
    if (label === undefined) {
      if (current !== null) current.push(line)
      else if (line.trim() !== '') return malformed
      continue
    }
    const id = fieldIdByLabel.get(label.trim())
    if (id === undefined || values.has(id)) return malformed
    current = []
    values.set(id, current)
  }
  if (values.size !== issueFields.length) return malformed
  const fields = Object.fromEntries(
    [...values].map(([id, lines]) => {
      const value = lines.join('\n').trim()
      return [id, value === emptyResponse ? '' : value]
    }),
  ) as Record<FieldId, string>
  return { ok: true, fields }
}

/** The issue body as GitHub renders the form, for previews and tests. */
export function renderIssueBody(fields: IssueFields): string {
  const values = new Map(Object.entries(fields))
  return issueFields.map(({ id, label }) => `### ${label}\n\n${values.get(id) || emptyResponse}\n`).join('\n')
}

function jsonObject(text: string): ReadonlyMap<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  return new Map(Object.entries(parsed))
}

function hasExactKeys(object: ReadonlyMap<string, unknown>, keys: readonly string[]): boolean {
  return object.size === keys.length && keys.every((key) => object.has(key))
}

function eyeOf(value: unknown): EyeMeasure | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const entries = Object.entries(value)
  const valid = entries.every(
    ([direction, angle]) => (directions as readonly string[]).includes(direction) && typeof angle === 'number',
  )
  return valid ? Object.fromEntries(entries) : null
}

function eyesOf(object: ReadonlyMap<string, unknown>): EyeMeasures | null {
  const left = eyeOf(object.get('left'))
  const right = eyeOf(object.get('right'))
  return left === null || right === null ? null : { left, right }
}

const edgeKeys = ['left', 'right', 'up', 'down'] as const
function edgesOf(value: unknown): EdgeAngles | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const edges = new Map(Object.entries(value))
  if (!hasExactKeys(edges, edgeKeys) || edgeKeys.some((key) => typeof edges.get(key) !== 'number')) return null
  return Object.fromEntries(edges) as unknown as EdgeAngles
}

function ceilingOf(value: unknown): Ceiling | null {
  if (value === null) return { source: 'none' }
  if (typeof value !== 'object' || Array.isArray(value)) return null
  const ceiling = new Map(Object.entries(value))
  const left = edgesOf(ceiling.get('left'))
  const right = edgesOf(ceiling.get('right'))
  const canting = ceiling.get('canting')
  if (!hasExactKeys(ceiling, ['left', 'right', 'canting']) || left === null || right === null) return null
  return typeof canting === 'number' ? { source: 'measured', left, right, canting } : null
}

interface DecodedMeasure {
  readonly measures: EyeMeasures
  readonly ceiling: Ceiling
  readonly cornerMask: CornerMask
  readonly provenance: Provenance
  readonly reportedHeadset: string
}
type MeasureResult = { readonly ok: true; readonly decoded: DecodedMeasure } | { readonly ok: false; readonly error: IssueError }

const failure = (error: IssueError): MeasureResult => ({ ok: false, error })
const noCeiling = { ceiling: { source: 'none' }, cornerMask: 'unknown', reportedHeadset: '' } as const

function typedMeasure(object: ReadonlyMap<string, unknown>): MeasureResult {
  const measures = hasExactKeys(object, ['left', 'right']) ? eyesOf(object) : null
  if (measures === null) return failure('measure-invalid')
  return { ok: true, decoded: { measures, ...noCeiling, provenance: { input: 'typed', linkData: null } } }
}

function atlasMeasure(text: string): MeasureResult {
  const object = jsonObject(text)
  if (object === null || !hasExactKeys(object, ['left', 'right', 'ceiling', 'cornerMask'])) return failure('measure-invalid')
  const measures = eyesOf(object)
  const ceiling = ceilingOf(object.get('ceiling'))
  const cornerMask = object.get('cornerMask')
  if (measures === null || ceiling === null || !cornerMaskStates.includes(cornerMask as CornerMask)) {
    return failure('measure-invalid')
  }
  const input = ceiling.source === 'measured' ? 'measured' : 'typed'
  return {
    ok: true,
    decoded: { measures, ceiling, cornerMask: cornerMask as CornerMask, provenance: { input, linkData: null }, reportedHeadset: '' },
  }
}

function vrhpMeasure(text: string): MeasureResult {
  if (text.startsWith('{')) {
    const object = jsonObject(text)
    return object === null ? failure('measure-invalid') : typedMeasure(object)
  }
  const result = decodeVrhpLink(text)
  if (!result.ok) return failure(`vrhp-${result.error}`)
  const { left, right, rendered, headsetName } = result.measure
  // Head frame: the left eye's temporal edge is on the left, the right eye's on the right.
  const measures = {
    left: { left: left.temporal, right: left.nasal, up: left.up, down: left.down, 'down-left': left.diagonal },
    right: { left: right.nasal, right: right.temporal, up: right.up, down: right.down, 'up-right': right.diagonal },
  }
  return {
    ok: true,
    decoded: {
      measures,
      ceiling: rendered === null ? { source: 'none' } : { source: 'link', totals: rendered },
      cornerMask: 'unknown',
      provenance: { input: 'link', linkData: extractResultsParameter(text) },
      reportedHeadset: headsetName,
    },
  }
}

/** Pasted points, typed angles, or nothing; the pasted form keeps WIMFOV's own text layout. */
function wimfovPastedMeasure(text: string): MeasureResult {
  const object = text.startsWith('{') ? jsonObject(text) : null
  if (object !== null && !object.has('points')) return typedMeasure(object)
  const pasted = parseWimfovPoints(text)
  if (!pasted.ok) return failure(pasted.error)
  return { ok: true, decoded: { measures: pasted.measures, ...noCeiling, provenance: { input: 'paste', linkData: null } } }
}

function sameMeasures(first: EyeMeasures, second: EyeMeasures): boolean {
  const canonical = ({ left, right }: EyeMeasures): string =>
    JSON.stringify([left, right].map((eye) => Object.entries(eye).sort(([one], [other]) => one.localeCompare(other))))
  return canonical(first) === canonical(second)
}

function wimfovMeasure(text: string, linkText: string, page: string | undefined): MeasureResult {
  if (linkText === '') return text === '' ? failure('measure-missing') : wimfovPastedMeasure(text)
  const link = parseWimfovLink(linkText)
  if (!link.ok) return failure(link.error)
  if (page === undefined) return failure('wimfov-page-unavailable')
  const fetched = parseWimfovPage(page, link.resultId)
  if (!fetched.ok) return failure(fetched.error)
  if (text !== '') {
    // Both given: they must be the same result, or one of them was pasted by mistake.
    const pasted = wimfovPastedMeasure(text)
    if (!pasted.ok) return pasted
    if (!sameMeasures(pasted.decoded.measures, fetched.measures)) return failure('wimfov-mismatch')
  }
  return {
    ok: true,
    decoded: {
      measures: fetched.measures,
      ...noCeiling,
      provenance: { input: 'link', linkData: link.resultId },
      reportedHeadset: fetched.model,
    },
  }
}

function testHmdMeasure(text: string): MeasureResult {
  const object = jsonObject(text)
  if (object === null || !hasExactKeys(object, ['horizontal', 'vertical'])) return failure('measure-invalid')
  const result = testHmdMeasures(object.get('horizontal'), object.get('vertical'))
  if (!result.ok) return failure(result.error)
  return { ok: true, decoded: { measures: result.measures, ...noCeiling, provenance: { input: 'typed', linkData: null } } }
}

function decodeMeasure(tool: Tool, fields: IssueFields, options: ParseOptions): MeasureResult {
  const text = fields.measure
  if (text.length > maximumMeasureLength) return failure('measure-invalid')
  if (tool !== 'wimfov' && fields['wimfov-link'] !== '') return failure('wimfov-link-wrong-tool')
  if (tool === 'wimfov') return wimfovMeasure(text, fields['wimfov-link'], options.wimfovPage)
  if (text === '') return failure('measure-missing')
  if (tool === 'atlas') return atlasMeasure(text)
  if (tool === 'vrhp') return vrhpMeasure(text)
  return testHmdMeasure(text)
}

function choiceOf<Choice extends string>(value: string, choices: readonly Choice[]): Choice | null {
  return choices.includes(value as Choice) ? (value as Choice) : null
}

const yesNo = ['yes', 'no'] as const
const ipdPattern = /^\d{2}(?:\.\d)?$/

export function submissionFromFields(fields: IssueFields, options: ParseOptions = {}): IssueParseResult {
  const reject = (error: IssueError): IssueParseResult => ({ ok: false, error })
  const tool = choiceOf(fields.tool, tools)
  if (tool === null) return reject('tool-invalid')
  const headsetError = headsetProblem(fields.headset, fields['headset-name'])
  if (headsetError !== null) return reject(headsetError)
  const eyeDepth = choiceOf(fields['eye-depth'], eyeDepths)
  if (eyeDepth === null) return reject('eye-depth-invalid')
  const noseBridge = choiceOf(fields['nose-bridge'], noseBridges)
  if (noseBridge === null) return reject('nose-bridge-invalid')
  const modded = choiceOf(fields.modded, yesNo)
  if (modded === null) return reject('modded-invalid')
  const tuned = choiceOf(fields.tuned, yesNo)
  if (tuned === null) return reject('tuned-invalid')
  const gaze = choiceOf(fields.gaze, gazes)
  if (gaze === null) return reject('gaze-invalid')
  if (fields.ipd !== '' && !ipdPattern.test(fields.ipd)) return reject('ipd-invalid')

  const measure = decodeMeasure(tool, fields, options)
  if (!measure.ok) return measure
  const submission: Submission = {
    tool,
    headset: fields.headset,
    otherHeadsetName: fields['headset-name'],
    ...measure.decoded,
    face: { eyeDepth, noseBridge },
    tuning: { physicallyModded: modded === 'yes', driverTuned: tuned === 'yes', details: fields['tuning-details'] },
    gaze,
    ipd: fields.ipd === '' ? null : Number(fields.ipd),
    facialInterface: fields['facial-interface'],
    note: fields.note,
  }
  const problem = submissionProblem(submission)
  return problem === null ? { ok: true, submission } : reject(problem)
}

export function parseIssueBody(markdown: string, options: ParseOptions = {}): IssueParseResult {
  const form = readIssueForm(markdown)
  return form.ok ? submissionFromFields(form.fields, options) : form
}

/** The WIMFOV result the Action has to fetch before parsing, if the issue gives a link. */
export function wimfovResultToFetch(markdown: string): string | null {
  const form = readIssueForm(markdown)
  if (!form.ok || form.fields.tool !== 'wimfov' || form.fields['wimfov-link'] === '') return null
  const link = parseWimfovLink(form.fields['wimfov-link'])
  return link.ok ? link.resultId : null
}

/** The Measure field of a FOV Atlas issue: the values, the rendered field of view read with them, and the corner mask. */
export function atlasMeasureText(measures: EyeMeasures, ceiling: Ceiling, cornerMask: CornerMask): string {
  return JSON.stringify({
    left: measures.left,
    right: measures.right,
    ceiling: ceiling.source === 'measured' ? { left: ceiling.left, right: ceiling.right, canting: ceiling.canting } : null,
    cornerMask,
  })
}

function measureText(submission: Submission): string {
  const { measures, provenance, ceiling } = submission
  const typed = JSON.stringify({ left: measures.left, right: measures.right })
  switch (submission.tool) {
    case 'atlas':
      return atlasMeasureText(measures, ceiling, submission.cornerMask)
    case 'vrhp':
      return provenance.input === 'link' && provenance.linkData !== null ? provenance.linkData : typed
    case 'wimfov':
      if (provenance.input === 'link') return ''
      return provenance.input === 'paste' ? formatWimfovPoints(measures) : typed
    case 'testhmd':
      return JSON.stringify(testHmdTotals(measures))
  }
}

export function issueFieldsOf(submission: Submission): IssueFields {
  const { provenance, tuning } = submission
  const wimfovLink =
    submission.tool === 'wimfov' && provenance.input === 'link' && provenance.linkData !== null
      ? wimfovResultLink(provenance.linkData)
      : ''
  return {
    tool: submission.tool,
    headset: submission.headset,
    'headset-name': submission.otherHeadsetName,
    measure: measureText(submission),
    'wimfov-link': wimfovLink,
    'eye-depth': submission.face.eyeDepth,
    'nose-bridge': submission.face.noseBridge,
    modded: tuning.physicallyModded ? 'yes' : 'no',
    tuned: tuning.driverTuned ? 'yes' : 'no',
    'tuning-details': tuning.details,
    gaze: submission.gaze,
    ipd: submission.ipd === null ? '' : String(submission.ipd),
    'facial-interface': submission.facialInterface,
    note: submission.note,
  }
}

export type IssueUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly error: SubmissionError | 'url-too-long' }

/**
 * The prefilled "new issue" link for fields that were already checked. A WIMFOV read-only link
 * can only be checked by the Action, which fetches the result page, so the site builds the link
 * from fields in that case.
 */
export function issueUrlOfFields(fields: IssueFields): IssueUrlResult {
  const headsetLabel = fields.headset === otherHeadset ? fields['headset-name'] : fields.headset
  const parameters: [string, string][] = [
    ['template', issueTemplate],
    ['title', `Measure: ${headsetLabel} (${fields.tool})`],
    ...Object.entries(fields).filter(([, value]) => value !== ''),
  ]
  const query = parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')
  const url = `${newIssueUrl}?${query}`
  return url.length > maximumUrlLength ? { ok: false, error: 'url-too-long' } : { ok: true, url }
}

/** The prefilled "new issue" link; the visitor only has to press Create. */
export function buildIssueUrl(submission: Submission): IssueUrlResult {
  const problem = submissionProblem(submission)
  return problem === null ? issueUrlOfFields(issueFieldsOf(submission)) : { ok: false, error: problem }
}

export interface HeadsetChoice {
  readonly headset: string
  /** The name to type in when `headset` is `other`, else empty. */
  readonly otherHeadsetName: string
}

/**
 * The headset a VR Headset Picker link preselects: its id when the catalog has it, else `other`
 * with the link's name, or nothing when the link names no headset this form would accept.
 */
export function headsetChoiceOfVrhpLink({ headsetId, headsetName }: VrhpMeasure): HeadsetChoice | null {
  if (catalogHeadset(headsetId) !== undefined) return { headset: headsetId, otherHeadsetName: '' }
  return headsetProblem(otherHeadset, headsetName) === null ? { headset: otherHeadset, otherHeadsetName: headsetName } : null
}
