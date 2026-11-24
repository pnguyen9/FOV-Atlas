/**
 * Decodes a VR Headset Picker share link (`/measure-your-fov/results?results=<base64url>`).
 *
 * Payload layout, version 4: version byte, flags byte, 10 × int16 LE measured angles in
 * centi-degrees, then the sections the flags announce, in this order: 9 × uint16 LE rendered
 * totals in centi-degrees (flag 1), the headset name (flag 2) and the headset id (flag 4), each of
 * the last two as a uint16 LE byte length followed by UTF-8 text.
 *
 * The link is pasted by a visitor, so everything is validated: length, alphabet, version, flags,
 * section lengths, the range of every angle, and the text of the name and id. Anything unexpected
 * is rejected, never repaired.
 */
import { plainTextProblem } from './plainText.ts'

const supportedVersion = 4
const headerBytes = 2
const angleCount = 10
const totalCount = 9
const flagTotals = 1
const flagHeadsetName = 2
const flagHeadsetId = 4
const knownFlags = flagTotals | flagHeadsetName | flagHeadsetId
const anglesEnd = headerBytes + angleCount * 2
/** Longer than any real link; caps the work done on hostile input. */
export const maximumInputLength = 2048
/**
 * Angles are stored per rendered view in hmdq's tangent convention, where 90° from the view's
 * axis lies at infinity, so the format cannot hold 90 or more.
 */
const projectedLimitDegrees = 90
/**
 * Angles are signed: left and down are negative. Per eye: left edge, right edge, up, down, then the
 * left eye's down-left diagonal or the right eye's up-right diagonal. An edge on the wrong side of
 * the view's centre is rejected.
 */
const expectedAngleSigns = [-1, 1, 1, -1, -1, -1, 1, 1, -1, 1] as const
const maximumTotalDegrees = 360
const maximumHeadsetNameLength = 128
const headsetIdPattern = /^[a-z0-9._-]{1,96}$/

export interface EyeAngles {
  readonly temporal: number
  readonly nasal: number
  readonly up: number
  readonly down: number
  /** Radial angle along the eye's outer lower (left eye) or outer upper (right eye) diagonal. */
  readonly diagonal: number
}

export interface RenderedTotals {
  readonly leftHorizontal: number
  readonly leftVertical: number
  readonly rightHorizontal: number
  readonly rightVertical: number
  readonly binocularHorizontal: number
  readonly binocularHorizontalOverlap: number
  readonly binocularVertical: number
  readonly binocularVerticalOverlap: number
  readonly binocularDiagonal: number
}

export interface VrhpMeasure {
  readonly left: EyeAngles
  readonly right: EyeAngles
  /** Null when the link carries no rendered totals. */
  readonly rendered: RenderedTotals | null
  /** The tool's own label for the headset, which can be wrong; empty when the link has none. */
  readonly headsetName: string
  /** The tool's id of the headset picked there; empty when none was picked from its list. */
  readonly headsetId: string
}

export type VrhpDecodeResult =
  | { readonly ok: true; readonly measure: VrhpMeasure }
  | { readonly ok: false; readonly error: VrhpDecodeError }

export type VrhpDecodeError =
  | 'too-long'
  | 'no-results-parameter'
  | 'not-base64url'
  | 'too-short'
  | 'unsupported-version'
  | 'angle-out-of-range'
  | 'total-out-of-range'
  | 'headset-name-invalid'
  | 'headset-id-invalid'
  | 'trailing-data'

const base64UrlPattern = /^[A-Za-z0-9_-]+$/

/** Accepts a full share link or the bare `results` value. */
export function extractResultsParameter(input: string): string | null {
  const trimmed = input.trim()
  if (base64UrlPattern.test(trimmed)) return trimmed
  const url = URL.parse(trimmed)
  if (url?.protocol !== 'https:') return null
  return url.searchParams.get('results')
}

