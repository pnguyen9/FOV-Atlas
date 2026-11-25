// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ComparePage from '../../src/pages/ComparePage.vue'
import { compareState, resetCompareState } from '../../src/pages/compare/compareState'
import { encodeMeasureParameter, encodeMeasureText, maximumMeasureTextLength, measureLink } from '../../src/lib/measureFile'
import { serveSite, type ServedSite } from './serveSite'
import { siteFiles, testHmdQuest, vrhpBeyond, vrhpIndex, wimfovBeyond } from './siteFixtures'

let site: ServedSite

enableAutoUnmount(afterEach)

beforeEach(() => {
  site = serveSite(siteFiles())
  window.location.hash = '#compare'
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetCompareState()
})

async function mountPage(measure: string | null = null, view: 'table' | 'radar' = 'table'): Promise<VueWrapper> {
  const wrapper = mount(ComparePage, { props: { measure, view } })
  await flushPromises()
  return wrapper
}

async function pickTool(wrapper: VueWrapper, name: string): Promise<void> {
  const button = wrapper.findAll('.segmented button').find((candidate) => candidate.text() === name)
  if (button === undefined) throw new Error(`no ${name} button`)
  await button.trigger('click')
  await flushPromises()
}

async function clickButton(wrapper: VueWrapper, text: string): Promise<void> {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (button === undefined) throw new Error(`no ${text} button`)
  await button.trigger('click')
  await flushPromises()
}

const rowNames = (wrapper: VueWrapper): string[] =>
  wrapper.findAll('tbody tr').map((row) => row.find('.text-cell').text().replace(/\s+/g, ' '))

const cellsOf = (wrapper: VueWrapper, rowIndex: number): string[] =>
  wrapper.findAll('tbody tr').at(rowIndex)?.findAll('td').slice(2).map((cell) => cell.text()) ?? []

describe('ComparePage data', () => {
  it('says when nothing is published yet', async () => {
    site.files.clear()
    const wrapper = mount(ComparePage)
    expect(wrapper.text()).toContain('Loading the measures')
    await flushPromises()
    expect(wrapper.text().split('No measures are published yet')).toHaveLength(2)
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Filters"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Pick a measuring tool first')
    await wrapper.find('textarea').setValue(encodeMeasureText(vrhpBeyond))
    await clickButton(wrapper, 'Compare')
    expect(wrapper.find('.kept-row').exists()).toBe(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text().split('No measures are published yet')).toHaveLength(2)
  })

  it('shows no layout until the index has loaded', () => {
    const wrapper = mount(ComparePage)
    expect(wrapper.find('.side-layout').exists()).toBe(false)
  })

  it('reports data it cannot use, and shows no table', async () => {
    site.files.set('data/index.json', '{"version":9}')
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain("couldn't be loaded")
    await pickTool(wrapper, 'VR Headset Picker')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('stays empty until a tool is picked, then loads only that tool', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Pick a measuring tool first')
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('Pick a tool to see how many measures match')
    await clickButton(wrapper, 'VR Headset Picker')
    expect(site.requested.filter((path) => path.startsWith('data/aggregates/'))).toEqual([
      'data/aggregates/vrhp/bigscreen-beyond-2.json',
      'data/aggregates/vrhp/valve-index.json',
      'data/aggregates/vrhp/htc-vive.json',
    ])
    expect(rowNames(wrapper)).toEqual(['Valve Index', 'Bigscreen Beyond 2', "HTC Vivecouldn't load"])
    expect(wrapper.findAll('th button').map((button) => button.text())).toEqual([
      'Highest width L / R ▾',
      'Highest height L / R',
      'Diagonal (outer)',
      'Measures',
      'Width gap L / R',
    ])
    expect(cellsOf(wrapper, 0)).toEqual(['103.0° / 103.0°', '102.0° / 102.0°', '62.0°', '1', '—'])
    expect(cellsOf(wrapper, 1)).toEqual(['97.0° / 95.8°', '96.9° / 96.7°', '59.0°', '3', '0.0° / 0.9°'])
    expect(cellsOf(wrapper, 2)).toEqual(['—', '—', '—', '—', '—'])
    expect(site.requested.filter((path) => path.startsWith('data/rendered/'))).toEqual([
      'data/rendered/bigscreen-beyond-2.json',
      'data/rendered/valve-index.json',
    ])
    expect(wrapper.text()).toContain('VR Headset Picker measures each eye from the centre of that eye')
    expect(wrapper.find('.match-count').text().replace(/\s+/g, ' ')).toBe('4 of 4 VR Headset Picker measures match')
  })

  it('shows a tool without measures as empty', async () => {
    site.files.set('data/index.json', JSON.stringify({ version: 1, headsets: { wimfov: { 'bigscreen-beyond-2': { count: 1, pages: 1 } } } }))
    const wrapper = await mountPage()
    await pickTool(wrapper, 'TestHMD')
    expect(wrapper.text()).toContain('No TestHMD measures are published yet.')
  })

  it('ignores figures of a tool left while they load', async () => {
    const wrapper = await mountPage()
    await wrapper.findAll('.segmented button')[1]?.trigger('click')
    await wrapper.findAll('.segmented button')[2]?.trigger('click')
    await flushPromises()
    expect(compareState.tool).toBe('wimfov')
    expect(rowNames(wrapper)).toEqual(['Bigscreen Beyond 2'])
    expect(wrapper.find('.match-count').text()).toContain('1 of 1 WIMFOV')
  })

  it('waits for the new tool’s figures before picking the widest for the radar', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await wrapper.findAll('.segmented button')[2]?.trigger('click')
    await wrapper.setProps({ view: 'radar' })
    expect(compareState.picks).toEqual([])
    await flushPromises()
    expect(compareState.picks).toEqual([{ key: 'bigscreen-beyond-2', slot: 1 }])
  })

  it('says it is loading a tool until its figures arrive', async () => {
    const wrapper = await mountPage()
    await wrapper.findAll('.segmented button')[2]?.trigger('click')
    expect(wrapper.text()).toContain('Loading the WIMFOV measures')
    await flushPromises()
    expect(rowNames(wrapper)).toEqual(['Bigscreen Beyond 2'])
  })
})

