/**
 * Lookups over the headset catalog (`src/data/headsets.ts`) and the hmdq figures recorded for its
 * models (`src/data/hmdgdb.ts`).
 */

import { headsets, type Headset } from '../data/headsets.ts'
import { hmdgdbConfigurations } from '../data/hmdgdb.ts'

/** Picked when the model is not in the catalog; the submitter then types its name. */
export const otherHeadset = 'other'

const headsetsById = new Map(headsets.map((headset) => [headset.id, headset]))

export function catalogHeadset(id: string): Headset | undefined {
  return headsetsById.get(id)
}

/** Brands in catalog order, for the first picker. */
export const brands: readonly string[] = [...new Set(headsets.map((headset) => headset.brand))]

export function modelsOf(brand: string): readonly Headset[] {
  return headsets.filter((headset) => headset.brand === brand)
}

/**
 * The model's binocular diagonal with its corner mask, when hmdgdb settles it: a single native
 * configuration that has a mask. Models recorded in several native modes (Pimax field-of-view
 * sizes, StarVR's compatibility mode) have no single figure to compare a link with.
 */
export function maskedDiagonalOf(id: string): number | undefined {
  const native = hmdgdbConfigurations.filter((configuration) => configuration.headset === id && !configuration.config.includes('PP'))
  const [only] = native
  return native.length === 1 && only !== undefined && (only.hiddenAreaMask ?? 0) > 0 ? only.diagonal : undefined
}
