/**
 * WIMFOV results, from its read-only result link or from the `points` value of its result page.
 *
 * WIMFOV stores 16 angles per eye as `left|right`, comma-separated, in its own raw order: up,
 * left, down, right, up-left, down-left, down-right, up-right, then the eight in-betweens. Values
 * are kept exactly as given.
 *
 * A WIMFOV result also has a private edit link, which lets whoever holds it change or delete the
 * result. Issues are public, so only the exact read-only form `…/wimfov/?id=<id>` is accepted.
 */

import { plainTextProblem } from './plainText.ts'
import { maximumRadialDegrees, type Direction, type EyeMeasure, type EyeMeasures } from './submission.ts'

export const wimfovOrigin = 'https://andreasaronsson.com'
export const wimfovPath = '/!apps/wimfov/'
const resultIdPattern = /^[0-9a-f]{6,16}$/
const maximumLinkLength = 200
const maximumPointsInputLength = 4096
/** A result page is about 6 kB; anything far larger is not one. */
export const maximumPageLength = 65_536
const maximumModelLength = 128

/** The direction of each value in WIMFOV's raw order. */
const rawOrder: readonly Direction[] = [
  'up', 'left', 'down', 'right', 'up-left', 'down-left', 'down-right', 'up-right',
  'up-up-left', 'left-up-left', 'left-down-left', 'down-down-left',
  'down-down-right', 'right-down-right', 'right-up-right', 'up-up-right',
]

const pointPattern = /^\d{1,3}$|^\d{1,3}\.\d{1,2}$/
const pointsFragmentPattern = /^"points"\s*:\s*"([^"]*)"\s*,?$/

export type WimfovError =
  | 'wimfov-points-invalid'
  | 'wimfov-angle-out-of-range'
  | 'wimfov-link-not-read-only'
  | 'wimfov-page-too-large'
  | 'wimfov-page-unrecognised'
  | 'wimfov-page-id-mismatch'

export type WimfovPointsResult =
  | { readonly ok: true; readonly measures: EyeMeasures }
  | { readonly ok: false; readonly error: WimfovError }

export type WimfovLinkResult =
  | { readonly ok: true; readonly resultId: string }
  | { readonly ok: false; readonly error: 'wimfov-link-not-read-only' }

export type WimfovPageResult =
  | { readonly ok: true; readonly measures: EyeMeasures; readonly model: string }
  | { readonly ok: false; readonly error: WimfovError }

function eyeFromRaw(values: readonly string[]): EyeMeasure {
  return Object.fromEntries(rawOrder.map((direction, index) => [direction, Number(values.at(index))]))
}

/** Turns stored measures back into WIMFOV's `left|right` text; every direction must be present. */
export function formatWimfovPoints(measures: EyeMeasures): string {
  const raw = (eye: EyeMeasure): string => {
    const values = new Map(Object.entries(eye))
    return rawOrder.map((direction) => values.get(direction)).join(',')
  }
  return `${raw(measures.left)}|${raw(measures.right)}`
}

function parsePointsText(points: string): WimfovPointsResult {
  const eyes = points.split('|').map((eye) => eye.split(','))
  const [left = [], right = []] = eyes
  const shapeValid = eyes.length === 2 && eyes.every((values) => values.length === rawOrder.length)
  if (!shapeValid || ![...left, ...right].every((value) => pointPattern.test(value))) {
    return { ok: false, error: 'wimfov-points-invalid' }
  }
  if ([...left, ...right].some((value) => Number(value) > maximumRadialDegrees)) {
    return { ok: false, error: 'wimfov-angle-out-of-range' }
  }
  return { ok: true, measures: { left: eyeFromRaw(left), right: eyeFromRaw(right) } }
}

function pointsOfJson(text: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const points: unknown = Object.getOwnPropertyDescriptor(parsed, 'points')?.value
  return typeof points === 'string' ? points : null
}

/**
 * Accepts the bare `left|right` text, the `"points":"…"` fragment of the result page, or the whole
 * JSON object it sits in.
 */
export function parseWimfovPoints(input: string): WimfovPointsResult {
  if (input.length > maximumPointsInputLength) return { ok: false, error: 'wimfov-points-invalid' }
  const trimmed = input.trim()
  const fragment = pointsFragmentPattern.exec(trimmed)?.[1]
  const points = trimmed.startsWith('{') ? pointsOfJson(trimmed) : (fragment ?? trimmed)
  return points === null ? { ok: false, error: 'wimfov-points-invalid' } : parsePointsText(points)
}

export function wimfovResultLink(resultId: string): string {
  return `${wimfovOrigin}${wimfovPath}?id=${resultId}`
}

/** Only the exact read-only link is accepted; anything else could be a private edit link. */
export function parseWimfovLink(input: string): WimfovLinkResult {
  const rejected = { ok: false, error: 'wimfov-link-not-read-only' } as const
  const trimmed = input.trim()
  if (trimmed.length > maximumLinkLength) return rejected
  const url = URL.parse(trimmed)
  if (url === null || url.origin !== wimfovOrigin || url.pathname !== wimfovPath) return rejected
  if (url.username !== '' || url.password !== '' || url.hash !== '') return rejected
  const parameters = [...url.searchParams]
  const [name, resultId] = parameters[0] ?? []
  if (parameters.length !== 1 || name !== 'id' || resultId === undefined || !resultIdPattern.test(resultId)) {
    return rejected
  }
  return wimfovResultLink(resultId) === trimmed ? { ok: true, resultId } : rejected
}

const pageDataStart = "JSON.parse('"
const pageDataEnd = "')"
const pageDataPattern = /^[^'\\]{1,4096}$/

/**
 * Reads the result embedded in a WIMFOV result page, which holds it as a single-quoted JSON
 * string passed to `JSON.parse`. A string with escapes or quotes is refused, not unescaped.
 */
export function parseWimfovPage(html: string, expectedResultId: string): WimfovPageResult {
  const unrecognised = { ok: false, error: 'wimfov-page-unrecognised' } as const
  if (html.length > maximumPageLength) return { ok: false, error: 'wimfov-page-too-large' }
  const start = html.indexOf(pageDataStart)
  if (start < 0 || html.includes(pageDataStart, start + 1)) return unrecognised
  const dataStart = start + pageDataStart.length
  const end = html.indexOf(pageDataEnd, dataStart)
  const literal = end < 0 ? '' : html.slice(dataStart, end)
  if (!pageDataPattern.test(literal)) return unrecognised

  let data: unknown
  try {
    data = JSON.parse(literal)
  } catch {
    return unrecognised
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return unrecognised
  const field = (name: string): unknown => Object.getOwnPropertyDescriptor(data, name)?.value
  const [resultId, points, model = ''] = [field('sid'), field('points'), field('model')]
  if (typeof points !== 'string' || typeof model !== 'string') return unrecognised
  if (plainTextProblem(model, { maximumLength: maximumModelLength, multiline: false }) !== null) return unrecognised
  if (resultId !== expectedResultId) return { ok: false, error: 'wimfov-page-id-mismatch' }
  const parsed = parsePointsText(points)
  return parsed.ok ? { ok: true, measures: parsed.measures, model } : parsed
}
