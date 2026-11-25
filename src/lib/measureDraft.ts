/**
 * The "Add a measure" form for a result from another tool, and the "Finish your measure" form
 * after measuring with FOV Atlas: what the visitor has entered so far, the check of each step,
 * and the prefilled GitHub issue it ends with.
 *
 * Everything entered here is checked with the same parsers the submission Action runs on the
 * issue, so a form that passes here opens an issue the Action accepts. The one exception is a
 * WIMFOV read-only link: its result page sits on another site, which the browser is not allowed
 * to fetch, so only the Action reads it.
 */

import { catalogHeadset, otherHeadset } from './headsets.ts'
import { atlasMeasureText, headsetChoiceOfVrhpLink, issueUrlOfFields, submissionFromFields, type IssueError, type IssueFields } from './issueForm.ts'
import type { AtlasMeasure } from './measureSession.ts'
import { plainTextProblem } from './plainText.ts'
import {
  headsetProblem,
  ipdRange,
  keptSubmissionProblem,
  textLimits,
  type EyeDepth,
  type EyeMeasures,
  type Gaze,
  type KeptSubmission,
  type NoseBridge,
  type Submission,
} from './submission.ts'
import { testHmdMeasures } from './testHmd.ts'
import { decodeVrhpLink, extractResultsParameter, type VrhpDecodeError, type VrhpMeasure } from './vrhpLink.ts'
import { formatWimfovPoints, parseWimfovLink, parseWimfovPoints, wimfovOrigin, wimfovResultLink, type WimfovError } from './wimfov.ts'

/** The tools picked in the Tool step. FOV Atlas is not among them: its measure comes from the measuring page. */
export const importTools = ['vrhp', 'wimfov', 'testhmd'] as const
export type ImportTool = (typeof importTools)[number]
/** FOV Atlas comes in from its own measure, with the values already known (see `finishDraft`). */
export type DraftTool = ImportTool | 'atlas'

export type WimfovInput = 'link' | 'points'

export interface MeasureDraft {
  tool: DraftTool | null
  /** The measure just taken, when finishing a FOV Atlas measure. */
  atlasMeasure: AtlasMeasure | null
  vrhpLink: string
  wimfovInput: WimfovInput
  wimfovLink: string
  wimfovPoints: string
  testHmdHorizontal: string
  testHmdVertical: string
  /** A catalog brand, `other` for a model the catalog lacks, or empty before a choice. */
  brand: string
  /** A catalog id, `other`, or empty before a choice. */
  headset: string
  otherHeadsetName: string
  /** The VR Headset Picker `results` value whose headset was last preselected. */
  prefilledFrom: string
  eyeDepth: EyeDepth | null
  noseBridge: NoseBridge | null
  physicallyModded: boolean
  driverTuned: boolean
  tuningDetails: string
  gaze: Gaze | null
  ipd: string
  facialInterface: string
  note: string
}

export function emptyDraft(): MeasureDraft {
  return {
    tool: null,
    atlasMeasure: null,
    vrhpLink: '',
    wimfovInput: 'link',
    wimfovLink: '',
    wimfovPoints: '',
    testHmdHorizontal: '',
    testHmdVertical: '',
    brand: '',
    headset: '',
    otherHeadsetName: '',
    prefilledFrom: '',
    eyeDepth: null,
    noseBridge: null,
    physicallyModded: false,
    driverTuned: false,
    tuningDetails: '',
    gaze: null,
    ipd: '',
    facialInterface: '',
    note: '',
  }
}

/** The draft of "Finish your measure": tool and values known, everything else still to answer. */
export function finishDraft(measure: AtlasMeasure): MeasureDraft {
  return { ...emptyDraft(), tool: 'atlas', atlasMeasure: measure }
}

export const steps = ['Tool', 'Values', 'Headset', 'Face fit', 'Setup', 'Review'] as const
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5
export const lastStep: StepIndex = 5

export type Values =
  | { readonly kind: 'atlas'; readonly measure: AtlasMeasure }
  | { readonly kind: 'vrhp'; readonly measure: VrhpMeasure; readonly results: string }
  | { readonly kind: 'wimfov-link'; readonly resultId: string }
  | { readonly kind: 'wimfov-points'; readonly measures: EyeMeasures }
  | { readonly kind: 'testhmd'; readonly measures: EyeMeasures; readonly horizontal: number; readonly vertical: number }

export type ValuesProblem =
  | 'no-tool'
  | 'empty'
  | 'wimfov-edit-link'
  | 'wimfov-not-a-link'
  | 'testhmd-not-a-number'
  | 'testhmd-out-of-range'
  | `vrhp-${VrhpDecodeError}`
  | WimfovError

