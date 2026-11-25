/**
 * A submitted measure, as stored in the repository and shown on the site.
 *
 * Angles are degrees from straight ahead, per eye, with directions named in the head frame as the
 * wearer sees it, and are stored exactly as the tool gave them. Each tool keeps its own directions
 * and its own convention; nothing here converts one tool's figures into another's.
 */

import { isFlatPicture } from './ceiling.ts'
import { catalogHeadset, otherHeadset } from './headsets.ts'
import { plainTextProblem, type PlainTextProblem } from './plainText.ts'
import type { RenderedTotals } from './vrhpLink.ts'

export const tools = ['atlas', 'vrhp', 'wimfov', 'testhmd'] as const
export type Tool = (typeof tools)[number]
const toolNames: ReadonlyMap<Tool, string> = new Map([
  ['atlas', 'FOV Atlas'],
  ['vrhp', 'VR Headset Picker'],
  ['wimfov', 'WIMFOV'],
  ['testhmd', 'TestHMD'],
])
export const toolNameOf = (tool: Tool): string => toolNames.get(tool) ?? tool

/**
 * Sixteen directions in radial order, from up toward the wearer's left and around. Every other
 * one is a principal direction; the ones between are the in-betweens WIMFOV also measures, named
 * like compass points (`up-up-left` lies between up and up-left).
 */
export const directions = [
  'up', 'up-up-left', 'up-left', 'left-up-left', 'left', 'left-down-left', 'down-left', 'down-down-left',
  'down', 'down-down-right', 'down-right', 'right-down-right', 'right', 'right-up-right', 'up-right', 'up-up-right',
] as const
export type Direction = (typeof directions)[number]
export const principalDirections: readonly Direction[] = directions.filter((_, index) => index % 2 === 0)

export type EyeMeasure = Readonly<Partial<Record<Direction, number>>>
export interface EyeMeasures {
  readonly left: EyeMeasure
  readonly right: EyeMeasure
}

/**
 * How far one eye's picture reaches, as the headset reports it to the browser while measuring
 * with FOV Atlas: angles from straight ahead of the head along each principal direction, like the
 * measures, so the turn of the eye's picture is included.
 */
export interface EdgeAngles {
  readonly left: number
  readonly right: number
  readonly up: number
  readonly down: number
}

/**
 * The rendered field of view of the headset the measure was taken with: what that headset itself
 * reports it draws, the most anyone could see with it. FOV Atlas reads each eye's edges while
 * measuring; a VR Headset Picker link carries the totals VR Headset Picker read. Other tools and
 * typed values carry none.
 */
export type Ceiling =
  | {
      readonly source: 'measured'
      readonly left: EdgeAngles
      readonly right: EdgeAngles
      /**
       * How far each eye's picture is turned away from the nose, in degrees. The edges already
       * include it; the outline of each picture is drawn from both.
       */
      readonly canting: number
    }
  | { readonly source: 'link'; readonly totals: RenderedTotals }
  | { readonly source: 'none' }

/** Never asked: read from the browser while measuring with FOV Atlas, unknown otherwise. */
export const cornerMaskStates = ['on', 'unknown'] as const
export type CornerMask = (typeof cornerMaskStates)[number]

export const eyeDepths = ['deep-set', 'in-between', 'almost-flush'] as const
export type EyeDepth = (typeof eyeDepths)[number]
export const noseBridges = ['low', 'in-between', 'high'] as const
export type NoseBridge = (typeof noseBridges)[number]
export const gazes = ['fixed', 'free'] as const
export type Gaze = (typeof gazes)[number]

/**
 * How the values reached the issue: measured on this site, decoded from a tool's link, pasted from
 * a tool's result page, or typed by hand.
 */
export const inputKinds = ['measured', 'link', 'paste', 'typed'] as const
export type InputKind = (typeof inputKinds)[number]
export interface Provenance {
  readonly input: InputKind
  /** The VR Headset Picker `results` value or the WIMFOV read-only result id, for `link` input. */
  readonly linkData: string | null
}

export interface TuningAnswers {
  readonly physicallyModded: boolean
  readonly driverTuned: boolean
  readonly details: string
}

export interface FaceFit {
  readonly eyeDepth: EyeDepth
  readonly noseBridge: NoseBridge
}

export interface Submission {
  readonly tool: Tool
  /** A catalog id, or `other` for a model the catalog lacks; such a submission is never stored. */
  readonly headset: string
  /** The model's name as typed by the submitter when `headset` is `other`, else empty. */
  readonly otherHeadsetName: string
  readonly measures: EyeMeasures
  readonly ceiling: Ceiling
  readonly cornerMask: CornerMask
  readonly provenance: Provenance
  /** The tool's own label for the headset (VR Headset Picker link, WIMFOV page), or empty. */
  readonly reportedHeadset: string
  readonly face: FaceFit
  readonly tuning: TuningAnswers
  readonly gaze: Gaze
  /** Lens IPD in millimetres. */
  readonly ipd: number | null
  readonly facialInterface: string
  readonly note: string
}

