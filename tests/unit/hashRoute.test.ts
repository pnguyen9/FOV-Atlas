// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { navigationPageOf, parseRoute, routeHref, useHashRoute, type HashSource, type Route } from '../../src/lib/hashRoute'

describe('parseRoute', () => {
  it.each([
    ['', { page: 'home' }],
    ['#', { page: 'home' }],
    ['#home', { page: 'home' }],
    ['#compare', { page: 'compare', view: 'table', measure: null }],
    ['#compare/radar', { page: 'compare', view: 'radar', measure: null }],
    ['#compare?measure=eyJmb3JtYXQiOjF9', { page: 'compare', view: 'table', measure: 'eyJmb3JtYXQiOjF9' }],
    ['#submit', { page: 'submit' }],
    ['#measure', { page: 'measure' }],
    ['method', { page: 'method', section: null }],
    ['#method/credits', { page: 'method', section: 'credits' }],
    ['#method/highest', { page: 'method', section: 'highest' }],
    ['#headset/bigscreen-beyond-2', { page: 'headset', headset: 'bigscreen-beyond-2' }],
  ])('reads %j', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected)
  })

  it.each([
    ['an unknown page', '#settings'],
    ['a page with an argument it does not take', '#compare/list'],
    ['the radar with a path after it', '#compare/radar/x'],
    ['a page with a section it does not have', '#submit/credits'],
    ['the measure page with an argument', '#measure/start'],
    ['an unknown section', '#method/history'],
    ['a compare query without a measure', '#compare?other=1'],
    ['a compare query with a second parameter', '#compare?measure=abc&x=1'],
    ['a headset page without a headset', '#headset'],
    ['a headset page with an empty headset', '#headset/'],
    ['a malformed headset id', '#headset/Beyond 2'],
    ['a headset id with a path after it', '#headset/bigscreen-beyond-2/x'],
    ['an address far too long', `#compare?measure=${'a'.repeat(20_000)}`],
  ])('refuses %s', (_description, hash) => {
    expect(parseRoute(hash)).toEqual({ page: 'not-found' })
  })
})

describe('routeHref', () => {
  it.each<[Route, string]>([
    [{ page: 'home' }, '#home'],
    [{ page: 'submit' }, '#submit'],
    [{ page: 'method', section: null }, '#method'],
    [{ page: 'method', section: 'credits' }, '#method/credits'],
    [{ page: 'compare', view: 'table', measure: null }, '#compare'],
    [{ page: 'compare', view: 'radar', measure: null }, '#compare/radar'],
    [{ page: 'compare', view: 'table', measure: 'abc-_' }, '#compare?measure=abc-_'],
    [{ page: 'headset', headset: 'meta-quest-3' }, '#headset/meta-quest-3'],
    [{ page: 'not-found' }, '#home'],
  ])('links %j to %s', (route, href) => {
    expect(routeHref(route)).toBe(href)
  })

  it.each<Route>([
    { page: 'headset', headset: 'pimax-crystal' },
    { page: 'compare', view: 'table', measure: 'eyJ2IjoxfQ' },
    { page: 'compare', view: 'radar', measure: null },
    { page: 'method', section: 'credits' },
  ])('round-trips %j through parseRoute', (route) => {
    expect(parseRoute(routeHref(route))).toEqual(route)
  })
})

describe('navigationPageOf', () => {
  it('marks Compare for a headset page and nothing for a missing page', () => {
    expect(navigationPageOf({ page: 'headset', headset: 'htc-vive' })).toBe('compare')
    expect(navigationPageOf({ page: 'not-found' })).toBeNull()
    expect(navigationPageOf({ page: 'submit' })).toBe('submit')
  })
})

describe('useHashRoute', () => {
  function fakeSource(hash: string): HashSource & { listeners: Set<() => void>; location: { hash: string } } {
    const listeners = new Set<() => void>()
    return {
      location: { hash },
      listeners,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    }
  }

  it('follows the hash until the component unmounts', async () => {
    const source = fakeSource('#method')
    const Probe = defineComponent({
      setup() {
        const route = useHashRoute(source)
        return () => h('p', route.value.page)
      },
    })
    const wrapper = mount(Probe)
    expect(wrapper.text()).toBe('method')
    source.location.hash = '#compare'
    for (const listener of source.listeners) listener()
    await nextTick()
    expect(wrapper.text()).toBe('compare')
    wrapper.unmount()
    expect(source.listeners.size).toBe(0)
  })
})
