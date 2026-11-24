import { describe, expect, it } from 'vitest'
import {
  base64UrlToBytes,
  decodeVrhpLink,
  extractResultsParameter,
  maximumInputLength,
} from '../../src/lib/vrhpLink'
import { beyondAngles, beyondTotals, encodeVrhpPayload as encodePayload } from './fixtures'

const shareLink = (payload: string): string =>
  `https://example.test/measure-your-fov/results?results=${payload}`

describe('extractResultsParameter', () => {
  it.each([
    ['a bare value, trimmed', '  BAeG6mUQ  ', 'BAeG6mUQ'],
    ['the results parameter of a link', shareLink('BAeG'), 'BAeG'],
    ['a plain http link', 'http://example.test/?results=BAeG', null],
    ['text that is neither a link nor base64url', 'not a link', null],
    ['a link without a results parameter', 'https://example.test/', null],
  ])('handles %s', (_description, input, expected) => {
    expect(extractResultsParameter(input)).toBe(expected)
  })
})

describe('base64UrlToBytes', () => {
  it('decodes unpadded base64url with both url-safe characters', () => {
    expect(Array.from(base64UrlToBytes('-_8') ?? [])).toEqual([0xfb, 0xff])
  })
  it.each([
    ['characters outside the alphabet', 'ab+/'],
    ['an impossible length', 'abcde'],
  ])('rejects %s', (_description, input) => {
    expect(base64UrlToBytes(input)).toBeNull()
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
    expect(result.measure.headsetName).toBe('Bigscreen Beyond 2')
  })

  it('keeps the flags byte', () => {
    const result = decodeVrhpLink(encodePayload({ flags: 7 }))
    expect(result.ok && result.measure.flags).toBe(7)
  })

  it('decodes a payload without trailing text as an empty headset name', () => {
    const result = decodeVrhpLink(encodePayload({ trailingText: '' }))
    expect(result.ok && result.measure.headsetName).toBe('')
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
    ['headset-name-invalid', encodePayload({ trailingBytes: [0xc3, 0x28] })],
    ['headset-name-invalid', encodePayload({ trailingText: 'Beyond<script>' })],
    ['headset-name-invalid', encodePayload({ trailingText: 'B'.repeat(129) })],
  ])('rejects input with %s', (error, input) => {
    expect(decodeVrhpLink(input)).toEqual({ ok: false, error })
  })
})
