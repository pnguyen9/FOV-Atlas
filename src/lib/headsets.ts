/**
 * Lookups over the headset catalog (`src/data/headsets.ts`) and the hmdq figures recorded for its
 * models (`src/data/hmdgdb.ts`).
 */

import { headsets, type Headset } from '../data/headsets.ts'
import { hmdgdbConfigurations, type HmdgdbConfiguration } from '../data/hmdgdb.ts'

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
 * The hmdgdb configuration that stands for the model as it ships: its only native configuration.
 * Models recorded in several native modes (Pimax field-of-view sizes, StarVR's compatibility mode,
 * Steam Frame on PC or standalone) have no single one, and parallel-projection modes are a setting
 * the wearer turns on, never the reference.
 */
export function referenceConfigurationOf(id: string): HmdgdbConfiguration | undefined {
  const native = configurationsOf(id).filter((configuration) => !configuration.config.includes('PP'))
  return native.length === 1 ? native[0] : undefined
}

/** The model whose hmdgdb records stand for this one: a model it borrows them from, or itself. */
const recordedModelOf = (id: string): string => catalogHeadset(id)?.referenceBorrowedFrom?.headset ?? id

/** Every configuration hmdgdb recorded for the model, or for the model it borrows its reference from. */
export function configurationsOf(id: string): readonly HmdgdbConfiguration[] {
  const recorded = recordedModelOf(id)
  return hmdgdbConfigurations.filter((configuration) => configuration.headset === recorded)
}

/** Where a borrowed reference comes from, as "from the Beyond 2e (same lenses and panels)"; undefined for a model's own. */
export function borrowedReferenceLabel(id: string): string | undefined {
  const borrowed = catalogHeadset(id)?.referenceBorrowedFrom
  const source = borrowed === undefined ? undefined : catalogHeadset(borrowed.headset)
  if (borrowed === undefined || source === undefined) return undefined
  const shortName = source.name.startsWith(`${source.brand} `) ? source.name.slice(source.brand.length + 1) : source.name
  return `from the ${shortName} (${borrowed.reason})`
}

/**
 * Whether the configuration hides corners. hmdq computes the diagonal on what the mask leaves, so
 * such a configuration's diagonal is the masked one and its full-frame diagonal is unknown.
 */
export const hasCornerMask = (configuration: HmdgdbConfiguration): boolean => (configuration.hiddenAreaMask ?? 0) > 0

/** The model's binocular diagonal with its corner mask, when its reference configuration has one. */
export function maskedDiagonalOf(id: string): number | undefined {
  const reference = referenceConfigurationOf(id)
  return reference !== undefined && hasCornerMask(reference) ? reference.diagonal : undefined
}

/** The page of an hmdgdb configuration. */
export function hmdgdbPageUrl(configuration: HmdgdbConfiguration): string {
  return `https://risa2000.github.io/hmdgdb/hmd_cfgs/${configuration.page}.html`
}