describe('ComparePage table', () => {
  it('sorts by a column, either way', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    const header = (): ReturnType<VueWrapper['find']> => wrapper.findAll('th button')[1] as ReturnType<VueWrapper['find']>
    await header().trigger('click')
    expect(header().text()).toBe('Highest height L / R ▾')
    expect(wrapper.findAll('th')[3]?.attributes('aria-sort')).toBe('descending')
    await header().trigger('click')
    expect(header().text()).toBe('Highest height L / R ▴')
    expect(rowNames(wrapper)[0]).toBe('Bigscreen Beyond 2')
    expect(rowNames(wrapper)[2]).toBe("HTC Vivecouldn't load")
  })

  it('adds and removes columns, keeping at least one', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'Rendered horizontal (link)')
    await clickButton(wrapper, 'Rendered overlap (link)')
    expect(wrapper.findAll('th button').map((button) => button.text()).slice(-2)).toEqual([
      'Rendered horizontal (link)',
      'Rendered overlap (link)',
    ])
    expect(cellsOf(wrapper, 0).slice(-2)).toEqual(['—', '—'])
    expect(cellsOf(wrapper, 1).slice(-2)).toEqual(['109.2°', '84.3°'])
    expect(wrapper.text()).not.toContain('Highest horizontal')
    compareState.columns.vrhp = ['count']
    await flushPromises()
    await clickButton(wrapper, 'Measures')
    expect(compareState.columns.vrhp).toEqual(['count'])
    await pickTool(wrapper, 'FOV Atlas')
    expect(wrapper.findAll('th button').map((button) => button.text())).toEqual([
      'Highest horizontal ▾',
      'Highest vertical',
      'Diagonal (outer)',
      'Overlap °',
      'Measures',
      'Rendered horizontal',
      'Gap to rendered',
    ])
    expect(cellsOf(wrapper, 0)).toEqual(['113.4°', '97.7°', '65.1°', '85.0°', '2', '134.0°', '10.6°'])
    await clickButton(wrapper, 'Rendered horizontal (model average)')
    expect(cellsOf(wrapper, 0).at(-1)).toBe('129.0°')
    await pickTool(wrapper, 'WIMFOV')
    expect(wrapper.findAll('.chip').map((chip) => chip.text()).filter((label) => label.includes('endered') || label.includes('Gap'))).toEqual([])
  })

  it('filters by any ticked choice within a group, and every group', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'Deep-set')
    expect(wrapper.find('.match-count').text()).toContain('1 of 4')
    expect(rowNames(wrapper)).toContain('Valve Indexno match')
    await clickButton(wrapper, 'In between')
    await clickButton(wrapper, 'Almost flush')
    expect(compareState.filters.eyeDepth).toEqual([])
    await clickButton(wrapper, 'Looked around')
    expect(wrapper.find('.match-count').text()).toContain('1 of 4')
    await clickButton(wrapper, 'Reset to “Any”')
    expect(compareState.filters.gaze).toEqual([])
    await clickButton(wrapper, 'Low')
    const anyChip = wrapper.findAll('.chip').filter((chip) => chip.text() === 'Any')[1]
    await anyChip?.trigger('click')
    expect(compareState.filters.noseBridge).toEqual([])
  })

  it('opens a headset’s page from its row', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await wrapper.findAll('tbody tr')[0]?.trigger('click')
    expect(window.location.hash).toBe('#headset/valve-index')
  })

  it('ticks headsets for the radar, up to the colours it has', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await wrapper.findAll('tbody input[type="checkbox"]')[1]?.trigger('change')
    expect(wrapper.find('.pick-bar').text()).toContain('1 selected: Bigscreen Beyond 2')
    expect(wrapper.findAll('tbody .swatch')[1]?.classes()).toContain('series-1')
    compareState.picks = Array.from({ length: 8 }, (_, pickIndex) => ({ key: `headset-${String(pickIndex)}`, slot: pickIndex + 1 }))
    await flushPromises()
    expect(wrapper.text()).toContain('The radar shows up to 8 headsets at once.')
    expect(wrapper.findAll('tbody input[type="checkbox"]')[0]?.attributes('disabled')).toBeDefined()
    await clickButton(wrapper, 'Clear')
    expect(compareState.picks).toEqual([])
  })
})

