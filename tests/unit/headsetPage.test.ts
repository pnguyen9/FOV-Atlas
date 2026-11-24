// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import HeadsetPage from '../../src/pages/HeadsetPage.vue'
import { compareState, keepMeasure, resetCompareState } from '../../src/pages/compare/compareState'
import { serveSite, type ServedSite } from './serveSite'
import { siteFiles, vrhpBeyond, vrhpIndex } from './siteFixtures'

let site: ServedSite

beforeEach(() => {
  site = serveSite(siteFiles())
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetCompareState()
})

async function mountPage(headset: string): Promise<VueWrapper> {
  const wrapper = mount(HeadsetPage, { props: { headset } })
  await flushPromises()
  return wrapper
}

async function clickButton(wrapper: VueWrapper, text: string): Promise<void> {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (button === undefined) throw new Error(`no ${text} button`)
  await button.trigger('click')
  await flushPromises()
}

const authors = (wrapper: VueWrapper): string[] =>
  wrapper.findAll('tbody tr').flatMap((row) => {
    const link = row.find('a[title^="GitHub issue"]')
    return link.exists() ? [link.text()] : []
  })

describe('HeadsetPage', () => {
  it('says when no headset has this address', async () => {
    const wrapper = await mountPage('nothing-here')
    expect(wrapper.find('h1').text()).toBe('Unknown headset')
    expect(wrapper.text()).toContain('No headset in the list has this address.')
  })

  it('says when nothing is published for the headset, still showing the model', async () => {
    const wrapper = mount(HeadsetPage, { props: { headset: 'htc-vive-pro' } })
    expect(wrapper.text()).toContain('Loading the measures')
    await flushPromises()
    expect(wrapper.text()).toContain('No measures of this headset are published yet.')
    expect(wrapper.text()).toContain('About this model')
  })

  it('reports an index it cannot use', async () => {
    site.files.set('data/index.json', '[]')
    const wrapper = await mountPage('valve-index')
    expect(wrapper.find('.problem').text()).toContain("couldn't be loaded")
  })

  it('opens on the tool picked on Compare, then on the one picked here', async () => {
    compareState.tool = 'wimfov'
    const wrapper = await mountPage('bigscreen-beyond-2')
    expect(wrapper.find('.segmented button.on').text()).toBe('WIMFOV')
    expect(wrapper.findAll('.segmented')[0]?.findAll('button').map((button) => button.text())).toEqual([
      'FOV Atlas',
      'VR Headset Picker',
      'WIMFOV',
    ])
    await clickButton(wrapper, 'FOV Atlas')
    expect(authors(wrapper)).toEqual(['delta-pilot'])
    expect(wrapper.text()).toContain('Read while measuring')
    expect(wrapper.text()).toContain('corner mask detected')
  })

  it('shows the figures, then older measures page by page, newest first', async () => {
    const wrapper = await mountPage('bigscreen-beyond-2')
    await clickButton(wrapper, 'VR Headset Picker')
    expect(wrapper.findAll('.kpi-label').map((label) => label.text())).toEqual([
      'Highest width, left eye',
      'Highest width, right eye',
      'Width gap, left eye',
      'Width gap, right eye',
      'Measures (filtered / all)',
    ])
    expect(wrapper.findAll('.kpi-value').map((value) => value.text().replace(/\s+/g, ' '))).toEqual([
      '97.0°',
      '97.0°',
      '-0.1°',
      '-0.4°',
      '3 / 3',
    ])
    expect(wrapper.text()).toContain('VR Headset Picker figures')
    const directions = wrapper.findAll('tbody th').map((header) => header.text())
    expect(directions).toEqual([
      'Width, left eye',
      'Width, right eye',
      'Height, left eye',
      'Height, right eye',
      'Rendered horizontal',
      'Rendered overlap',
      'Rendered width, left eye',
      'Rendered width, right eye',
      'Rendered height, left eye',
      'Rendered height, right eye',
      'up',
      'left',
      'down-left',
      'down',
      'right',
      'up-right',
    ])
    expect(wrapper.text()).not.toContain('Horizontal')
    expect(authors(wrapper)).toEqual(['nova-wren'])
    await clickButton(wrapper, 'Show older measures')
    expect(authors(wrapper)).toEqual(['nova-wren', 'quiet-owl', 'lens-fox'])
    expect(wrapper.find('a[title="GitHub issue #5"]').attributes('href')).toBe('https://github.com/pnguyen9/FOV-Atlas/issues/5')
    expect(wrapper.find('.load-older').exists()).toBe(false)
    expect(wrapper.text()).toContain('From the tool’s link')
    expect(wrapper.text()).toContain('Physically modded')
  })

  it('filters the figures and the list alike', async () => {
    compareState.tool = 'vrhp'
    const wrapper = await mountPage('bigscreen-beyond-2')
    await clickButton(wrapper, 'Show older measures')
    await clickButton(wrapper, 'Deep-set')
    expect(authors(wrapper)).toEqual(['quiet-owl'])
    expect(wrapper.find('.match-count').text()).toContain('1 of 3')
    await clickButton(wrapper, 'Stared ahead')
    expect(wrapper.text()).toContain('No measure matches the filters.')
    expect(wrapper.text()).toContain('No loaded measure matches the filters.')
    expect(wrapper.findAll('.curve')).toHaveLength(0)
    expect(wrapper.find('.radar-panel .empty').text()).toContain('no measure matches the filters')
  })

  it('puts ticked measures on the radar, each with its own colour', async () => {
    compareState.tool = 'vrhp'
    const wrapper = await mountPage('bigscreen-beyond-2')
    await clickButton(wrapper, 'Show older measures')
    await wrapper.findAll('tbody tr.clickable')[1]?.trigger('click')
    await wrapper.findAll('tbody tr.clickable input')[2]?.trigger('change')
    expect(wrapper.findAll('.legend li').map((item) => item.text())).toEqual([
      'Everyone · highest (n=3)',
      'quiet-owl · issue #5',
      'lens-fox · issue #3',
    ])
    expect(wrapper.findAll('.curve').map((curve) => curve.classes().find((name) => name.startsWith('series-')))).toEqual([
      'series-1',
      'series-2',
      'series-3',
    ])
    expect(wrapper.find('.rendered-notes').exists()).toBe(false)
    expect(wrapper.findAll('.rendered path')).toHaveLength(0)
    await clickButton(wrapper, 'What you see')
    expect(wrapper.text()).toContain('Clear: inside the highest shape of everyone who matches the filters')
    await wrapper.findAll('.radar-panel button').find((button) => button.text() === 'lens-fox #3')?.trigger('click')
    expect(wrapper.text()).toContain('the measure lens-fox sent in issue #3')
    await wrapper.findAll('tbody tr.clickable')[1]?.trigger('click')
    expect(wrapper.findAll('.curve')).toHaveLength(2)
  })

  it('takes a ticked measure off the radar when the filters hide it', async () => {
    compareState.tool = 'vrhp'
    const wrapper = await mountPage('bigscreen-beyond-2')
    await clickButton(wrapper, 'Show older measures')
    await wrapper.findAll('tbody tr.clickable')[1]?.trigger('click')
    expect(wrapper.findAll('.curve')).toHaveLength(2)
    await clickButton(wrapper, 'Almost flush')
    expect(authors(wrapper)).toEqual(['nova-wren', 'lens-fox'])
    expect(wrapper.findAll('.curve')).toHaveLength(1)
    await clickButton(wrapper, 'Any')
    expect(wrapper.findAll('.curve')).toHaveLength(1)
  })

  it('says it is loading until the figures arrive', async () => {
    compareState.tool = 'vrhp'
    const wrapper = await mountPage('bigscreen-beyond-2')
    await wrapper.findAll('.segmented button').find((button) => button.text() === 'WIMFOV')?.trigger('click')
    expect(wrapper.text()).toContain('Loading the WIMFOV measures…')
    expect(wrapper.find('.radar-panel').exists()).toBe(false)
    await flushPromises()
    expect(wrapper.find('.radar-panel').exists()).toBe(true)
  })

  it('stops ticking when every colour is taken', async () => {
    compareState.tool = 'vrhp'
    const wrapper = await mountPage('bigscreen-beyond-2')
    await clickButton(wrapper, 'Show older measures')
    const rows = wrapper.findAll('tbody tr.clickable')
    for (let round = 0; round < 3; round += 1) {
      for (const row of rows) await row.trigger('click')
      for (const row of rows) await row.trigger('click')
    }
    for (const row of rows) await row.trigger('click')
    expect(wrapper.findAll('.curve')).toHaveLength(4)
  })

  it('shows a kept measure of the same headset and tool', async () => {
    keepMeasure(vrhpBeyond)
    const wrapper = await mountPage('bigscreen-beyond-2')
    expect(wrapper.find('.legend').text()).toContain('Kept measure · Bigscreen Beyond 2 (not published)')
    keepMeasure(vrhpIndex)
    await flushPromises()
    expect(wrapper.find('.legend').text()).not.toContain('Kept measure')
  })

  it('says when figures or pages fail to load, and retries a page', async () => {
    compareState.tool = 'vrhp'
    site.failing.add('data/aggregates/vrhp/bigscreen-beyond-2.json')
    site.failing.add('data/submissions/vrhp/bigscreen-beyond-2/1.json')
    const wrapper = await mountPage('bigscreen-beyond-2')
    expect(wrapper.text()).toContain("The VR Headset Picker figures couldn't be loaded.")
    expect(wrapper.text()).toContain("Some measures couldn't be loaded.")
    site.failing.clear()
    await clickButton(wrapper, 'Try again')
    expect(authors(wrapper)).toEqual(['nova-wren'])
  })

  it('ignores answers that arrive after another headset was opened', async () => {
    compareState.tool = 'vrhp'
    const wrapper = mount(HeadsetPage, { props: { headset: 'bigscreen-beyond-2' } })
    await flushPromises()
    await wrapper.setProps({ headset: 'valve-index' })
    await flushPromises()
    expect(authors(wrapper)).toEqual(['amber-kite'])
  })

  it('outlines a ticked FOV Atlas measure by what its own headset reported', async () => {
    compareState.tool = 'atlas'
    const wrapper = await mountPage('bigscreen-beyond-2')
    expect(wrapper.findAll('.kpi-value').map((value) => value.text().replace(/\s+/g, ' '))).toEqual([
      '106.0°',
      '106.0°',
      '110.0°',
      '4.0°',
      '1 / 1',
    ])
    expect(wrapper.findAll('.rendered path')).toHaveLength(2)
    await wrapper.findAll('tbody tr.clickable')[0]?.trigger('click')
    expect(wrapper.findAll('.rendered path')).toHaveLength(4)
    expect(wrapper.find('.rendered-notes').text()).toContain('delta-pilot #9: what the headset reported drawing while measuring')
    expect(wrapper.findAll('thead th').map((header) => header.text())).toContain('Gap')
  })

  it('lists the model by brand and name only', async () => {
    const wrapper = await mountPage('valve-index')
    const catalog = wrapper.find('[aria-labelledby="catalog-heading"]')
    expect(catalog.text().replace(/\s+/g, ' ')).toBe('About this model BrandValveModelValve Index')
    expect(wrapper.text()).toContain('Not reported')
    expect(wrapper.findAll('a').some((link) => link.attributes('href')?.includes('hmdgdb') === true)).toBe(false)
  })
})
