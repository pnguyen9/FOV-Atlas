// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AddMeasurePage from '../../src/pages/AddMeasurePage.vue'
import HeadsetStep from '../../src/pages/addMeasure/HeadsetStep.vue'
import ReviewStep from '../../src/pages/addMeasure/ReviewStep.vue'
import SetupStep from '../../src/pages/addMeasure/SetupStep.vue'
import ValuesStep from '../../src/pages/addMeasure/ValuesStep.vue'
import { draftKey, useDraft } from '../../src/pages/addMeasure/draftContext'
import { emptyDraft, type MeasureDraft } from '../../src/lib/measureDraft'
import { parseMeasureInput, parseMeasureText } from '../../src/lib/measureFile'
import { wimfovResultLink } from '../../src/lib/wimfov'
import { encodeVrhpPayload, wimfovPoints, wimfovResultId } from './fixtures'

const vrhpLink = (parts = {}): string =>
  `https://vrheadsetpicker.com/measure-your-fov/results?results=${encodeVrhpPayload(parts)}`

function mountStep(component: object, changes: Partial<MeasureDraft> = {}): { wrapper: VueWrapper; draft: MeasureDraft } {
  const draft = reactive({ ...emptyDraft(), ...changes })
  const wrapper = mount(component, { global: { provide: { [draftKey as symbol]: draft } } })
  return { wrapper, draft }
}

const nextButton = (wrapper: VueWrapper) => wrapper.findAll('.step-buttons button').at(-1)
const heading = (wrapper: VueWrapper): string => wrapper.find('section h2').text()

async function next(wrapper: VueWrapper): Promise<void> {
  await nextButton(wrapper)?.trigger('click')
}

async function fillFaceAndSetup(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('input[name="eye-depth"][value="in-between"]').setValue()
  await wrapper.find('input[name="nose-bridge"][value="low"]').setValue()
  await next(wrapper)
  await wrapper.find('input[name="gaze"][value="free"]').setValue()
  await next(wrapper)
}

// jsdom has no object URLs; the review step creates one for "Save as a file".
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:measure')
const revokeObjectURL = vi.fn<(url: string) => void>()
beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  Object.assign(URL, { createObjectURL, revokeObjectURL })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AddMeasurePage', () => {
  it('says up front that a GitHub account is needed and how to withdraw', () => {
    const text = mount(AddMeasurePage).text()
    expect(text).toContain('free GitHub account')
    expect(text).toContain('No GitHub account? You can still measure, keep the result and compare with it')
    expect(text).toContain('/withdraw')
    expect(mount(AddMeasurePage).find('a[href="https://github.com/signup"]').exists()).toBe(true)
  })

  it('offers only the tools whose results are imported', () => {
    const wrapper = mount(AddMeasurePage)
    expect(wrapper.findAll('input[name="tool"]').map((input) => input.attributes('value'))).toEqual(['vrhp', 'wimfov', 'testhmd'])
  })

  it('walks a VR Headset Picker link to a prefilled GitHub issue', async () => {
    const wrapper = mount(AddMeasurePage, { attachTo: document.body })
    expect(nextButton(wrapper)?.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.step-list button')[1]?.attributes('disabled')).toBeDefined()
    await wrapper.find('input[value="vrhp"]').setValue()
    await next(wrapper)
    expect(heading(wrapper)).toBe('VR Headset Picker share link')
    expect(document.activeElement).toBe(wrapper.find('section').element)
    await wrapper.find('textarea').setValue(vrhpLink())
    expect(wrapper.text()).toContain('It names the headset “Bigscreen Beyond 2”')
    await next(wrapper)
    expect(heading(wrapper)).toBe('Which headset?')
    expect(wrapper.text()).toContain('Preselected from the VR Headset Picker link')
    expect((wrapper.findAll('select')[1]?.element as HTMLSelectElement).value).toBe('bigscreen-beyond-2')
    await next(wrapper)
    await fillFaceAndSetup(wrapper)
    expect(heading(wrapper)).toBe('Review and send')
    expect(wrapper.findAll('.step-buttons button')).toHaveLength(1)
    const link = wrapper.find('a.button')
    expect(link.text()).toContain('Open on GitHub')
    const parameters = new URL(link.attributes('href') ?? '').searchParams
    expect(parameters.get('measure')).toBe(encodeVrhpPayload())
    expect(parameters.get('headset')).toBe('bigscreen-beyond-2')
    expect(parameters.get('gaze')).toBe('free')
    expect(wrapper.find('pre').text()).toContain('### Measuring tool')
    wrapper.unmount()
  })

  it('goes back, and jumps only to steps already reachable', async () => {
    const wrapper = mount(AddMeasurePage)
    await wrapper.find('input[value="testhmd"]').setValue()
    await next(wrapper)
    await wrapper.findAll('.step-buttons button')[0]?.trigger('click')
    expect(heading(wrapper)).toBe('Which tool did you measure with?')
    await wrapper.findAll('.step-list button')[1]?.trigger('click')
    expect(heading(wrapper)).toBe('TestHMD angles')
    await wrapper.findAll('.step-list button')[4]?.trigger('click')
    expect(heading(wrapper)).toBe('TestHMD angles')
  })
})

