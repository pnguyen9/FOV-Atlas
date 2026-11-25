/** Angles as the site stores and shows them. */

/** Hundredths of a degree, the finest step any tool reports, so that sums of them stay exact. */
export const toCenti = (degrees: number): number => Math.round(degrees * 100)

/** Degrees with one decimal, or a dash for a figure that doesn't exist. A value that rounds to zero shows without a minus sign. */
export function formatDegrees(value: number | undefined, unit = '°'): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const text = value.toFixed(1)
  return `${Number(text) === 0 ? '0.0' : text}${unit}`
}
