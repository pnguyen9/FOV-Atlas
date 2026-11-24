import { describe, expect, it } from 'vitest'
import {
  base64UrlToBytes,
  decodeVrhpLink,
  extractResultsParameter,
  maximumInputLength,
} from '../../src/lib/vrhpLink'

interface PayloadParts {
  version?: number
  flags?: number
  angles?: number[]
  totals?: number[]
  trailingText?: string
}

// The user's Beyond 2 measure (2026-11-23) and its rendered totals.
const beyondAngles = [55.0, 42.0, 43.0, 53.9, 59.0, 41.5, 54.3, 44.2, 52.5, 52.0]
const beyondTotals = [96.95, 96.93, 96.62, 96.67, 109.24, 84.33, 98.06, 95.54, 122.66]

function encodePayload({
  version = 4,
  flags = 0,
  angles = beyondAngles,
  totals = beyondTotals,
  trailingText = 'Bigscreen Beyond 2',
}: PayloadParts = {}): string {
  const text = new TextEncoder().encode(trailingText)
  const bytes = new Uint8Array(2 + angles.length * 2 + totals.length * 2 + text.length)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, version)
  view.setUint8(1, flags)
  angles.forEach((degrees, angleIndex) => { view.setInt16(2 + angleIndex * 2, Math.round(degrees * 100), true) })
  const totalsOffset = 2 + angles.length * 2
  totals.forEach((degrees, totalIndex) => { view.setUint16(totalsOffset + totalIndex * 2, Math.round(degrees * 100), true) })
  bytes.set(text, totalsOffset + totals.length * 2)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const shareLink = (payload: string): string =>
  `https://example.test/measure-your-fov/results?results=${payload}`

describe('extractResultsParameter', () => {
  it('accepts a bare value', () => {
    expect(extractResultsParameter('  BAeG6mUQ  ')).toBe('BAeG6mUQ')
  })
  it('reads the results parameter from a link', () => {
    expect(extractResultsParameter(shareLink('BAeG'))).toBe('BAeG')
  })
  it('rejects plain http links', () => {
    expect(extractResultsParameter('http://example.test/?results=BAeG')).toBeNull()
  })
  it('rejects text that is neither a link nor base64url', () => {
    expect(extractResultsParameter('not a link')).toBeNull()
  })
  it('returns null when the link has no results parameter', () => {
    expect(extractResultsParameter('https://example.test/')).toBeNull()
  })
})

describe('base64UrlToBytes', () => {
  it('decodes unpadded base64url with both url-safe characters', () => {
    expect(Array.from(base64UrlToBytes('-_8') ?? [])).toEqual([0xfb, 0xff])
  })
  it('rejects characters outside the alphabet', () => {
    expect(base64UrlToBytes('ab+/')).toBeNull()
  })
  it('rejects impossible lengths', () => {
    expect(base64UrlToBytes('abcde')).toBeNull()
  })
})

describe('decodeVrhpLink', () => {
  it('decodes a version 4 link into per-eye angles and rendered totals', () => {
    const result = decodeVrhpLink(shareLink(encodePayload()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.left).toEqual({ temporal: 55, nasal: 42, up: 43, down: 53.9, diagonal: 59 })
    expect(result.measure.right).toEqual({ nasal: 41.5, temporal: 54.3, up: 44.2, down: 52.5, diagonal: 52 })
    expect(result.measure.rendered.binocularHorizontal).toBe(109.24)
    expect(result.measure.rendered.binocularDiagonal).toBe(122.66)
  })

  it('keeps the flags byte', () => {
    const result = decodeVrhpLink(encodePayload({ flags: 7 }))
    expect(result.ok && result.measure.flags).toBe(7)
  })

  it('decodes a payload without trailing text', () => {
    expect(decodeVrhpLink(encodePayload({ trailingText: '' })).ok).toBe(true)
  })

  it.each([
    ['too-long', 'A'.repeat(maximumInputLength + 1)],
    ['no-results-parameter', 'https://example.test/'],
    ['no-results-parameter', 'https://example.test/?results='],
    ['no-results-parameter', 'javascript:alert(1)'],
    ['not-base64url', 'https://example.test/?results=abc%2B%2F'],
    ['not-base64url', 'https://example.test/?results=abcde'],
    ['too-short', encodePayload({ angles: [], totals: [], trailingText: '' })],
    ['unsupported-version', encodePayload({ version: 3 })],
    ['angle-out-of-range', encodePayload({ angles: [-1, ...beyondAngles.slice(1)] })],
    ['angle-out-of-range', encodePayload({ angles: [...beyondAngles.slice(0, 9), 90.01] })],
    ['total-out-of-range', encodePayload({ totals: [...beyondTotals.slice(0, 8), 360.01] })],
  ])('rejects input with %s', (error, input) => {
    expect(decodeVrhpLink(input)).toEqual({ ok: false, error })
  })
})
