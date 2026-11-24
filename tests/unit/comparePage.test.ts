// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ComparePage from '../../src/pages/ComparePage.vue'
import { compareState, resetCompareState } from '../../src/pages/compare/compareState'
import { encodeMeasureParameter, encodeMeasureText, maximumMeasureTextLength, measureLink } from '../../src/lib/measureFile'
import { serveSite, type ServedSite } from './serveSite'
import { siteFiles, testHmdQuest, vrhpBeyond, vrhpIndex, wimfovBeyond } from './siteFixtures'

let site: ServedSite

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
    expect(cellsOf(wrapper, 0)).toEqual(['116.0°', '102.0°', '62.0°', '90.0°', '77.6 %', '1'])
    expect(cellsOf(wrapper, 2)).toEqual(['—', '—', '—', '—', '—', '—'])
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
    expect(header().text()).toBe('Highest vertical ▾')
    expect(wrapper.findAll('th')[3]?.attributes('aria-sort')).toBe('descending')
    await header().trigger('click')
    expect(header().text()).toBe('Highest vertical ▴')
    expect(rowNames(wrapper)[0]).toBe('Bigscreen Beyond 2')
    expect(rowNames(wrapper)[2]).toBe("HTC Vivecouldn't load")
  })

  it('adds and removes columns, keeping at least one', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'Rendered horizontal')
    await clickButton(wrapper, 'Gap to rendered')
    expect(wrapper.findAll('th button').map((button) => button.text()).slice(-2)).toEqual(['Rendered horizontal', 'Gap to rendered'])
    expect(cellsOf(wrapper, 0).slice(-2)).toEqual(['108.1°', '-7.9°'])
    expect(cellsOf(wrapper, 1).slice(-2)).toEqual(['109.2°', '-0.8°'])
    expect(wrapper.find('.borrowed-notes').text()).toBe('Bigscreen Beyond 2: rendered figures from the Beyond 2e (same lenses and panels).')
    expect(cellsOf(wrapper, 2).slice(-2)).toEqual(['108.8°', '—'])
    compareState.columns = ['count']
    await flushPromises()
    await clickButton(wrapper, 'Measures')
    expect(compareState.columns).toEqual(['count'])
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
  it('shows the ticked headsets with their ceilings', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await wrapper.findAll('tbody input[type="checkbox"]')[0]?.trigger('change')
    await clickButton(wrapper, 'Show on radar')
    expect(window.location.hash).toBe('#compare/radar')
    await wrapper.setProps({ view: 'radar' })
    expect(wrapper.find('.radar-chart').exists()).toBe(true)
    expect(wrapper.findAll('.curve')).toHaveLength(1)
    expect(wrapper.find('.legend').text()).toBe('Valve Index · highest (n=1)')
    expect(wrapper.findAll('.ceiling line')).toHaveLength(2)
    expect(wrapper.find('.ceiling-notes').text()).toContain('Valve Index: hmdq model reference, full frame')
  })

  it('picks the two widest headsets when opened with none ticked', async () => {
    const wrapper = await mountPage()
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'Radar')
    expect(window.location.hash).toBe('#compare/radar')
    expect(compareState.picks).toEqual([])
    await wrapper.setProps({ view: 'radar' })
    expect(compareState.picks.map((pick) => pick.key)).toEqual(['valve-index', 'bigscreen-beyond-2'])
    expect(wrapper.find('.ceiling-notes').text()).toContain('Bigscreen Beyond 2: hmdq model reference from the Beyond 2e (same lenses and panels), full frame')
    await clickButton(wrapper, 'Valve Index')
    expect(compareState.picks.map((pick) => pick.key)).toEqual(['bigscreen-beyond-2'])
  })

  it('draws headsets with no matching measure by their ceiling only, or nothing', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    compareState.filters.gaze = ['free']
    compareState.filters.tuning = ['stock']
    await flushPromises()
    expect(wrapper.find('.legend').text()).toBe('')
    expect(wrapper.findAll('.ceiling line')).toHaveLength(4)
    await clickButton(wrapper, 'Hide')
    expect(wrapper.find('.empty').text()).toContain('Nothing to draw')
    expect(wrapper.find('.radar-panel').text()).not.toContain('Valve Index · no matching')
  })

  it('switches eye and statistic', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    const points = (): number => wrapper.findAll('.curve circle').length
    expect(points()).toBe(12)
    await clickButton(wrapper, 'Overlap')
    expect(points()).toBe(8)
    await clickButton(wrapper, 'Left')
    expect(points()).toBe(10)
    await clickButton(wrapper, 'Mean')
    expect(wrapper.find('.legend').text()).toContain('Bigscreen Beyond 2 · mean (n=3)')
  })

  it('shows what you see through one headset at a time', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    await clickButton(wrapper, 'What you see')
    expect(wrapper.find('.scene').exists()).toBe(true)
    expect(wrapper.find('.both-eyes').exists()).toBe(true)
    expect(wrapper.text()).toContain('Clear: inside the highest shape measured on the Valve Index (both eyes together)')
    await wrapper.findAll('.radar-panel button').find((button) => button.text() === 'Bigscreen Beyond 2')?.trigger('click')
    expect(wrapper.text()).toContain('measured on the Bigscreen Beyond 2')
    expect(wrapper.find('.curve.emphasised').classes()).toContain('series-2')
    await clickButton(wrapper, 'Cockpit')
    expect(compareState.radar.scene).toBe('cockpit')
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
    expect(cellsOf(wrapper, 0)).toEqual(['110.0°', '96.9°', '59.0°', '84.0°', '76.4 %', '1'])
    expect(wrapper.find('.kept-card').text()).toContain('never counted in their figures')
    expect(wrapper.find('.match-count').text()).toContain('4 of 4')
    await pickTool(wrapper, 'WIMFOV')
    expect(wrapper.find('.kept-row').exists()).toBe(false)
    expect(wrapper.find('.kept-card').text()).toContain('It shows only next to VR Headset Picker measures')
    await clickButton(wrapper, 'Show VR Headset Picker measures')
    expect(compareState.tool).toBe('vrhp')
  })

  it('draws it dashed on the radar with its own ceiling, and can leave it off', async () => {
    const wrapper = await mountPage(null, 'radar')
    await pickTool(wrapper, 'VR Headset Picker')
    await paste(wrapper, measureLink(vrhpIndex, 'https://example.org/FOV-Atlas/'))
    expect(wrapper.find('.curve.dashed').classes()).toContain('series-kept')
    expect(wrapper.find('.legend').text()).toContain('Kept measure · Valve Index (not published)')
    expect(wrapper.find('.ceiling-notes').text()).toContain('Kept measure: Model reference, full frame')
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
