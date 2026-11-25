// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import MeasurePage from '../../src/pages/MeasurePage.vue'
import { identity } from '../../src/lib/headFrame'
import type { MeasureEnvironment, XrSystemLike } from '../../src/lib/webxrMeasure'
import { answerModeKey } from '../../src/lib/answerModeMemory'
import { answerByHead, environmentWith, FakeSession, frameViews, onHeadPointing, onNo, onYes, readyByHead, straightHeadset } from './xrFixtures'

const browser = vi.hoisted(() => ({
  xr: undefined as XrSystemLike | undefined,
  environment: null as MeasureEnvironment | null,
}))
vi.mock('../../src/lib/browserXr', () => ({
  browserXr: () => browser.xr,
  browserMeasureEnvironment: () => browser.environment,
}))

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:measure'), revokeObjectURL: vi.fn() })
  window.localStorage.clear()
})

let environment: ReturnType<typeof environmentWith> | null = null

async function mounted(session: FakeSession | null, supported = true): Promise<VueWrapper> {
  environment = session === null ? null : environmentWith(session, { isSessionSupported: () => Promise.resolve(supported) })
  browser.environment = environment
  browser.xr = environment?.xr ?? { isSessionSupported: () => Promise.resolve(supported), requestSession: vi.fn() }
  const wrapper = mount(MeasurePage)
  await flushPromises()
  return wrapper
}

const startButton = (wrapper: VueWrapper) => wrapper.findAll('button').find((button) => button.text() === 'Start in the headset')

async function measureEverything(wrapper: VueWrapper, session: FakeSession, head = onYes, maskEvent: unknown = null): Promise<void> {
  await startButton(wrapper)?.trigger('click')
  await flushPromises()
  if (maskEvent !== null) session.dispatch('visibilitymaskchange', maskEvent)
  readyByHead(session)
  for (let answer = 0; answer < 400 && session.endCalls === 0; answer += 1) answerByHead(session, head)
  await flushPromises()
}

