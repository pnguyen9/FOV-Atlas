/**
 * Content Security Policy of the published site.
 *
 * GitHub Pages can't send HTTP headers, so the policy ships as a <meta> tag. A meta policy can't
 * carry frame-ancestors, report-to or sandbox, and Permissions-Policy has no meta form at all:
 * framing is refused in code instead (see guardAgainstFraming in src/lib/framing.ts).
 *
 * Every resource comes from the site itself. No inline script or style, no eval, no data: or blob:
 * URLs, no third-party host. Trusted Types limit DOM sinks to Vue's own policy.
 */
export const contentSecurityPolicy: Readonly<Record<string, readonly string[]>> = {
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

export function serializePolicy(policy: Readonly<Record<string, readonly string[]>>): string {
  return Object.entries(policy)
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; ')
}
