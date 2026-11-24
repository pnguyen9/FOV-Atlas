import { describe, expect, it } from 'vitest'
import { ceilingWords, cornerMaskWords, measureCeiling, modelCeiling } from '../../src/lib/ceiling'
import { atlasBeyond, vrhpBeyond, vrhpIndex, wimfovBeyond } from './siteFixtures'

describe('modelCeiling', () => {
  it('splits the model’s totals over both eyes as mirror images', () => {
    expect(modelCeiling('bigscreen-beyond-2e')).toEqual({
      source: 'model',
      edges: { left: { left: 54.61, right: 42.27 }, right: { left: 42.27, right: 54.61 } },
    })
  })
  it('has nothing for a model without a single reference', () => {
    expect(modelCeiling('apple-vision-pro')).toBeUndefined()
    expect(modelCeiling('pimax-5k-plus')).toBeUndefined()
  })
})

describe('measureCeiling', () => {
  it('uses the edges read while measuring', () => {
    expect(measureCeiling(atlasBeyond)?.edges.left).toEqual({ left: 55, right: 42, up: 44.2, down: 54 })
    expect(measureCeiling(atlasBeyond)?.source).toBe('measured')
  })
  it('splits a link’s totals', () => {
    expect(measureCeiling(vrhpBeyond)).toEqual({
      source: 'link',
      edges: { left: { left: 54.62, right: 42.165 }, right: { left: 42.165, right: 54.62 } },
    })
  })
  it('falls back to the model’s reference', () => {
    expect(measureCeiling(vrhpIndex)?.source).toBe('model')
    expect(measureCeiling(wimfovBeyond)?.source).toBe('model')
    expect(measureCeiling({ ...wimfovBeyond, headset: 'apple-vision-pro' })).toBeUndefined()
  })
})

describe('words', () => {
  it('names where the ceiling comes from and its corner variant', () => {
    expect(ceilingWords(atlasBeyond)).toBe('Read while measuring')
    expect(ceilingWords(vrhpBeyond)).toBe('From the tool’s link')
    expect(ceilingWords({ ...wimfovBeyond, headset: 'apple-vision-pro' })).toBe('No model reference')
    expect(ceilingWords(wimfovBeyond)).toBe('Model reference from the Beyond 2e (same lenses and panels), full frame')
    expect(ceilingWords(vrhpIndex)).toBe('Model reference, full frame')
    expect(ceilingWords({ ...vrhpIndex, cornerMask: 'on' })).toBe('Model reference, with corner mask')
  })
  it('says what is known of the corner mask, never asking', () => {
    expect(cornerMaskWords(atlasBeyond)).toBe('corner mask detected')
    expect(cornerMaskWords({ ...vrhpBeyond, cornerMask: 'off-probably' })).toBe('corner mask probably off')
    expect(cornerMaskWords({ ...atlasBeyond, cornerMask: 'unknown' })).toBe('corner mask not reported')
    expect(cornerMaskWords(vrhpBeyond)).toBe('corner mask unknown')
  })
})
