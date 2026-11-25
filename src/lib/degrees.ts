/** Angles as the site stores and shows them. */

/** Hundredths of a degree, the finest step any tool reports, so that sums of them stay exact. */
export const toCenti = (degrees: number): number => Math.round(degrees * 100)

/** Degrees with one decimal, or a dash for a figure that doesn't exist. */
export function formatDegrees(value: number | undefined, unit = '°'): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}${unit}`
}
