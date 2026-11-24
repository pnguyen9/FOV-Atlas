/**
 * Content Security Policy of the published site.
 *
 * GitHub Pages can't send HTTP headers, so the policy ships as a <meta> tag. A meta policy can't
 * carry frame-ancestors, report-to or sandbox, and Permissions-Policy has no meta form at all:
 * framing is refused in code instead (see src/rootComponent.ts).
 */
export type Policy = Readonly<Record<string, readonly string[]>>

export const contentSecurityPolicy: Policy = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'"],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'object-src': ["'none'"],
  'require-trusted-types-for': ["'script'"],
  'trusted-types': ['vue'],
  'upgrade-insecure-requests': [],
}

export function serializePolicy(policy: Policy): string {
  return Object.entries(policy)
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; ')
}

const inlineCodePatterns: readonly (readonly [string, RegExp])[] = [
  ['inline script', /<script(?![^>]*\ssrc=)[^>]*>/i],
  ['style element', /<style[\s>]/i],
  ['style attribute', /\sstyle=/i],
  ['event handler attribute', /\son[a-z]+=/i],
]

/**
 * Checks the published index.html: the policy must be the first element of <head>, so nothing
 * loads before it applies, and the page must carry no inline code the policy would block.
 */
export function builtPageProblems(html: string, policy: Policy = contentSecurityPolicy): string[] {
  const escapedPolicy = serializePolicy(policy).replaceAll("'", '&#39;')
  const expectedStart = `<meta http-equiv="Content-Security-Policy" content="${escapedPolicy}">`
  const headStart = /<head>\s*/i.exec(html)
  const problems: string[] = []
  if (headStart === null || !html.startsWith(expectedStart, headStart.index + headStart[0].length)) {
    problems.push('the policy is not the first element of <head>')
  }
  for (const [name, pattern] of inlineCodePatterns) {
    if (pattern.test(html)) problems.push(`the page contains: ${name}`)
  }
  return problems
}