/**
 * A measure kept without publishing it (see `measureFile.ts`). It can be kept straight after
 * measuring, before the remaining questions are asked, and stores only what was answered: an
 * empty `headset` (with no typed name) and a null `face`, `tuning` or `gaze` mean not given.
 * Publishing always needs them.
 */
export interface KeptSubmission extends Omit<Submission, 'face' | 'tuning' | 'gaze'> {
  readonly face: FaceFit | null
  readonly tuning: TuningAnswers | null
  readonly gaze: Gaze | null
}

/** Whether a kept measure leaves its headset out. */
export const leavesHeadsetOut = (kept: Pick<KeptSubmission, 'headset' | 'otherHeadsetName'>): boolean =>
  kept.headset === '' && kept.otherHeadsetName === ''

/**
 * Angles are radial, measured from straight ahead of the head, and can reach straight behind.
 * VR Headset Picker links are the exception: they store each angle per rendered view, projected
 * onto a flat plane in hmdq's tangent convention, where 90° from the view's own axis lies at
 * infinity. A link value of 90 or more is therefore malformed, not a wide field of view; the
 * format simply cannot express one, while a canted view still reaches past 90° in the head frame.
 */
export const maximumRadialDegrees = 180
export const projectedLimitDegrees = 90
export type AngleConvention = 'radial' | 'projected'
export const maximumCantingDegrees = 45
export const ipdRange = { minimum: 45, maximum: 85 } as const
export const textLimits = {
  headset: 48,
  otherHeadsetName: 80,
  reportedHeadset: 128,
  tuningDetails: 200,
  facialInterface: 200,
  note: 500,
} as const

interface DirectionRule {
  readonly required: readonly Direction[]
  readonly allowed: readonly Direction[]
}
type EyeRules = Readonly<Record<keyof EyeMeasures, DirectionRule>>

const exactly = (required: readonly Direction[]): DirectionRule => ({ required, allowed: required })
const principalRequired: DirectionRule = { required: principalDirections, allowed: directions }

/**
 * VR Headset Picker measures four edges and one outer diagonal per eye. TestHMD measures both
 * eyes at once, so only each eye's outer edge and the shared top and bottom exist.
 */
export const directionRules: ReadonlyMap<Tool, EyeRules> = new Map([
  ['atlas', { left: principalRequired, right: principalRequired }],
  ['wimfov', { left: principalRequired, right: principalRequired }],
  [
    'vrhp',
    {
      left: exactly(['left', 'right', 'up', 'down', 'down-left']),
      right: exactly(['left', 'right', 'up', 'down', 'up-right']),
    },
  ],
  ['testhmd', { left: exactly(['left', 'up', 'down']), right: exactly(['right', 'up', 'down']) }],
])

const allowedCeilings: ReadonlyMap<Tool, readonly Ceiling['source'][]> = new Map([
  ['atlas', ['measured', 'none']],
  ['vrhp', ['link', 'none']],
  ['wimfov', ['none']],
  ['testhmd', ['none']],
])

const allowedCornerMasks: ReadonlyMap<Ceiling['source'], readonly CornerMask[]> = new Map([
  ['measured', ['on', 'unknown']],
  ['link', ['unknown']],
  ['none', ['unknown']],
])

const allowedInputs: ReadonlyMap<Tool, readonly InputKind[]> = new Map([
  ['atlas', ['measured', 'typed']],
  ['vrhp', ['link', 'typed']],
  ['wimfov', ['link', 'paste', 'typed']],
  ['testhmd', ['typed']],
])

export type SubmissionError =
  | 'unknown-tool'
  | 'headset-invalid'
  | 'headset-name-missing'
  | 'headset-name-unexpected'
  | 'missing-direction'
  | 'unexpected-direction'
  | 'angle-out-of-range'
  | 'testhmd-not-symmetric'
  | 'ceiling-not-allowed'
  | 'ceiling-out-of-range'
  | 'corner-mask-not-allowed'
  | 'input-not-allowed'
  | 'reported-headset-invalid'
  | 'ipd-out-of-range'
  | `${TextField}-${PlainTextProblem}`

export type TextField = 'headset-name' | 'tuning-details' | 'facial-interface' | 'note'

const headsetPattern = /^[a-z0-9-]+$/

/** Hundredths of a degree is the finest step any tool reports. */
export function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

export function isAngle(value: unknown, convention: AngleConvention): value is number {
  const withinLimit = convention === 'radial' ? (value as number) <= maximumRadialDegrees : (value as number) < projectedLimitDegrees
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && withinLimit && hasAtMostDecimals(value, 2)
}

/** Only angles decoded from a VR Headset Picker link are projected; everything else is radial. */
export function angleConventionOf(tool: Tool, input: InputKind): AngleConvention {
  return tool === 'vrhp' && input === 'link' ? 'projected' : 'radial'
}

