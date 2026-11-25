import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url, isBase64Url } from '../../src/lib/base64url'

describe('base64UrlToBytes', () => {
  it('decodes unpadded base64url with both url-safe characters', () => {
    expect(Array.from(base64UrlToBytes('-_8') ?? [])).toEqual([0xfb, 0xff])
  })
  it.each([
    ['characters outside the alphabet', 'ab+/'],
    ['padding', 'ab=='],
    ['nothing', ''],
    ['an impossible length', 'abcde'],
  ])('rejects %s', (_description, input) => {
    expect(base64UrlToBytes(input)).toBeNull()
  })
})

describe('bytesToBase64Url', () => {
  it('encodes with the url-safe characters and no padding', () => {
    expect(bytesToBase64Url(Uint8Array.from([0xfb, 0xff]))).toBe('-_8')
  })
  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, byte) => byte)
    const encoded = bytesToBase64Url(bytes)
    expect(isBase64Url(encoded)).toBe(true)
    expect(Array.from(base64UrlToBytes(encoded) ?? [])).toEqual(Array.from(bytes))
  })
})
