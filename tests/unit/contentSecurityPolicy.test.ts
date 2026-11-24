import { describe, expect, it } from 'vitest'
import { builtPageProblems, contentSecurityPolicy, serializePolicy } from '../../src/contentSecurityPolicy'

describe('content security policy', () => {
  const unsafeSources = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'", 'data:', 'blob:', '*', 'http:', 'https:']

  it('never allows an unsafe source', () => {
    for (const sources of Object.values(contentSecurityPolicy)) {
      for (const source of unsafeSources) expect(sources).not.toContain(source)
    }
  })
  it.each(['default-src', 'base-uri', 'form-action', 'object-src'])('sets %s to none', (directive) => {
    expect(contentSecurityPolicy).toHaveProperty([directive], ["'none'"])
  })
  it('requires Trusted Types', () => {
    expect(contentSecurityPolicy['require-trusted-types-for']).toEqual(["'script'"])
  })
  it('serializes directives separated by semicolons', () => {
    expect(serializePolicy({ 'default-src': ["'none'"], 'upgrade-insecure-requests': [] }))
      .toBe("default-src 'none'; upgrade-insecure-requests")
  })
})

describe('builtPageProblems', () => {
  const policy = { 'default-src': ["'none'"] }
  const page = (head: string, body = ''): string =>
    `<!doctype html><html><head>\n  <meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;">${head}</head><body>${body}</body></html>`

  it('accepts a page with the policy first and only external scripts', () => {
    expect(builtPageProblems(page('<script type="module" src="/app.js"></script>'), policy)).toEqual([])
  })
  it('checks the real policy by default', () => {
    expect(builtPageProblems(page(''))).toEqual(['the policy is not the first element of <head>'])
  })
  it('rejects a page where something precedes the policy', () => {
    const html = '<html><head><script src="/a.js"></script><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;"></head></html>'
    expect(builtPageProblems(html, policy)).toEqual(['the policy is not the first element of <head>'])
  })
  it('rejects a page without a head', () => {
    expect(builtPageProblems('<html></html>', policy)).toEqual(['the policy is not the first element of <head>'])
  })
  it.each([
    ['inline script', page('<script>alert(1)</script>')],
    ['style element', page('<style>body{}</style>')],
    ['style attribute', page('', '<div style="color:red"></div>')],
    ['event handler attribute', page('', '<img src="/a.png" onerror="alert(1)">')],
  ])('rejects a page with an %s', (name, html) => {
    expect(builtPageProblems(html, policy)).toEqual([`the page contains: ${name}`])
  })
})
