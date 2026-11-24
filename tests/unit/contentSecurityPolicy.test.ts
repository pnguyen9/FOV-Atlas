import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, serializePolicy } from '../../src/contentSecurityPolicy'

describe('content security policy', () => {
  const unsafeSources = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'", 'data:', 'blob:', '*', 'http:', 'https:']

  it('never allows an unsafe source', () => {
    for (const sources of Object.values(contentSecurityPolicy)) {
      for (const source of unsafeSources) expect(sources).not.toContain(source)
    }
  })
  it('denies by default and forbids base and form targets', () => {
    expect(contentSecurityPolicy['default-src']).toEqual(["'none'"])
    expect(contentSecurityPolicy['base-uri']).toEqual(["'none'"])
    expect(contentSecurityPolicy['form-action']).toEqual(["'none'"])
    expect(contentSecurityPolicy['object-src']).toEqual(["'none'"])
  })
  it('requires Trusted Types', () => {
    expect(contentSecurityPolicy['require-trusted-types-for']).toEqual(["'script'"])
  })
  it('serializes directives separated by semicolons', () => {
    expect(serializePolicy({ 'default-src': ["'none'"], 'upgrade-insecure-requests': [] }))
      .toBe("default-src 'none'; upgrade-insecure-requests")
  })
})