describe('MeasurePage', () => {
  it('explains, without a start button, that this browser cannot reach a headset', async () => {
    browser.xr = undefined
    const wrapper = mount(MeasurePage)
    expect(wrapper.text()).toContain('Checking whether this browser can reach a headset')
    await flushPromises()
    expect(wrapper.text()).toContain("This browser can't reach a VR headset")
    expect(startButton(wrapper)).toBeUndefined()
  })

  it('explains that no headset answered', async () => {
    const wrapper = await mounted(null, false)
    expect(wrapper.text()).toContain('no headset answered')
    expect(startButton(wrapper)).toBeUndefined()
  })

  it('reports a browser that cannot draw in the headset', async () => {
    const wrapper = await mounted(null)
    await startButton(wrapper)?.trigger('click')
    expect(wrapper.find('.problem').text()).toBe("This browser couldn't start drawing in the headset.")
  })

  it('shows the progress while measuring, and lets the measure be stopped', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await startButton(wrapper)?.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toBe('Put your headset on.')
    session.frame(identity)
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toContain('look at the dot and hold still')
    readyByHead(session)
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toBe('0 of 16 directions done. Now the left eye.')
    await wrapper.findAll('button').find((button) => button.text() === 'Stop')?.trigger('click')
    expect(wrapper.find('.problem').text()).toContain('stopped before the end')
    expect(startButton(wrapper)).toBeDefined()
  })

  it('measures sixteen directions when chosen', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await wrapper.find('input[value="all"]').setValue()
    await startButton(wrapper)?.trigger('click')
    await flushPromises()
    readyByHead(session)
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toContain('of 32 directions')
  })

  it('reports a headset whose views cannot be read', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await startButton(wrapper)?.trigger('click')
    await flushPromises()
    session.frame(identity, { views: frameViews(straightHeadset, identity).slice(0, 1) })
    await flushPromises()
    expect(wrapper.find('.problem').text()).toContain("didn't report a picture for each eye")
  })

  it('opens Finish your measure with what was seen and what the headset draws', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await measureEverything(wrapper, session, onYes, { indices: new Uint32Array(3) })
    expect(wrapper.find('h1').text()).toBe('Finish your measure')
    const rows = wrapper.findAll('tbody tr').map((row) => row.findAll('td').map((cell) => cell.text()))
    expect(rows).toEqual([
      ['Left', '54.8°', '42.0°', '44.0°', '52.9°'],
      ['Right', '54.8°', '42.0°', '44.0°', '52.9°'],
    ])
    expect(wrapper.text()).toContain('Corner mask: detected')
    expect(wrapper.findAll('.step-list button').map((button) => button.text())).toEqual([
      '1. Headset',
      '2. Face fit',
      '3. Setup',
      '4. Review',
    ])
    expect(wrapper.find('section[aria-label="Headset"]').exists()).toBe(true)
  })

  it('publishes the measure after the last questions', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await measureEverything(wrapper, session, onNo)
    expect(wrapper.text()).toContain('Corner mask: not reported')
    const next = async (): Promise<void> => {
      await wrapper.findAll('.step-buttons button').at(-1)?.trigger('click')
    }
    await wrapper.find('select').setValue('Bigscreen')
    await wrapper.findAll('select')[1]?.setValue('bigscreen-beyond-2')
    await next()
    await wrapper.find('input[name="eye-depth"][value="almost-flush"]').setValue()
    await wrapper.find('input[name="nose-bridge"][value="low"]').setValue()
    await next()
    await wrapper.find('input[name="gaze"][value="fixed"]').setValue()
    await next()
    expect(wrapper.find('.wizard section h2').text()).toBe('Review and send')
    expect(wrapper.text()).toContain('FOV Atlas')
    const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Open on GitHub ↗')
    expect(link?.attributes('href')).toContain('tool=atlas')
    expect(wrapper.findAll('button').some((button) => button.text() === 'Copy as a link')).toBe(true)
    await wrapper.findAll('.step-buttons button').at(0)?.trigger('click')
    expect(wrapper.find('.wizard section h2').text()).toBe('Setup')
  })

  it('discards the measure and goes to Add a measure', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await measureEverything(wrapper, session)
    const discard = wrapper.findAll('a').find((anchor) => anchor.text() === 'Discard it')
    expect(discard?.attributes('href')).toBe('#submit')
    await discard?.trigger('click')
    expect(wrapper.find('h1').text()).toBe('Measure my field of view')
    expect(wrapper.find('.problem').exists()).toBe(false)
  })

  it('ends the headset session when the page goes away', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await startButton(wrapper)?.trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(session.endCalls).toBe(1)
  })

  it('offers to keep the measure right away, before the headset and face fit', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await measureEverything(wrapper, session)
    const keep = wrapper.find('.keep-now')
    expect(keep.text()).toContain('Keep it without publishing')
    expect(keep.findAll('button').map((button) => button.text())).toEqual(['Copy as a link', 'Copy as text'])
    expect(keep.find('a').attributes('download')).toBe('fov-atlas-measure-atlas.json')
    await wrapper.find('select').setValue('Bigscreen')
    await wrapper.findAll('select')[1]?.setValue('bigscreen-beyond-2')
    expect(wrapper.find('.keep-now a').attributes('download')).toBe('fov-atlas-bigscreen-beyond-2-atlas.json')
  })

  it('estimates the time from the directions and the way of answering', async () => {
    const wrapper = await mounted(new FakeSession())
    expect(wrapper.text()).toContain('8 directions per eye (about 6 minutes)')
    expect(wrapper.text()).toContain('16 directions per eye (about 11 minutes)')
    await wrapper.find('input[value="controller"]').setValue()
    expect(wrapper.text()).toContain('8 directions per eye (about 5 minutes)')
  })

  it('remembers the way of answering in this browser', async () => {
    const first = await mounted(new FakeSession())
    await first.find('input[value="keyboard"]').setValue()
    expect(window.localStorage.getItem(answerModeKey)).toBe('keyboard')
    first.unmount()
    const second = await mounted(new FakeSession())
    expect((second.find('input[value="keyboard"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('says when no key press arrives, and remembers a switch to the head made in the headset', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await wrapper.find('input[value="keyboard"]').setValue()
    await startButton(wrapper)?.trigger('click')
    await flushPromises()
    expect(environment?.keyListeners.size).toBe(1)
    for (let frame = 0; frame < 210; frame += 1) session.frame(identity)
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('No key press has reached this page yet')
    for (let frame = 0; frame < 10; frame += 1) session.frame(onHeadPointing)
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toBe('0 of 16 directions done. Now the left eye.')
    expect(window.localStorage.getItem(answerModeKey)).toBe('head')
  })

  it('answers with the keyboard when the keys arrive', async () => {
    const session = new FakeSession()
    const wrapper = await mounted(session)
    await wrapper.find('input[value="keyboard"]').setValue()
    await startButton(wrapper)?.trigger('click')
    await flushPromises()
    session.frame(identity)
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toContain('then press Enter')
    environment?.pressKey('Enter')
    session.frame(identity)
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toBe('0 of 16 directions done. Now the left eye.')
  })
})