export type ValuesResult = { readonly ok: true; readonly values: Values } | { readonly ok: false; readonly problem: ValuesProblem }

const rejectValues = (problem: ValuesProblem): ValuesResult => ({ ok: false, problem })

function vrhpValues(link: string): ValuesResult {
  if (link.trim() === '') return rejectValues('empty')
  const decoded = decodeVrhpLink(link)
  if (!decoded.ok) return rejectValues(`vrhp-${decoded.error}`)
  // A link that decodes always carries its `results` value.
  const results = extractResultsParameter(link) ?? ''
  return { ok: true, values: { kind: 'vrhp', measure: decoded.measure, results } }
}

function wimfovLinkValues(link: string): ValuesResult {
  if (link.trim() === '') return rejectValues('empty')
  const parsed = parseWimfovLink(link)
  if (parsed.ok) return { ok: true, values: { kind: 'wimfov-link', resultId: parsed.resultId } }
  // Any other address on WIMFOV's site may be the private edit link, which must never be posted.
  return rejectValues(URL.parse(link.trim())?.origin === wimfovOrigin ? 'wimfov-edit-link' : 'wimfov-not-a-link')
}

function wimfovPointsValues(points: string): ValuesResult {
  if (points.trim() === '') return rejectValues('empty')
  const parsed = parseWimfovPoints(points)
  return parsed.ok ? { ok: true, values: { kind: 'wimfov-points', measures: parsed.measures } } : rejectValues(parsed.error)
}

const totalPattern = /^\d{1,3}(?:\.\d)?$/

function testHmdValues(horizontalText: string, verticalText: string): ValuesResult {
  const [horizontalTrimmed, verticalTrimmed] = [horizontalText.trim(), verticalText.trim()]
  if (horizontalTrimmed === '' || verticalTrimmed === '') return rejectValues('empty')
  if (!totalPattern.test(horizontalTrimmed) || !totalPattern.test(verticalTrimmed)) return rejectValues('testhmd-not-a-number')
  const [horizontal, vertical] = [Number(horizontalTrimmed), Number(verticalTrimmed)]
  const result = testHmdMeasures(horizontal, vertical)
  if (!result.ok) return rejectValues(result.error)
  return { ok: true, values: { kind: 'testhmd', measures: result.measures, horizontal, vertical } }
}

export function valuesOf(draft: MeasureDraft): ValuesResult {
  switch (draft.tool) {
    case null:
      return rejectValues('no-tool')
    case 'atlas':
      return draft.atlasMeasure === null ? rejectValues('empty') : { ok: true, values: { kind: 'atlas', measure: draft.atlasMeasure } }
    case 'vrhp':
      return vrhpValues(draft.vrhpLink)
    case 'wimfov':
      return draft.wimfovInput === 'link' ? wimfovLinkValues(draft.wimfovLink) : wimfovPointsValues(draft.wimfovPoints)
    case 'testhmd':
      return testHmdValues(draft.testHmdHorizontal, draft.testHmdVertical)
  }
}

const vrhpDamaged = "The link looks cut off or changed. Copy it again from VR Headset Picker's results page."

const valuesMessages = new Map<ValuesProblem, string>(Object.entries({
  'vrhp-too-long': 'That is longer than any VR Headset Picker link. Paste only the share link.',
  'vrhp-no-results-parameter': "That doesn't look like a VR Headset Picker share link: it should contain “results=”.",
  'vrhp-not-base64url': vrhpDamaged,
  'vrhp-too-short': vrhpDamaged,
  'vrhp-trailing-data': vrhpDamaged,
  'vrhp-unsupported-version': 'This link comes from a version of VR Headset Picker this site cannot read yet.',
  'vrhp-angle-out-of-range': 'The link holds an angle VR Headset Picker cannot record, so it was probably changed.',
  'vrhp-total-out-of-range': 'The link holds a rendered total no headset reaches, so it was probably changed.',
  'vrhp-headset-name-invalid': "The headset name in the link can't be read.",
  'vrhp-headset-id-invalid': "The headset in the link can't be read.",
  'wimfov-edit-link':
    'This is not the read-only link. It may be your private edit link: anyone holding it can change or delete your result, and the GitHub issue is public. On your WIMFOV result page, copy the read-only link, the one ending in “?id=…”.',
  'wimfov-not-a-link': 'Paste the read-only link of your WIMFOV result: https://andreasaronsson.com/!apps/wimfov/?id=…',
  'wimfov-link-not-read-only': 'Paste the read-only link of your WIMFOV result.',
  'wimfov-points-invalid':
    'Paste the “points” line from your WIMFOV result: two groups of 16 numbers separated by “|”.',
  'wimfov-angle-out-of-range': 'One of the angles is above 180°, which no measure can reach.',
  'wimfov-page-too-large': 'That is not a WIMFOV result.',
  'wimfov-page-unrecognised': 'That is not a WIMFOV result.',
  'wimfov-page-id-mismatch': 'That is not a WIMFOV result.',
  'testhmd-not-a-number': 'Type each angle as a number of degrees, with at most one decimal, such as 102 or 102.5.',
  'testhmd-out-of-range': 'Each angle has to be above 0° and at most 360°.',
} satisfies Record<Exclude<ValuesProblem, 'no-tool' | 'empty'>, string>) as [ValuesProblem, string][])