describe('ComparePage radar', () => {
  it('shows the ticked headsets, outlined by the model’s averaged pictures, warning when units differ', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await wrapper.findAll('tbody input[type="checkbox"]')[0]?.trigger('change')
    await clickButton(wrapper, 'Show on radar')
    expect(window.location.hash).toBe('#compare/radar')
    await wrapper.setProps({ view: 'radar' })
    expect(wrapper.find('.radar-chart').exists()).toBe(true)
    expect(wrapper.findAll('.curve')).toHaveLength(1)
    expect(wrapper.find('.legend').text()).toBe('Valve Index · highest (n=1)')
    expect(wrapper.findAll('.rendered path')).toHaveLength(2)
    expect(wrapper.find('.rendered-notes').text()).toContain(
      'Valve Index: average of 2 headsets of this model, as they report drawing it. Units of this model differ by up to 10.0°.',
    )
    expect(wrapper.text()).toContain('seen from the centre of each picture as VR Headset Picker measures')
  })

  it('says when a VR Headset Picker model has no averaged pictures', async () => {
    const index = JSON.parse(site.files.get('data/index.json') ?? '{}') as { rendered: Record<string, number> }
    site.files.set('data/index.json', JSON.stringify({ ...index, rendered: { 'bigscreen-beyond-2': 2 } }))
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    compareState.picks = [{ key: 'valve-index', slot: 1 }]
    await flushPromises()
    expect(wrapper.findAll('.rendered path')).toHaveLength(0)
    expect(wrapper.find('.rendered-notes').text()).toContain('Valve Index: no FOV Atlas measure of this model has read what it draws yet')
  })

  it('tells a model average that failed to load from a model without one', async () => {
    site.failing.add('data/rendered/valve-index.json')
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    compareState.picks = [{ key: 'valve-index', slot: 1 }]
    await flushPromises()
    expect(wrapper.findAll('.rendered path')).toHaveLength(0)
    expect(wrapper.find('.rendered-notes').text()).toContain(
      "Valve Index: the model's averaged rendered field of view couldn't be loaded. Try again in a moment",
    )
    expect(wrapper.find('.rendered-notes').text()).not.toContain('no FOV Atlas measure')
  })

  it('outlines each eye’s picture for FOV Atlas by the model’s average', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'FOV Atlas')
    compareState.picks = [{ key: 'bigscreen-beyond-2', slot: 1 }]
    await flushPromises()
    expect(wrapper.findAll('.rendered path')).toHaveLength(2)
    expect(wrapper.find('.rendered-notes').text()).toContain('Bigscreen Beyond 2: average of 2 headsets of this model, as they report drawing it')
    expect(wrapper.find('.rendered-notes').text()).not.toContain('Units of this model differ')
    await clickButton(wrapper, 'Left')
    expect(wrapper.findAll('.rendered path')).toHaveLength(1)
    await clickButton(wrapper, 'Hide')
    expect(wrapper.findAll('.rendered path')).toHaveLength(0)
    expect(wrapper.find('.rendered-notes').exists()).toBe(false)
  })

  it('picks the two widest headsets when opened with none ticked', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'Radar')
    expect(window.location.hash).toBe('#compare/radar')
    expect(compareState.picks).toEqual([])
    await wrapper.setProps({ view: 'radar' })
    expect(compareState.picks.map((pick) => pick.key)).toEqual(['valve-index', 'bigscreen-beyond-2'])
    await clickButton(wrapper, 'Valve Index')
    expect(compareState.picks.map((pick) => pick.key)).toEqual(['bigscreen-beyond-2'])
  })

  it('draws nothing for headsets with no matching measure', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'FOV Atlas')
    compareState.filters.eyeDepth = ['deep-set']
    await flushPromises()
    expect(wrapper.find('.empty').text()).toContain('Nothing to draw')
    expect(wrapper.find('.radar-panel').text()).not.toContain('Bigscreen Beyond 2 · no matching')
  })

  it('switches eye and statistic', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    const points = (): number => wrapper.findAll('.curve > circle').length
    const oneEyeLetters = (): string[] => wrapper.findAll('.curve .one-eye text').map((letter) => letter.text())
    const key = (): string => wrapper.find('.unmeasured-key').text()
    // Either eye: the four edges both eyes have, each eye's own diagonal set beside them.
    expect(points()).toBe(8)
    expect(oneEyeLetters()).toEqual(['L', 'R', 'L', 'R'])
    expect(wrapper.find('.curve .one-eye title').text()).toContain('down-left')
    expect(wrapper.find('.curve .one-eye title').text()).toContain('left eye only')
    expect(wrapper.findAll('.curve .edge.unmeasured')).toHaveLength(2)
    expect(key()).toContain('Short dashes: not measured by VR Headset Picker.')
    expect(key()).toContain('Measured on one eye only')
    await clickButton(wrapper, 'Overlap')
    expect(points()).toBe(8)
    expect(oneEyeLetters()).toHaveLength(4)
    await clickButton(wrapper, 'Left')
    expect(points()).toBe(10)
    expect(oneEyeLetters()).toEqual([])
    expect(key()).not.toContain('one eye only')
    await clickButton(wrapper, 'Mean')
    expect(wrapper.find('.legend').text()).toContain('Bigscreen Beyond 2 · mean (n=3)')
  })

  it('also shows each headset’s mean beside its highest when asked, saying which line is which', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    expect(compareState.radar.alsoMean).toBe(false)
    expect(wrapper.findAll('.curve.mean')).toHaveLength(0)
    await wrapper.find('.also-mean input').setValue(true)
    expect(wrapper.findAll('.curve.mean')).toHaveLength(2)
    expect(wrapper.findAll('.curve.mean.filled')).toHaveLength(0)
    expect(wrapper.findAll('.curve.mean .one-eye')).toHaveLength(0)
    expect(wrapper.findAll('.curve.mean .edge.unmeasured')).toHaveLength(2)
    expect(wrapper.findAll('.legend .legend-mean')).toHaveLength(2)
    expect(wrapper.find('.legend').text()).toContain('Bigscreen Beyond 2 · mean')
    expect(wrapper.find('.line-key').text()).toContain('Dash-dot: the mean of what people measured.')
    expect(wrapper.find('.line-key').text()).toContain('Dotted: what the headsets report drawing.')
    await clickButton(wrapper, 'Hide')
    expect(wrapper.find('.line-key').text()).not.toContain('Dotted')
    await clickButton(wrapper, 'What you see')
    expect(wrapper.findAll('.curve.mean')).toHaveLength(0)
    await clickButton(wrapper, 'Shape')
    await clickButton(wrapper, 'Mean')
    expect(wrapper.find('.also-mean').exists()).toBe(false)
    expect(wrapper.findAll('.curve.mean')).toHaveLength(0)
  })

  it('shows what you see through one headset at a time', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'What you see')
    expect(wrapper.find('.scene').exists()).toBe(true)
    expect(wrapper.find('.both-eyes').exists()).toBe(true)
    expect(wrapper.findAll('.both-eyes.unmeasured')).toHaveLength(1)
    expect(wrapper.text()).toContain('Clear: inside the highest shape measured on the Valve Index (both eyes together)')
    await wrapper.findAll('.radar-panel button').find((button) => button.text() === 'Bigscreen Beyond 2')?.trigger('click')
    expect(wrapper.text()).toContain('measured on the Bigscreen Beyond 2')
    expect(wrapper.find('.curve.emphasised').classes()).toContain('series-2')
    expect(wrapper.find('.scene image').attributes('href')).toBe('/scenes/living-room.webp')
    expect(wrapper.text()).toContain('The living room is a 360° photo')
    await clickButton(wrapper, 'Grid void')
    expect(compareState.radar.scene).toBe('void')
    expect(wrapper.find('.scene image').exists()).toBe(false)
    await clickButton(wrapper, 'Right')
    expect(wrapper.find('.both-eyes').exists()).toBe(false)
  })

  it('fills the window until closed or Escape is pressed', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, '⤢ Enlarge')
    expect(wrapper.find('.radar-panel').classes()).toContain('enlarged')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await flushPromises()
    expect(compareState.radar.enlarged).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(compareState.radar.enlarged).toBe(false)
    await clickButton(wrapper, '⤢ Enlarge')
    await clickButton(wrapper, '✕ Close')
    expect(compareState.radar.enlarged).toBe(false)
    await clickButton(wrapper, '⤢ Enlarge')
    wrapper.unmount()
    expect(compareState.radar.enlarged).toBe(false)
  })

  it('draws a tool that measures both eyes at once as one shape', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'TestHMD')
    expect(wrapper.text()).toContain('TestHMD measures both eyes together.')
    await clickButton(wrapper, 'What you see')
    expect(wrapper.find('.both-eyes').exists()).toBe(false)
  })

  it('says when a tool has no headset to pick', async () => {
    site.files.set('data/index.json', JSON.stringify({ version: 1, headsets: { vrhp: { 'valve-index': { count: 1, pages: 1 } } } }))
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'WIMFOV')
    expect(wrapper.text()).toContain('No headset has WIMFOV measures yet.')
  })
})

