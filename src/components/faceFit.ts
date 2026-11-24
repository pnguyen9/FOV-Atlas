/** Words for the face-fit answers, shared by the form, the guide and the filters. */

import type { EyeDepth, NoseBridge } from '../lib/submission.ts'

export interface FaceFitOption<Value extends string> {
  readonly value: Value
  readonly label: string
  readonly hint: string
}

export const eyeDepthOptions: readonly FaceFitOption<EyeDepth>[] = [
  { value: 'deep-set', label: 'Deep-set', hint: 'Eyes sit well behind the brow' },
  { value: 'in-between', label: 'In between', hint: 'Eyes a little behind the brow' },
  { value: 'almost-flush', label: 'Almost flush', hint: 'Eyes and brow almost level' },
]

export const noseBridgeOptions: readonly FaceFitOption<NoseBridge>[] = [
  { value: 'low', label: 'Low', hint: 'Flat between the eyes' },
  { value: 'in-between', label: 'In between', hint: 'Neither flat nor sticking out' },
  { value: 'high', label: 'High', hint: 'Sticks out between the eyes' },
]
