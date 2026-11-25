/**
 * Checks for values parsed from JSON that came from outside the code: data files, pasted text,
 * issue bodies. Each check accepts or refuses; none repairs.
 */

/** The parsed value, or undefined for text that is not JSON (JSON itself never yields undefined). */
export function parseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isString = (value: unknown): value is string => typeof value === 'string'
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** A whole number from zero up, such as a count or a page number. */
export const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
export const isPositiveCount = (value: unknown): value is number => isCount(value) && value > 0

export const oneOf =
  (choices: readonly unknown[]) =>
  (value: unknown): boolean =>
    choices.includes(value)

export type Shape = Readonly<Record<string, (value: unknown) => boolean>>

/** Exactly these keys, each passing its check. */
export const matches =
  (shape: Shape) =>
  (value: unknown): boolean => {
    if (!isPlainObject(value)) return false
    const checks = new Map(Object.entries(shape))
    const entries = Object.entries(value)
    return entries.length === checks.size && entries.every(([key, item]) => checks.get(key)?.(item) === true)
  }