describe('ComparePage kept measure', () => {
  const paste = async (wrapper: VueWrapper, text: string): Promise<void> => {
    await wrapper.find('textarea').setValue(text)
    await clickButton(wrapper, 'Compare')
  }

  it('opens from the address, picking its tool, beside the same tool only', async () => {
    const wrapper = await mountPage(encodeMeasureParameter(vrhpBeyond))
    expect(compareState.tool).toBe('vrhp')
    expect(wrapper.find('.kept-row .text-cell').text()).toBe('Kept measure · Bigscreen Beyond 2not published')
    expect(cellsOf(wrapper, 0)).toEqual(['97.0° / 95.8°', '96.9° / 96.7°', '59.0°', '1', '0.0° / 0.9°'])
    expect(wrapper.find('.kept-card').text()).toContain('never counted in their figures')
    expect(wrapper.find('.match-count').text()).toContain('4 of 4')
    await pickTool(wrapper, 'WIMFOV')
    expect(wrapper.find('.kept-row').exists()).toBe(false)
    expect(wrapper.find('.kept-card').text()).toContain('It shows only next to VR Headset Picker measures')
    await clickButton(wrapper, 'Show VR Headset Picker measures')
    expect(compareState.tool).toBe('vrhp')
  })

  it('sets it against its model’s average when no published measure of its tool shares its headset, warning when units differ', async () => {
    const wrapper = await mountPage(encodeMeasureParameter({ ...testHmdQuest, headset: 'valve-index' }))
    expect(compareState.tool).toBe('testhmd')
    expect(wrapper.find('.kept-row .text-cell').text()).toContain('Valve Index')
    expect(cellsOf(wrapper, 0).at(-1)).toBe('129.0°')
    expect(wrapper.find('.unit-warning').text()).toContain('Valve Index: Units of this model differ by up to 10.0°')
  })

  it('says plainly when the kept measure leaves its headset and face fit out', async () => {
    const wrapper = await mountPage(encodeMeasureParameter({ ...vrhpBeyond, headset: '', face: null, gaze: null, tuning: null }))
    expect(wrapper.find('.kept-row .text-cell').text()).toBe('Kept measure · headset not givennot published')
    expect(wrapper.find('.kept-card').text()).toContain('Kept measure: headset not given')
    expect(wrapper.find('.kept-card').text()).toContain('Not given: face fit, gaze, tuning.')
    expect(cellsOf(wrapper, 0)[0]).toBe('97.0° / 95.8°')
  })

  it('draws it dashed on the radar, and can leave it off', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    await paste(wrapper, measureLink(vrhpIndex, 'https://example.org/FOV-Atlas/'))
    expect(wrapper.find('.curve.dashed').classes()).toContain('series-kept')
    expect(wrapper.find('.legend').text()).toContain('Kept measure · Valve Index (not published)')
    expect(wrapper.find('.rendered-notes').text()).toContain('Kept measure: the headset\'s report wasn\'t read')
    await wrapper.setProps({ view: 'table' })
    await wrapper.find('.kept-row input').setValue(false)
    await wrapper.setProps({ view: 'radar' })
    expect(wrapper.find('.curve.dashed').exists()).toBe(false)
  })

  it('opens pasted text and says why a paste fails', async () => {
    const wrapper = await mountPage()
    await paste(wrapper, 'https://example.org/#compare?other=1')
    expect(wrapper.find('[role="alert"]').text()).toContain('(no-measure-in-link)')
    await paste(wrapper, encodeMeasureText(wimfovBeyond))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('.kept-card').text()).toContain('measured with WIMFOV')
    expect(compareState.tool).toBe('wimfov')
  })

  it('removes it, leaving the address of a link it came from', async () => {
    const measure = encodeMeasureParameter(testHmdQuest)
    window.location.hash = `#compare?measure=${measure}`
    const wrapper = await mountPage(measure)
    await clickButton(wrapper, 'Remove it')
    expect(compareState.kept).toBeNull()
    expect(window.location.hash).toBe('#compare')
    await paste(wrapper, encodeMeasureText(testHmdQuest))
    window.location.hash = '#elsewhere'
    await wrapper.setProps({ measure: null })
    await clickButton(wrapper, 'Remove it')
    expect(window.location.hash).toBe('#elsewhere')
  })

  it('keeps its radar tick when the page opens again from the same link', async () => {
    const measure = encodeMeasureParameter(vrhpBeyond)
    const first = await mountPage(measure)
    await first.find('.kept-row input').setValue(false)
    first.unmount()
    const again = await mountPage(measure)
    expect(compareState.keptOnRadar).toBe(false)
    expect((again.find('.kept-row input').element as HTMLInputElement).checked).toBe(false)
  })

  it('says why a measure breaking a rule can’t be opened', async () => {
    const wrapper = await mountPage(encodeMeasureParameter({ ...vrhpBeyond, ipd: 20 }))
    expect(wrapper.find('[role="alert"]').text()).toBe(
      "This measure can't be opened. Its values break the rules of a measure. (ipd-out-of-range)",
    )
    expect(compareState.kept).toBeNull()
  })

  it('says when the link in the address is damaged', async () => {
    const wrapper = await mountPage('abc+')
    expect(wrapper.find('[role="alert"]').text()).toContain('The link is damaged')
  })

  it('opens a saved file, refusing one far too large', async () => {
    const wrapper = await mountPage()
    const input = wrapper.find('input[type="file"]')
    const choose = async (file: File | null): Promise<void> => {
      Object.defineProperty(input.element, 'files', { value: file === null ? [] : [file], configurable: true })
      await input.trigger('change')
      await flushPromises()
    }
    await choose(null)
    expect(compareState.kept).toBeNull()
    await choose(new File(['x'.repeat(maximumMeasureTextLength + 1)], 'big.json'))
    expect(wrapper.find('[role="alert"]').text()).toContain('(file-too-large)')
    const unreadable = new File(['{}'], 'broken.json')
    unreadable.text = (): Promise<string> => Promise.reject(new Error('gone'))
    await choose(unreadable)
    expect(wrapper.find('[role="alert"]').text()).toContain('(file-unreadable)')
    await choose(new File([encodeMeasureText(vrhpBeyond)], 'measure.json'))
    expect(compareState.kept).toEqual(vrhpBeyond)
  })
})
