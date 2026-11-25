// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../../src/App.vue'
import { encodeMeasureParameter } from '../../src/lib/measureFile'
import { testHmdSubmission } from './fixtures'

async function goTo(hash: string): Promise<void> {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await flushPromises()
}

describe('App', () => {
  let scrollTo = vi.fn()
  beforeEach(() => {
    window.location.hash = ''
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens on the home page with the navigation', () => {
    const wrapper = mount(App)
    expect(wrapper.find('h1').text()).toContain('How much do people really see')
    expect(wrapper.findAll('nav a').map((link) => link.text())).toEqual(['Home', 'Measure', 'Compare', 'Add a measure', 'How it works'])
    expect(wrapper.find('nav a[aria-current="page"]').text()).toBe('Home')
  })

  it.each([
    ['#compare', 'Compare headsets', 'Compare'],
    ['#submit', 'Add a measure', 'Add a measure'],
    ['#measure', 'Measure my field of view', 'Measure'],
    ['#method', 'How it works', 'How it works'],
    ['#headset/htc-vive', 'HTC Vive', 'Compare'],
  ])('shows %s with its navigation entry marked', async (hash, heading, current) => {
    const wrapper = mount(App, { attachTo: document.body })
    await goTo(hash)
    expect(wrapper.find('h1').text()).toBe(heading)
    expect(wrapper.find('nav a[aria-current="page"]').text()).toBe(current)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    expect(document.activeElement).toBe(wrapper.find('main').element)
    wrapper.unmount()
  })

  it('links the credits from the footer and carries a kept measure to Compare', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const wrapper = mount(App)
    const footerLink = wrapper.find('footer a')
    expect(footerLink.attributes('href')).toBe('#method/credits')
    await goTo('#method/credits')
    expect(wrapper.find('#credits-heading').exists()).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()
    await goTo(`#compare?measure=${encodeMeasureParameter(testHmdSubmission)}`)
    expect(wrapper.text()).toContain('Kept measure: Bigscreen Beyond 2, measured with TestHMD')
    expect(wrapper.find('nav a[aria-current="page"]').text()).toBe('Compare')
  })

  it('shows a missing page without marking any entry', async () => {
    const wrapper = mount(App)
    await goTo('#nowhere')
    expect(wrapper.find('h1').text()).toBe('Page not found')
    expect(wrapper.find('nav a[aria-current="page"]').exists()).toBe(false)
  })

  it('keeps a half-filled form while another page is open', async () => {
    const wrapper = mount(App)
    await goTo('#submit')
    await wrapper.find('input[value="testhmd"]').setValue()
    await goTo('#method')
    await goTo('#submit')
    expect((wrapper.find('input[value="testhmd"]').element as HTMLInputElement).checked).toBe(true)
  })
})
