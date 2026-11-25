import { describe, expect, it } from 'vitest'
import {
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

describe('decodeVrhpLink', () => {
  it('decodes a version 4 link into per-eye angles and rendered totals', () => {
    const result = decodeVrhpLink(shareLink(encodePayload()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measure.left).toEqual({ temporal: 55, nasal: 42, up: 43, down: 53.9, diagonal: 59 })
    expect(result.measure.right).toEqual({ nasal: 41.5, temporal: 54.3, up: 44.2, down: 52.5, diagonal: 52 })
    expect(result.measure.rendered?.binocularHorizontal).toBe(109.24)
    expect(result.measure.rendered?.binocularDiagonal).toBe(122.66)
    expect(result.measure.headsetName).toBe('Bigscreen Beyond 2')
  })

  it('reads the headset id the link was made for', () => {
    const result = decodeVrhpLink(encodePayload())
    expect(result.ok && result.measure.headsetId).toBe('bigscreen-beyond-2')
  })

  it('decodes a link without totals, name or id', () => {
    const result = decodeVrhpLink(encodePayload({ totals: null, name: null, id: null }))
    expect(result.ok && result.measure).toMatchObject({ rendered: null, headsetName: '', headsetId: '' })
  })

  it('decodes a name without an id, as for a headset typed in', () => {
    const result = decodeVrhpLink(encodePayload({ name: 'Boba 3', id: null }))
    expect(result.ok && [result.measure.headsetName, result.measure.headsetId]).toEqual(['Boba 3', ''])
  })

  it('decodes empty name and id sections as empty', () => {
    const result = decodeVrhpLink(encodePayload({ name: '', id: '' }))
    expect(result.ok && [result.measure.headsetName, result.measure.headsetId]).toEqual(['', ''])
  })

  it('accepts angles just below 90°, the most its per-view format can hold', () => {
    const result = decodeVrhpLink(encodePayload({ angles: [...beyondAngles.slice(0, 9), 89.99] }))
    expect(result.ok && result.measure.right.diagonal).toBe(89.99)
  })

  it.each([
    ['too-long', 'A'.repeat(maximumInputLength + 1)],
    ['no-results-parameter', 'https://example.test/'],
    ['no-results-parameter', 'https://example.test/?results='],
    ['no-results-parameter', 'javascript:alert(1)'],
    ['not-base64url', 'https://example.test/?results=abc%2B%2F'],
    ['not-base64url', 'https://example.test/?results=abcde'],
    ['too-short', 'BA'],
    ['too-short', encodePayload({ angles: [], totals: null, name: null, id: null })],
    ['too-short', encodePayload({ flags: 1, totals: null, name: null, id: null })],
    ['too-short', encodePayload({ flags: 3, name: null, id: null })],
    ['too-short', encodePayload({ name: null, id: null, flags: 3, tail: [5, 0, 65] })],
    ['too-short', encodePayload({ id: null, flags: 7 })],
    ['too-short', encodePayload({ id: null, flags: 7, tail: [9, 0] })],
    ['unsupported-version', encodePayload({ version: 3 })],
    ['unsupported-version', encodePayload({ flags: 8 })],
    ['angle-out-of-range', encodePayload({ angles: [1, ...beyondAngles.slice(1)] })],
    ['angle-out-of-range', encodePayload({ angles: [-90, ...beyondAngles.slice(1)] })],
    ['angle-out-of-range', encodePayload({ angles: [...beyondAngles.slice(0, 3), 53.9, ...beyondAngles.slice(4)] })],
    ['angle-out-of-range', encodePayload({ angles: [...beyondAngles.slice(0, 9), 90] })],
    ['total-out-of-range', encodePayload({ totals: [...beyondTotals.slice(0, 8), 360.01] })],
    ['headset-name-invalid', encodePayload({ nameBytes: [0xc3, 0x28] })],
    ['headset-name-invalid', encodePayload({ name: 'Beyond<script>' })],
    ['headset-name-invalid', encodePayload({ name: 'B'.repeat(129) })],
    ['headset-id-invalid', encodePayload({ id: 'Bigscreen Beyond' })],
    ['headset-id-invalid', encodePayload({ id: 'b'.repeat(97) })],
    ['headset-id-invalid', encodePayload({ id: 'beyond-\u00e9' })],
    ['headset-id-invalid', encodePayload({ id: null, flags: 7, tail: [2, 0, 0xc3, 0x28] })],
    ['trailing-data', encodePayload({ tail: [0] })],
  ])('rejects input with %s', (error, input) => {
    expect(decodeVrhpLink(input)).toEqual({ ok: false, error })
  })
})
