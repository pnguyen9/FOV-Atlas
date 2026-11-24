import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { builtPageProblems, contentSecurityPolicy, serializePolicy } from './src/contentSecurityPolicy.ts'

/**
 * Adds the CSP meta tag to the production build only: the dev server injects inline styles and
 * a websocket client that the policy forbids. The build fails if the emitted page breaks it.
 */
function contentSecurityPolicyMeta(): Plugin {
  return {
    name: 'fov-atlas-content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: serializePolicy(contentSecurityPolicy),
          },
          injectTo: 'head-prepend',
        },
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
      ],
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const page = bundle['index.html']
        if (page?.type !== 'asset' || typeof page.source !== 'string') {
          this.error('index.html is missing from the build')
        }
        const problems = builtPageProblems(page.source)
        if (problems.length > 0) this.error(`index.html breaks the CSP: ${problems.join('; ')}`)
      },
    },
  }
}

export default defineConfig({
  base: '/FOV-Atlas/',
  plugins: [vue(), contentSecurityPolicyMeta()],
  build: {
    // Inlined assets become data: URLs, which img-src and font-src don't allow.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
})
