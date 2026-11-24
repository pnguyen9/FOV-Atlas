/** Lookups over the headset catalog (`src/data/headsets.ts`). */

import { headsets, type Headset } from '../data/headsets.ts'

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
