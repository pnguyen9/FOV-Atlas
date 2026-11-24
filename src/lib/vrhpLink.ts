/**
 * Decodes a VR Headset Picker share link (`/measure-your-fov/results?results=<base64url>`).
 *
 * Payload layout, version 4: version byte, flags byte, 10 × int16 LE measured angles in
 * centi-degrees, 9 × uint16 LE rendered totals in centi-degrees, then the headset name as text,
 * which is not decoded here.
 *
 * The link is pasted by a visitor, so everything is validated: length, alphabet, version and the
 * range of every angle. Anything unexpected is rejected, never repaired.
 */

export const supportedVersion = 4
const headerBytes = 2
const angleCount = 10
const totalCount = 9
const minimumPayloadBytes = headerBytes + angleCount * 2 + totalCount * 2
/** Longer than any real link; caps the work done on hostile input. */
export const maximumInputLength = 2048
const maximumAngleDegrees = 90
const maximumTotalDegrees = 360

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
  readonly version: number
  readonly flags: number
  readonly left: EyeAngles
  readonly right: EyeAngles
  readonly rendered: RenderedTotals
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

const base64UrlPattern = /^[A-Za-z0-9_-]+$/

/** Accepts a full share link or the bare `results` value. */
export function extractResultsParameter(input: string): string | null {
  const trimmed = input.trim()
  if (base64UrlPattern.test(trimmed)) return trimmed
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
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

export function decodeVrhpLink(input: string): VrhpDecodeResult {
  if (input.length > maximumInputLength) return { ok: false, error: 'too-long' }
  const parameter = extractResultsParameter(input)
  if (parameter === null || parameter === '') return { ok: false, error: 'no-results-parameter' }
  const bytes = base64UrlToBytes(parameter)
  if (bytes === null) return { ok: false, error: 'not-base64url' }
  if (bytes.length < minimumPayloadBytes) return { ok: false, error: 'too-short' }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint8(0)
  if (version !== supportedVersion) return { ok: false, error: 'unsupported-version' }
  const flags = view.getUint8(1)

  const angles: number[] = []
  for (let angleIndex = 0; angleIndex < angleCount; angleIndex++) {
    const degrees = view.getInt16(headerBytes + angleIndex * 2, true) / 100
    if (degrees < 0 || degrees > maximumAngleDegrees) return { ok: false, error: 'angle-out-of-range' }
    angles.push(degrees)
  }
  const totalsOffset = headerBytes + angleCount * 2
  const totals: number[] = []
  for (let totalIndex = 0; totalIndex < totalCount; totalIndex++) {
    const degrees = view.getUint16(totalsOffset + totalIndex * 2, true) / 100
    if (degrees > maximumTotalDegrees) return { ok: false, error: 'total-out-of-range' }
    totals.push(degrees)
  }

  const angleAt = (angleIndex: number): number => angles.at(angleIndex) ?? Number.NaN
  const totalAt = (totalIndex: number): number => totals.at(totalIndex) ?? Number.NaN
  // Stored order per eye: left edge, right edge, up, down, diagonal. The left eye's left edge is
  // temporal; the right eye's left edge is nasal.
  return {
    ok: true,
    measure: {
      version,
      flags,
      left: { temporal: angleAt(0), nasal: angleAt(1), up: angleAt(2), down: angleAt(3), diagonal: angleAt(4) },
      right: { nasal: angleAt(5), temporal: angleAt(6), up: angleAt(7), down: angleAt(8), diagonal: angleAt(9) },
      rendered: {
        leftHorizontal: totalAt(0),
        leftVertical: totalAt(1),
        rightHorizontal: totalAt(2),
        rightVertical: totalAt(3),
        binocularHorizontal: totalAt(4),
        binocularHorizontalOverlap: totalAt(5),
        binocularVertical: totalAt(6),
        binocularVerticalOverlap: totalAt(7),
        binocularDiagonal: totalAt(8),
      },
    },
  }
}