export function isHeadsetId(value: string): boolean {
  return (
    value.length <= textLimits.headset &&
    headsetPattern.test(value) &&
    !value.startsWith('-') &&
    !value.endsWith('-') &&
    !value.includes('--')
  )
}

function eyeProblem(measure: EyeMeasure, rule: DirectionRule, convention: AngleConvention): SubmissionError | null {
  const given = Object.keys(measure)
  if (given.some((direction) => !rule.allowed.includes(direction as Direction))) return 'unexpected-direction'
  if (rule.required.some((direction) => !given.includes(direction))) return 'missing-direction'
  return Object.values(measure).every((angle) => isAngle(angle, convention)) ? null : 'angle-out-of-range'
}

/** A catalog id with no typed name, or `other` with the model's name typed in. */
export function headsetProblem(headset: string, otherHeadsetName: string): SubmissionError | null {
  if (headset !== otherHeadset) {
    if (catalogHeadset(headset) === undefined) return 'headset-invalid'
    return otherHeadsetName === '' ? null : 'headset-name-unexpected'
  }
  if (otherHeadsetName.trim() === '') return 'headset-name-missing'
  return textProblem('headset-name', otherHeadsetName, textLimits.otherHeadsetName)
}

/** TestHMD's halves: one horizontal and one vertical figure, split evenly over the edges. */
function testHmdSymmetric({ left, right }: EyeMeasures): boolean {
  return left.left === right.right && left.up === right.up && left.down === right.down && left.up === left.down
}

/** Whether a rendered field of view read while measuring can bound each eye's flat picture. */
export function ceilingProblem(ceiling: Ceiling): SubmissionError | null {
  if (ceiling.source !== 'measured') return null
  const edgesValid = [ceiling.left, ceiling.right].every((edges) =>
    Object.values(edges).every((angle) => isAngle(angle, 'radial')),
  )
  const cantingValid = Number.isFinite(ceiling.canting) && Math.abs(ceiling.canting) <= maximumCantingDegrees
  // The rendered field of view is a flat picture per eye; heights and outlines are worked out from it.
  const flat = isFlatPicture(ceiling.left, ceiling.canting, 'left') && isFlatPicture(ceiling.right, ceiling.canting, 'right')
  return edgesValid && cantingValid && flat ? null : 'ceiling-out-of-range'
}

function textProblem(field: TextField, text: string, maximumLength: number, multiline = false): SubmissionError | null {
  const problem = plainTextProblem(text, { maximumLength, multiline })
  return problem === null ? null : `${field}-${problem}`
}

/** Checks every invariant of a submission; the first problem found is returned. */
export const submissionProblem = (submission: Submission): SubmissionError | null => measureProblem(submission, false)

/** Checks a kept measure: a submission's invariants, its headset and face fit allowed to be left out. */
export const keptSubmissionProblem = (kept: KeptSubmission): SubmissionError | null => measureProblem(kept, leavesHeadsetOut(kept))

function measureProblem(submission: KeptSubmission, headsetLeftOut: boolean): SubmissionError | null {
  const { tool, measures, ceiling } = submission
  const rules = directionRules.get(tool)
  if (rules === undefined) return 'unknown-tool'
  const headsetError = headsetLeftOut ? null : headsetProblem(submission.headset, submission.otherHeadsetName)
  if (headsetError !== null) return headsetError
  const convention = angleConventionOf(tool, submission.provenance.input)
  const eyeError = eyeProblem(measures.left, rules.left, convention) ?? eyeProblem(measures.right, rules.right, convention)
  if (eyeError !== null) return eyeError
  if (tool === 'testhmd' && !testHmdSymmetric(measures)) return 'testhmd-not-symmetric'
  if (allowedCeilings.get(tool)?.includes(ceiling.source) !== true) return 'ceiling-not-allowed'
  const ceilingError = ceilingProblem(ceiling)
  if (ceilingError !== null) return ceilingError
  if (allowedCornerMasks.get(ceiling.source)?.includes(submission.cornerMask) !== true) return 'corner-mask-not-allowed'
  if (allowedInputs.get(tool)?.includes(submission.provenance.input) !== true) return 'input-not-allowed'
  if (plainTextProblem(submission.reportedHeadset, { maximumLength: textLimits.reportedHeadset, multiline: false }) !== null) {
    return 'reported-headset-invalid'
  }
  const { ipd } = submission
  if (ipd !== null && !(ipd >= ipdRange.minimum && ipd <= ipdRange.maximum && hasAtMostDecimals(ipd, 1))) {
    return 'ipd-out-of-range'
  }
  return (
    (submission.tuning === null ? null : textProblem('tuning-details', submission.tuning.details, textLimits.tuningDetails)) ??
    textProblem('facial-interface', submission.facialInterface, textLimits.facialInterface) ??
    textProblem('note', submission.note, textLimits.note, true)
  )
}