/** What to tell the visitor, or nothing while the field is simply not filled in yet. */
export function valuesMessage(problem: ValuesProblem): string | null {
  return valuesMessages.get(problem) ?? null
}

/**
 * The headset a newly pasted VR Headset Picker link names, preselected once per link so a choice
 * made afterwards is kept.
 */
export function vrhpPrefill(draft: MeasureDraft): Partial<MeasureDraft> | null {
  const result = valuesOf(draft)
  if (!result.ok || result.values.kind !== 'vrhp' || result.values.results === draft.prefilledFrom) return null
  const choice = headsetChoiceOfVrhpLink(result.values.measure)
  const prefilledFrom = result.values.results
  if (choice === null) return { prefilledFrom }
  const brand = catalogHeadset(choice.headset)?.brand ?? otherHeadset
  return { prefilledFrom, brand, headset: choice.headset, otherHeadsetName: choice.otherHeadsetName }
}

export function headsetReady(draft: MeasureDraft): boolean {
  return draft.headset !== '' && headsetProblem(draft.headset, draft.otherHeadsetName) === null
}

export function headsetMessage(draft: MeasureDraft): string | null {
  if (draft.headset !== otherHeadset || draft.otherHeadsetName.trim() === '') return null
  const problem = headsetProblem(draft.headset, draft.otherHeadsetName)
  if (problem === null) return null
  return problem === 'headset-name-too-long'
    ? `Keep the name to ${String(textLimits.otherHeadsetName)} characters at most.`
    : 'Use plain text for the name: letters, digits and punctuation, without < or >.'
}

export const faceReady = (draft: MeasureDraft): boolean => draft.eyeDepth !== null && draft.noseBridge !== null

export type SetupField = 'tuningDetails' | 'ipd' | 'facialInterface' | 'note'

const ipdPattern = /^\d{2}(?:\.\d)?$/

function textMessage(text: string, maximumLength: number, multiline: boolean): string | undefined {
  const problem = plainTextProblem(text, { maximumLength, multiline })
  if (problem === null) return undefined
  if (problem === 'too-long') return `Keep it to ${String(maximumLength)} characters at most.`
  if (problem === 'heading-line') return 'A line cannot start with #.'
  return 'Use plain text: letters, digits and punctuation, without < or >.'
}

function ipdMessage(text: string): string | undefined {
  const ipd = text.trim()
  const valid = ipd === '' || (ipdPattern.test(ipd) && Number(ipd) >= ipdRange.minimum && Number(ipd) <= ipdRange.maximum)
  return valid
    ? undefined
    : `Between ${String(ipdRange.minimum)} and ${String(ipdRange.maximum)} mm, with at most one decimal, or leave it empty.`
}

/** The setup fields that can't be sent as they are, with what to tell the visitor. */
export function setupProblems(draft: MeasureDraft): Partial<Record<SetupField, string>> {
  const messages: [SetupField, string | undefined][] = [
    ['tuningDetails', textMessage(draft.tuningDetails, textLimits.tuningDetails, false)],
    ['ipd', ipdMessage(draft.ipd)],
    ['facialInterface', textMessage(draft.facialInterface, textLimits.facialInterface, false)],
    ['note', textMessage(draft.note, textLimits.note, true)],
  ]
  return Object.fromEntries(messages.filter(([, message]) => message !== undefined))
}

export const setupReady = (draft: MeasureDraft): boolean =>
  draft.gaze !== null && Object.keys(setupProblems(draft)).length === 0

/** Whether each step is complete; Review has nothing to fill in. */
export function stepReady(draft: MeasureDraft, step: StepIndex): boolean {
  switch (step) {
    case 0:
      return draft.tool !== null
    case 1:
      return valuesOf(draft).ok
    case 2:
      return headsetReady(draft)
    case 3:
      return faceReady(draft)
    case 4:
      return setupReady(draft)
    case 5:
      return true
  }
}

/** The furthest step reachable: every step before it is complete. */
export function furthestStep(draft: MeasureDraft): StepIndex {
  const incomplete = ([0, 1, 2, 3, 4] as const).find((step) => !stepReady(draft, step))
  return incomplete ?? lastStep
}

