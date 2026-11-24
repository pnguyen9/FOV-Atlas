/**
 * TestHMD moves a dot out to both sides at once with both eyes open, so it reports one full
 * horizontal and one full vertical angle. Each edge sits at half of it from straight ahead: the
 * left eye keeps the left half, the right eye the right half, and both share the top and bottom.
 */

import { hasAtMostDecimals, maximumRadialDegrees, type EyeMeasures } from './submission.ts'

export interface TestHmdTotals {
  readonly horizontal: number
  readonly vertical: number
}

export type TestHmdResult =
  | { readonly ok: true; readonly measures: EyeMeasures }
  | { readonly ok: false; readonly error: 'testhmd-out-of-range' }

/** Each half is a radial angle, so a full turn is the most a total can span. */
const maximumTotalDegrees = maximumRadialDegrees * 2

/** One decimal on the total keeps each half within the two decimals every angle is stored with. */
function isTotal(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= maximumTotalDegrees &&
    hasAtMostDecimals(value, 1)
  )
}

export function testHmdMeasures(horizontal: unknown, vertical: unknown): TestHmdResult {
  if (!isTotal(horizontal) || !isTotal(vertical)) return { ok: false, error: 'testhmd-out-of-range' }
  const across = horizontal / 2
  const tall = vertical / 2
  return {
    ok: true,
    measures: { left: { left: across, up: tall, down: tall }, right: { right: across, up: tall, down: tall } },
  }
}

/** The two figures TestHMD showed, recovered from the stored halves. */
export function testHmdTotals(measures: EyeMeasures): TestHmdTotals {
  return { horizontal: (measures.left.left ?? 0) * 2, vertical: (measures.left.up ?? 0) * 2 }
}