describe('useDraft', () => {
  it('refuses to run outside the page', () => {
    expect(() => mount({ setup: () => useDraft(), render: () => null })).toThrow('needs the draft')
  })
})

describe('ValuesStep', () => {
  it('explains a damaged VR Headset Picker link', () => {
    const { wrapper } = mountStep(ValuesStep, { tool: 'vrhp', vrhpLink: 'https://vrheadsetpicker.com/?results=AAAA' })
    expect(wrapper.find('.problem').text()).toContain('cut off')
  })

  it('reads a link without a headset name', () => {
    const { wrapper } = mountStep(ValuesStep, { tool: 'vrhp', vrhpLink: vrhpLink({ name: null, id: null }) })
    expect(wrapper.text()).toContain('Link read.')
    expect(wrapper.text()).not.toContain('It names')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('accepts a WIMFOV read-only link without a preview', () => {
    const { wrapper } = mountStep(ValuesStep, { tool: 'wimfov', wimfovLink: wimfovResultLink(wimfovResultId) })
    expect(wrapper.text()).toContain('Read-only link accepted')
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('refuses a WIMFOV edit link with the reason', () => {
    const { wrapper } = mountStep(ValuesStep, { tool: 'wimfov', wimfovLink: 'https://andreasaronsson.com/!apps/wimfov/?edit=12ab' })
    expect(wrapper.find('.problem').text()).toContain('anyone holding it can change or delete')
  })

  it('previews pasted WIMFOV points', async () => {
    const { wrapper, draft } = mountStep(ValuesStep, { tool: 'wimfov' })
    await wrapper.find('input[value="points"]').setValue()
    expect(draft.wimfovInput).toBe('points')
    await wrapper.find('textarea').setValue(wimfovPoints)
    expect(wrapper.findAll('polygon')).toHaveLength(2)
  })

  it('takes TestHMD angles typed by hand', async () => {
    const { wrapper, draft } = mountStep(ValuesStep, { tool: 'testhmd' })
    const [horizontal, vertical] = wrapper.findAll('input')
    await horizontal?.setValue('102.5')
    await vertical?.setValue('9x')
    expect(draft.testHmdHorizontal).toBe('102.5')
    expect(wrapper.find('.problem').text()).toContain('number of degrees')
  })
})

describe('HeadsetStep', () => {
  it('picks a model of the chosen brand', async () => {
    const { wrapper, draft } = mountStep(HeadsetStep, { tool: 'wimfov' })
    expect(wrapper.findAll('select')).toHaveLength(1)
    await wrapper.find('select').setValue('Meta')
    expect(draft.headset).toBe('')
    await wrapper.findAll('select')[1]?.setValue('meta-quest-3')
    expect(draft.headset).toBe('meta-quest-3')
  })

  it('selects the only model of a brand at once', async () => {
    const { wrapper, draft } = mountStep(HeadsetStep, { tool: 'wimfov' })
    await wrapper.find('select').setValue('Apple')
    expect(draft.headset).toBe('apple-vision-pro')
  })

  it('takes a typed name for a headset the list lacks', async () => {
    const { wrapper, draft } = mountStep(HeadsetStep, { tool: 'testhmd' })
    await wrapper.find('select').setValue('other')
    expect(draft.headset).toBe('other')
    await wrapper.find('input').setValue('Boba <3>')
    expect(wrapper.find('.problem').text()).toContain('plain text')
  })
})

describe('SetupStep', () => {
  it('shows each problem next to its field', () => {
    const { wrapper } = mountStep(SetupStep, { tuningDetails: '<b>', ipd: '20', facialInterface: '<i>', note: '# title' })
    expect(wrapper.findAll('.problem')).toHaveLength(4)
  })

  it('records the tuning flags', async () => {
    const { wrapper, draft } = mountStep(SetupStep)
    const [modded, tuned] = wrapper.findAll('input[type="checkbox"]')
    await modded?.setValue(true)
    await tuned?.setValue(true)
    expect([draft.physicallyModded, draft.driverTuned]).toEqual([true, true])
    const [details, ipd, facialInterface] = wrapper.findAll('input[type="text"]')
    await details?.setValue('Large FOV')
    await ipd?.setValue('63.5')
    await facialInterface?.setValue('stock')
    await wrapper.find('textarea').setValue('A note')
    expect([draft.tuningDetails, draft.ipd, draft.facialInterface, draft.note]).toEqual(['Large FOV', '63.5', 'stock', 'A note'])
  })
})

describe('ReviewStep', () => {
  const complete: Partial<MeasureDraft> = {
    brand: 'other',
    headset: 'other',
    otherHeadsetName: 'Boba 3',
    eyeDepth: 'deep-set',
    noseBridge: 'high',
    gaze: 'fixed',
    driverTuned: true,
    ipd: '64',
    note: 'Measured twice',
  }

  it('summarises the form and says WIMFOV values are read later', () => {
    const { wrapper } = mountStep(ReviewStep, { ...complete, tool: 'wimfov', wimfovLink: wimfovResultLink(wimfovResultId) })
    const text = wrapper.text()
    expect(text).toContain('Boba 3 (not listed yet)')
    expect(text).toContain('Stared ahead')
    expect(text).toContain('64 mm')
    expect(text).toContain('read from the WIMFOV link')
  })

  it('names a catalog headset and a free gaze', () => {
    const { wrapper } = mountStep(ReviewStep, {
      ...complete,
      tool: 'testhmd',
      testHmdHorizontal: '100',
      testHmdVertical: '90',
      brand: 'HTC',
      headset: 'htc-vive',
      otherHeadsetName: '',
      gaze: 'free',
    })
    expect(wrapper.text()).toContain('HTC Vive')
    expect(wrapper.text()).toContain('Looked around')
    expect(wrapper.text()).not.toContain('read from the WIMFOV link')
  })

  it('refuses an incomplete form', () => {
    const { wrapper } = mountStep(ReviewStep, { tool: null })
    expect(wrapper.find('.problem').text()).toContain('not complete')
    expect(wrapper.find('a.button').exists()).toBe(false)
  })

  it('refuses a form too long for a GitHub link', () => {
    const wide = '€'.repeat(200)
    const { wrapper } = mountStep(ReviewStep, {
      ...complete,
      tool: 'wimfov',
      wimfovInput: 'points',
      wimfovPoints,
      tuningDetails: wide,
      facialInterface: wide,
      note: '€'.repeat(500),
    })
    expect(wrapper.find('.problem').text()).toContain('too long')
  })

  const keptTestHmd: Partial<MeasureDraft> = {
    ...complete,
    tool: 'testhmd',
    testHmdHorizontal: '100',
    testHmdVertical: '90',
  }

  it('saves the measure as a file without publishing it', async () => {
    const { wrapper, draft } = mountStep(ReviewStep, keptTestHmd)
    const link = wrapper.find('a[download]')
    expect(link.attributes('href')).toBe('blob:measure')
    expect(link.attributes('download')).toBe('fov-atlas-other-testhmd.json')
    const blob = createObjectURL.mock.calls[0]?.[0]
    expect(blob?.type).toBe('application/json')
    expect(parseMeasureText(await blob?.text() ?? '').ok).toBe(true)
    draft.note = 'Changed'
    await flushPromises()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:measure')
    wrapper.unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('copies the measure as a link or as text', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { wrapper } = mountStep(ReviewStep, keptTestHmd)
    const [copyLink, copyText] = wrapper.findAll('.keep-buttons button')
    await copyLink?.trigger('click')
    await flushPromises()
    expect(parseMeasureInput(writeText.mock.calls[0]?.[0] ?? '').ok).toBe(true)
    expect(wrapper.text()).toContain('The link is copied')
    await copyText?.trigger('click')
    await flushPromises()
    expect(parseMeasureText(writeText.mock.calls[1]?.[0] ?? '').ok).toBe(true)
    expect(wrapper.text()).toContain('The text is copied')
  })

  it('shows the text to copy by hand when the clipboard is refused', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    const { wrapper } = mountStep(ReviewStep, keptTestHmd)
    await wrapper.findAll('.keep-buttons button')[1]?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain("didn't allow copying")
    expect(parseMeasureText((wrapper.find('textarea').element).value).ok).toBe(true)
  })

  it('explains why a WIMFOV read-only link cannot be kept', () => {
    const { wrapper } = mountStep(ReviewStep, { ...complete, tool: 'wimfov', wimfovLink: wimfovResultLink(wimfovResultId) })
    expect(wrapper.find('a[download]').exists()).toBe(false)
    expect(wrapper.text()).toContain('paste the points of the result')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('keeps nothing before the form is complete', () => {
    const { wrapper } = mountStep(ReviewStep, { tool: null })
    expect(wrapper.text()).toContain('Complete the steps above to keep the measure')
  })
})
