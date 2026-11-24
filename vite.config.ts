import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { contentSecurityPolicy, serializePolicy } from './src/contentSecurityPolicy.ts'

/**
 * Adds the CSP meta tag to the production build only: the dev server injects inline styles and
 * a websocket client that the policy forbids.
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
  }
}

export default defineConfig({
  base: '/FOV-Atlas/',
  plugins: [vue(), contentSecurityPolicyMeta()],
  build: {
    // Inlined assets become data: URLs, which img-src and font-src don't allow.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts', 'src/env.d.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
})
