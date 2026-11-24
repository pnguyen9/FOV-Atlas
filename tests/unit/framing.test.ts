import { describe, expect, it } from 'vitest'
import { isFramed } from '../../src/lib/framing'

describe('isFramed', () => {
  it('is false in a top-level window', () => {
    const topWindow = {}
    expect(isFramed({ self: topWindow, top: topWindow })).toBe(false)
  })
  it('is true inside a frame', () => {
    expect(isFramed({ self: {}, top: {} })).toBe(true)
  })
})
