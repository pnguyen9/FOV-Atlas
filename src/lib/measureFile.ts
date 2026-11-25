/**
 * A measure kept without publishing it: saved as a file, copied as text, or carried in a link.
 *
 * The format is the submission itself, tagged with a format name and version so later versions
 * can be told apart. In a link it sits base64url-encoded in the URL fragment
 * (`#compare?measure=…`), which browsers never send to any server.
 *
 * A kept measure comes back from anyone (a pasted link, a file from a forum), so the parser checks
 * the length, the exact shape of every object and every range through the submission rules, and
 * rejects anything unexpected, never repairing it. A kept measure may leave its headset and face
 * fit, tuning and gaze out (see `KeptSubmission`); everything else follows the submission rules.
 */

import { base64UrlToBytes, bytesToBase64Url } from './base64url.ts'
import { isBoolean, isFiniteNumber, isPlainObject, isString, matches, oneOf, parseJson } from './json.ts'
import {
  cornerMaskStates,
  eyeDepths,
  gazes,
  inputKinds,
  isEdgesShape,
  isEyeShape,
  noseBridges,
  keptSubmissionProblem,
  maximumTotalDegrees,
  tools,
  type KeptSubmission,
  type SubmissionError,
} from './submission.ts'
import { totalNames } from './vrhpLink.ts'

export const measureFormat = 'fov-atlas-measure'
export const measureFormatVersion = 1
/** Far above any valid measure (about 1.5 kB); caps the work done on hostile input. */
export const maximumMeasureTextLength = 8192
/** The measure's base64url text grows by a third over the JSON. */
export const maximumEncodedLength = Math.ceil((maximumMeasureTextLength * 4) / 3)
/** The query parameter carrying a kept measure in a link. */
export const measureParameter = 'measure'
/** The Compare page's route, which a kept measure's link opens; `hashRoute.ts` reads and builds it from here. */
export const measureRoute = 'compare'

export interface MeasureFile {
  readonly format: typeof measureFormat
  readonly version: typeof measureFormatVersion
  readonly submission: KeptSubmission
}

export type MeasureFileError =
  | 'too-long'
  | 'not-json'
  | 'not-a-measure'
  | 'unsupported-version'
  | 'shape-invalid'
  | 'not-base64url'
  | 'no-measure-in-link'
  | SubmissionError

export type MeasureFileResult =
  | { readonly ok: true; readonly submission: KeptSubmission }
  | { readonly ok: false; readonly error: MeasureFileError }

/** The file's text: readable JSON, so a saved file can be checked by eye. */
export function encodeMeasureText(submission: KeptSubmission): string {
  const file: MeasureFile = { format: measureFormat, version: measureFormatVersion, submission }
  return `${JSON.stringify(file, null, 2)}\n`
}

/** The `measure` value of a link: the compact JSON, UTF-8, base64url. */
export function encodeMeasureParameter(submission: KeptSubmission): string {
  const file: MeasureFile = { format: measureFormat, version: measureFormatVersion, submission }
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(file)))
}

/** A link to the site's Compare page carrying the measure in its fragment. */
export function measureLink(submission: KeptSubmission, siteUrl: string): string {
  const page = siteUrl.split('#')[0] ?? siteUrl
  return `${page}#${measureRoute}?${measureParameter}=${encodeMeasureParameter(submission)}`
}

/** Rendered totals are not range-checked by the submission rules, so they are checked here. */
const isTotal = (value: unknown): boolean => isFiniteNumber(value) && value >= 0 && value <= maximumTotalDegrees
const isTotals = matches(Object.fromEntries(totalNames.map((name) => [name, isTotal])))

function isCeiling(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  switch (value.source) {
    case 'none':
      return matches({ source: isString })(value)
    case 'link':
      return matches({ source: isString, totals: isTotals })(value)
    case 'measured':
      return matches({ source: isString, left: isEdgesShape, right: isEdgesShape, canting: isFiniteNumber })(value)
    default:
      return false
  }
}

const isSubmissionShape = matches({
  tool: oneOf(tools),
  headset: isString,
  otherHeadsetName: isString,
  // Angle ranges are left to the submission rules, which know each tool's convention.
  measures: matches({ left: isEyeShape, right: isEyeShape }),
  ceiling: isCeiling,
  cornerMask: oneOf(cornerMaskStates),
  provenance: matches({ input: oneOf(inputKinds), linkData: (value) => value === null || isString(value) }),
  reportedHeadset: isString,
  face: (value) => value === null || matches({ eyeDepth: oneOf(eyeDepths), noseBridge: oneOf(noseBridges) })(value),
  tuning: (value) => value === null || matches({ physicallyModded: isBoolean, driverTuned: isBoolean, details: isString })(value),
  gaze: (value) => value === null || oneOf(gazes)(value),
  ipd: (value) => value === null || isFiniteNumber(value),
  facialInterface: isString,
  note: isString,
})

const reject = (error: MeasureFileError): MeasureFileResult => ({ ok: false, error })

/** Reads a measure file's text, as saved or copied. */
export function parseMeasureText(text: string): MeasureFileResult {
  if (text.length > maximumMeasureTextLength) return reject('too-long')
  const parsed = parseJson(text)
  if (parsed === undefined) return reject('not-json')
  if (!isPlainObject(parsed) || parsed.format !== measureFormat) return reject('not-a-measure')
  if (parsed.version !== measureFormatVersion) return reject('unsupported-version')
  if (Object.keys(parsed).length !== 3 || !isSubmissionShape(parsed.submission)) return reject('shape-invalid')
  const submission = parsed.submission as KeptSubmission
  const problem = keptSubmissionProblem(submission)
  return problem === null ? { ok: true, submission } : reject(problem)
}

/** Reads the `measure` value of a link. */
export function parseMeasureParameter(encoded: string): MeasureFileResult {
  if (encoded.length > maximumEncodedLength) return reject('too-long')
  const bytes = base64UrlToBytes(encoded)
  if (bytes === null) return reject('not-base64url')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return reject('not-base64url')
  }
  return parseMeasureText(text)
}

/** The `measure` value of a link to the Compare page, or of its fragment alone. */
export function measureParameterOfLink(link: string): string | null {
  const trimmed = link.trim()
  if (trimmed.length > maximumEncodedLength + 2048) return null
  const fragment = trimmed.slice(trimmed.indexOf('#') + 1)
  const prefix = `${measureRoute}?`
  if (!fragment.startsWith(prefix)) return null
  const parameters = [...new URLSearchParams(fragment.slice(prefix.length))]
  const [name, value] = parameters[0] ?? []
  return parameters.length === 1 && name === measureParameter && value !== undefined ? value : null
}

/** A pasted link or text, or an opened file: whichever it is. */
export function parseMeasureInput(input: string): MeasureFileResult {
  const trimmed = input.trim()
  if (trimmed.startsWith('{')) return parseMeasureText(trimmed)
  const parameter = measureParameterOfLink(trimmed)
  return parameter === null ? reject('no-measure-in-link') : parseMeasureParameter(parameter)
}
