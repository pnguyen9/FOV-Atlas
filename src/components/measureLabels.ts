/** Short words for a measure's setup, shared by the filters, tables and lists. */

import { catalogHeadset, otherHeadset } from '../lib/headsets.ts'
import type { Gaze } from '../lib/submission.ts'
import type { Tuning } from '../lib/submissionStore.ts'

const tuningLabels: ReadonlyMap<Tuning, string> = new Map([
  ['stock', 'Stock'],
  ['modded', 'Physically modded'],
  ['tuned', 'Driver tuned'],
  ['both', 'Modded + tuned'],
])
export const tuningLabelOf = (tuning: Tuning): string => tuningLabels.get(tuning) ?? tuning

export const gazeLabelOf = (gaze: Gaze): string => (gaze === 'fixed' ? 'Stared ahead' : 'Looked around')

/** A catalog model's name, the typed name of another model, or the id itself when unknown. */
export function headsetName({ headset, otherHeadsetName = '' }: { readonly headset: string; readonly otherHeadsetName?: string }): string {
  if (headset === otherHeadset) return otherHeadsetName
  return catalogHeadset(headset)?.name ?? headset
}

/** Degrees with one decimal, or a dash for a figure that doesn't exist. */
export function formatDegrees(value: number | undefined, unit = '°'): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}${unit}`
}
