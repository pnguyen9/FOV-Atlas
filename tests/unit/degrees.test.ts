import { describe, expect, it } from 'vitest'
import { formatDegrees, toCenti } from '../../src/lib/degrees'

describe('toCenti', () => {
  it('rounds to whole hundredths of a degree', () => {
    expect(toCenti(42.7)).toBe(4270)
    expect(toCenti(0.1 + 0.2)).toBe(30)
    expect(toCenti(-1.005)).toBe(-100)
  })
})

describe('formatDegrees', () => {
  it('gives one decimal and the unit', () => {
    expect(formatDegrees(42.75)).toBe('42.8°')
    expect(formatDegrees(12, ' %')).toBe('12.0 %')
  })
  it('gives a dash for a figure that does not exist', () => {
    expect(formatDegrees(undefined)).toBe('—')
    expect(formatDegrees(Number.NaN)).toBe('—')
  })
})