function measureFields(values: Values): Pick<IssueFields, 'measure' | 'wimfov-link'> {
  switch (values.kind) {
    case 'atlas': {
      const { measures, ceiling, cornerMask } = values.measure
      return { measure: atlasMeasureText(measures, ceiling, cornerMask), 'wimfov-link': '' }
    }
    case 'vrhp':
      return { measure: values.results, 'wimfov-link': '' }
    case 'wimfov-link':
      return { measure: '', 'wimfov-link': wimfovResultLink(values.resultId) }
    case 'wimfov-points':
      return { measure: formatWimfovPoints(values.measures), 'wimfov-link': '' }
    case 'testhmd':
      return { measure: JSON.stringify({ horizontal: values.horizontal, vertical: values.vertical }), 'wimfov-link': '' }
  }
}

type FieldsResult =
  | { readonly ok: true; readonly fields: IssueFields; readonly values: Values }
  | { readonly ok: false; readonly error: 'incomplete' }

function fieldsOf(draft: MeasureDraft): FieldsResult {
  const result = valuesOf(draft)
  if (furthestStep(draft) !== lastStep || !result.ok || draft.tool === null) return { ok: false, error: 'incomplete' }
  const fields: IssueFields = {
    tool: draft.tool,
    headset: draft.headset,
    'headset-name': draft.headset === otherHeadset ? draft.otherHeadsetName.trim() : '',
    ...measureFields(result.values),
    'eye-depth': draft.eyeDepth ?? '',
    'nose-bridge': draft.noseBridge ?? '',
    modded: draft.physicallyModded ? 'yes' : 'no',
    tuned: draft.driverTuned ? 'yes' : 'no',
    'tuning-details': draft.tuningDetails.trim(),
    gaze: draft.gaze ?? '',
    ipd: draft.ipd.trim(),
    'facial-interface': draft.facialInterface.trim(),
    note: draft.note.trim(),
  }
  return { ok: true, fields, values: result.values }
}

export type IssueResult =
  | { readonly ok: true; readonly url: string; readonly fields: IssueFields }
  | { readonly ok: false; readonly error: 'incomplete' | 'url-too-long' | IssueError }

/** The prefilled GitHub issue, once every step is complete and the whole form passes the checks. */
export function issueOf(draft: MeasureDraft): IssueResult {
  const result = fieldsOf(draft)
  if (!result.ok) return result
  if (result.values.kind !== 'wimfov-link') {
    const parsed = submissionFromFields(result.fields)
    if (!parsed.ok) return parsed
  }
  const url = issueUrlOfFields(result.fields)
  return url.ok ? { ok: true, url: url.url, fields: result.fields } : url
}

export type KeptMeasureResult =
  | { readonly ok: true; readonly submission: Submission }
  | { readonly ok: false; readonly error: 'incomplete' | 'wimfov-link' | IssueError }

/**
 * The measure as it would be published, to keep without publishing. A WIMFOV read-only link
 * holds no values the browser can read, so it can't be kept; its points can.
 */
export function keptMeasureOf(draft: MeasureDraft): KeptMeasureResult {
  const result = fieldsOf(draft)
  if (!result.ok) return result
  if (result.values.kind === 'wimfov-link') return { ok: false, error: 'wimfov-link' }
  return submissionFromFields(result.fields)
}

/**
 * A FOV Atlas measure just taken, to keep without publishing before every step is answered. It
 * stores only what is answered: the headset and face fit once given, the setup answers (gaze,
 * tuning, IPD, cushion, note) once the Setup step is complete, and nothing in their place before.
 * With every step answered it is the measure as it would be published.
 */
export function keptFinishedMeasure(draft: MeasureDraft): KeptSubmission | null {
  const measure = draft.atlasMeasure
  if (draft.tool !== 'atlas' || measure === null) return null
  const complete = keptMeasureOf(draft)
  if (complete.ok) return complete.submission
  const headsetGiven = headsetReady(draft)
  const kept: KeptSubmission = {
    tool: 'atlas',
    headset: headsetGiven ? draft.headset : '',
    otherHeadsetName: headsetGiven && draft.headset === otherHeadset ? draft.otherHeadsetName.trim() : '',
    measures: measure.measures,
    ceiling: measure.ceiling,
    cornerMask: measure.cornerMask,
    provenance: { input: 'measured', linkData: null },
    reportedHeadset: '',
    face: draft.eyeDepth === null || draft.noseBridge === null ? null : { eyeDepth: draft.eyeDepth, noseBridge: draft.noseBridge },
    tuning: null,
    gaze: null,
    ipd: null,
    facialInterface: '',
    note: '',
  }
  return keptSubmissionProblem(kept) === null ? kept : null
}