export function base64UrlToBytes(encoded: string): Uint8Array | null {
  if (!base64UrlPattern.test(encoded) || encoded.length % 4 === 1) return null
  const standard = encoded.replaceAll('-', '+').replaceAll('_', '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  // The alphabet and length checks above guarantee atob accepts the padded string.
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const totalNames = [
  'leftHorizontal',
  'leftVertical',
  'rightHorizontal',
  'rightVertical',
  'binocularHorizontal',
  'binocularHorizontalOverlap',
  'binocularVertical',
  'binocularVerticalOverlap',
  'binocularDiagonal',
] as const satisfies readonly (keyof RenderedTotals)[]

const isHeadsetName = (name: string): boolean =>
  plainTextProblem(name, { maximumLength: maximumHeadsetNameLength, multiline: false }) === null

type TextSection = { readonly ok: true; readonly text: string; readonly end: number } | { readonly ok: false; readonly error: 'too-short' | 'not-utf8' }

/** A uint16 LE byte length, then that many bytes of UTF-8 text. */
function readTextSection(view: DataView, offset: number): TextSection {
  if (view.byteLength < offset + 2) return { ok: false, error: 'too-short' }
  const start = offset + 2
  const end = start + view.getUint16(offset, true)
  if (view.byteLength < end) return { ok: false, error: 'too-short' }
  const text = new Uint8Array(view.buffer, view.byteOffset + start, end - start)
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(text), end }
  } catch {
    return { ok: false, error: 'not-utf8' }
  }
}

const absentSection = (offset: number): TextSection => ({ ok: true, text: '', end: offset })

export function decodeVrhpLink(input: string): VrhpDecodeResult {
  const failure = (error: VrhpDecodeError): VrhpDecodeResult => ({ ok: false, error })
  if (input.length > maximumInputLength) return failure('too-long')
  const parameter = extractResultsParameter(input)
  if (parameter === null || parameter === '') return failure('no-results-parameter')
  const bytes = base64UrlToBytes(parameter)
  if (bytes === null) return failure('not-base64url')
  const hasTotals = ((bytes[1] ?? 0) & flagTotals) !== 0
  const totalsEnd = anglesEnd + (hasTotals ? totalCount * 2 : 0)
  if (bytes.length < totalsEnd) return failure('too-short')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const flags = view.getUint8(1)
  if (view.getUint8(0) !== supportedVersion || (flags & ~knownFlags) !== 0) return failure('unsupported-version')
  const angleAt = (angleIndex: number): number => view.getInt16(headerBytes + angleIndex * 2, true) / 100
  const totalAt = (totalIndex: number): number => view.getUint16(anglesEnd + totalIndex * 2, true) / 100
  const indices = (count: number): number[] => Array.from({ length: count }, (_, index) => index)
  const angleProblem = indices(angleCount).some((angleIndex) => {
    const degrees = angleAt(angleIndex) * (expectedAngleSigns.at(angleIndex) ?? 1)
    return degrees < 0 || degrees >= projectedLimitDegrees
  })
  if (angleProblem) return failure('angle-out-of-range')
  const magnitudeAt = (angleIndex: number): number => Math.abs(angleAt(angleIndex))
  if (hasTotals && indices(totalCount).map(totalAt).some((degrees) => degrees > maximumTotalDegrees)) {
    return failure('total-out-of-range')
  }

  const name = (flags & flagHeadsetName) === 0 ? absentSection(totalsEnd) : readTextSection(view, totalsEnd)
  if (!name.ok) return failure(name.error === 'too-short' ? 'too-short' : 'headset-name-invalid')
  if (!isHeadsetName(name.text)) return failure('headset-name-invalid')
  const id = (flags & flagHeadsetId) === 0 ? absentSection(name.end) : readTextSection(view, name.end)
  if (!id.ok) return failure(id.error === 'too-short' ? 'too-short' : 'headset-id-invalid')
  if (id.text !== '' && !headsetIdPattern.test(id.text)) return failure('headset-id-invalid')
  if (id.end !== bytes.length) return failure('trailing-data')

  // Stored order per eye: left edge, right edge, up, down, diagonal. The left eye's left edge is
  // temporal; the right eye's left edge is nasal.
  return {
    ok: true,
    measure: {
      left: { temporal: magnitudeAt(0), nasal: magnitudeAt(1), up: magnitudeAt(2), down: magnitudeAt(3), diagonal: magnitudeAt(4) },
      right: { nasal: magnitudeAt(5), temporal: magnitudeAt(6), up: magnitudeAt(7), down: magnitudeAt(8), diagonal: magnitudeAt(9) },
      rendered: hasTotals
        ? (Object.fromEntries(totalNames.map((totalName, totalIndex) => [totalName, totalAt(totalIndex)])) as unknown as RenderedTotals)
        : null,
      headsetName: name.text,
      headsetId: id.text,
    },
  }
}
