// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FaceFitDrawing from '../../src/components/FaceFitDrawing.vue'
import MeasurePreview from '../../src/components/MeasurePreview.vue'
import HomePage from '../../src/pages/HomePage.vue'
import HowItWorksPage from '../../src/pages/HowItWorksPage.vue'
import NotFoundPage from '../../src/pages/NotFoundPage.vue'
import { parseWimfovPoints } from '../../src/lib/wimfov'
import { wimfovPoints } from './fixtures'

describe('HomePage', () => {
  it('sends people where they want to go, with no table up front', () => {
    const wrapper = mount(HomePage)
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual(['#compare', '#compare/radar', '#measure', '#submit', '#method'])
    expect(wrapper.find('table').exists()).toBe(false)
  })
})

describe('HowItWorksPage', () => {
  const text = mount(HowItWorksPage).text()

  it('credits the work it builds on', () => {
    expect(text).toContain('heavily inspired by the measure of VR Headset Picker')
    expect(text).toContain('radar chart is inspired by WIMFOV')
    expect(text).toContain('Reddit user Heliosurge')
    expect(text).toContain('No GitHub account? You can still measure')
  })

  it('scrolls to the credits when the address names them', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const wrapper = mount(HowItWorksPage, { props: { section: null } })
    expect(scrollIntoView).not.toHaveBeenCalled()
    await wrapper.setProps({ section: 'credits' })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('section').element)
    await wrapper.setProps({ section: 'highest' })
    expect((scrollIntoView.mock.contexts[1] as HTMLElement | undefined)?.textContent).toContain('the highest is the measure that shows the')
  })

  it('keeps every tool apart', () => {
    expect(text).toContain('never converted into one another and never averaged')
  })

  it('separates driver tuning from fit', () => {
    expect(text).toContain('They never change how the headset fits a face')
  })

  it('phrases filters about fit and explains withdrawing', () => {
    expect(text).toContain('people whose headset probably fits them the way it fits you')
    expect(text).toContain('/withdraw')
    expect(text.toLowerCase()).not.toContain('corner mask')
  })
})

describe('NotFoundPage', () => {
  it('links home', () => {
    expect(mount(NotFoundPage).find('a').attributes('href')).toBe('#home')
  })
})

describe('FaceFitDrawing', () => {
  it('sets the eye further back the deeper it is', () => {
    const eyeX = (value: 'deep-set' | 'almost-flush'): number =>
      Number(mount(FaceFitDrawing, { props: { feature: 'eye-depth', value } }).find('ellipse').attributes('cx'))
    expect(eyeX('deep-set')).toBeLessThan(eyeX('almost-flush'))
  })

  it('draws a nose bridge without the brow line', () => {
    const wrapper = mount(FaceFitDrawing, { props: { feature: 'nose-bridge', value: 'high' } })
    expect(wrapper.find('line').exists()).toBe(false)
    expect(wrapper.find('path').attributes('d')).toContain('M80 20')
  })
})

describe('MeasurePreview', () => {
  const parsed = parseWimfovPoints(wimfovPoints)
  if (!parsed.ok) throw new Error(parsed.error)

  it('draws both eyes and the binocular figures', () => {
    const wrapper = mount(MeasurePreview, { props: { measures: parsed.measures } })
    const [left, right] = wrapper.findAll('polygon').map((polygon) => polygon.attributes('points') ?? '')
    expect(left?.split(' ')).toHaveLength(16)
    // Up comes first, straight above the centre: 38° on a 90° scale.
    expect(left?.split(' ')[0]).toBe('0.0,-38.0')
    expect(right).not.toBe(left)
    expect(wrapper.findAll('dd').map((value) => value.text())).toEqual(['99°', '89°', '81°'])
    expect(wrapper.findAll('circle')).toHaveLength(3)
  })

  it('widens the scale for angles past 90°, skipping directions a tool lacks', () => {
    const measures = { left: { left: 120, up: 40, down: 40 }, right: { right: 50, up: 40, down: 40 } }
    const wrapper = mount(MeasurePreview, { props: { measures } })
    expect(wrapper.findAll('circle')).toHaveLength(4)
    expect(wrapper.findAll('polygon')[0]?.attributes('points')?.split(' ')).toHaveLength(3)
    expect(wrapper.findAll('dt').map((label) => label.text())).toEqual(['Horizontal', 'Vertical'])
  })
})
