import { describe, expect, it } from 'vitest'
import { readIssueForm, renderIssueBody, submissionFromFields } from '../../src/lib/issueForm'
import {
  emptyDraft,
  furthestStep,
  issueOf,
  keptMeasureOf,
  lastStep,
  setupProblems,
  stepReady,
  valuesMessage,
  valuesOf,
  vrhpPrefill,
  headsetMessage,
  type MeasureDraft,
  type ValuesProblem,
} from '../../src/lib/measureDraft'
import { wimfovResultLink } from '../../src/lib/wimfov'
import { encodeVrhpPayload, wimfovPage, wimfovPoints, wimfovResultId } from './fixtures'

const vrhpLink = (parts = {}): string =>
  `https://vrheadsetpicker.com/measure-your-fov/results?results=${encodeVrhpPayload(parts)}`

const draftWith = (changes: Partial<MeasureDraft>): MeasureDraft => ({ ...emptyDraft(), ...changes })

/** Every step filled in, for the given values. */
const completeDraft = (changes: Partial<MeasureDraft>): MeasureDraft =>
  draftWith({
    brand: 'Bigscreen',
    headset: 'bigscreen-beyond-2',
    eyeDepth: 'deep-set',
    noseBridge: 'high',
    gaze: 'fixed',
    ...changes,
  })

describe('valuesOf', () => {
  it('needs a tool first', () => {
    expect(valuesOf(emptyDraft())).toEqual({ ok: false, problem: 'no-tool' })
  })

  it('decodes a VR Headset Picker link, keeping its results value', () => {
    const result = valuesOf(draftWith({ tool: 'vrhp', vrhpLink: ` ${vrhpLink()} ` }))
    expect(result.ok && result.values.kind === 'vrhp' && result.values.results).toBe(encodeVrhpPayload())
  })

  it.each<[string, Partial<MeasureDraft>, ValuesProblem]>([
    ['an empty VR Headset Picker link', { tool: 'vrhp', vrhpLink: '  ' }, 'empty'],
    ['a damaged VR Headset Picker link', { tool: 'vrhp', vrhpLink: 'https://vrheadsetpicker.com/?results=AAAA' }, 'vrhp-too-short'],
    ['an empty WIMFOV link', { tool: 'wimfov', wimfovLink: '' }, 'empty'],
    ['a WIMFOV edit link', { tool: 'wimfov', wimfovLink: 'https://andreasaronsson.com/!apps/wimfov/?id=b09b0749&edit=1f2e' }, 'wimfov-edit-link'],
    ['another site’s link', { tool: 'wimfov', wimfovLink: 'https://example.com/?id=b09b0749' }, 'wimfov-not-a-link'],
    ['text that is no link', { tool: 'wimfov', wimfovLink: 'b09b0749' }, 'wimfov-not-a-link'],
    ['empty WIMFOV points', { tool: 'wimfov', wimfovInput: 'points', wimfovPoints: '' }, 'empty'],
    ['malformed WIMFOV points', { tool: 'wimfov', wimfovInput: 'points', wimfovPoints: '1,2,3|4,5' }, 'wimfov-points-invalid'],
    ['a missing TestHMD angle', { tool: 'testhmd', testHmdHorizontal: '100', testHmdVertical: '' }, 'empty'],
    ['a TestHMD angle that is not a number', { tool: 'testhmd', testHmdHorizontal: '100°', testHmdVertical: '90' }, 'testhmd-not-a-number'],
    ['a TestHMD angle with two decimals', { tool: 'testhmd', testHmdHorizontal: '100.25', testHmdVertical: '90' }, 'testhmd-not-a-number'],
    ['a TestHMD angle past a full turn', { tool: 'testhmd', testHmdHorizontal: '400', testHmdVertical: '90' }, 'testhmd-out-of-range'],
    ['a zero TestHMD angle', { tool: 'testhmd', testHmdHorizontal: '0', testHmdVertical: '90' }, 'testhmd-out-of-range'],
  ])('refuses %s', (_description, changes, problem) => {
    expect(valuesOf(draftWith(changes))).toEqual({ ok: false, problem })
  })

  it('accepts a WIMFOV read-only link and pasted points', () => {
    const link = valuesOf(draftWith({ tool: 'wimfov', wimfovLink: wimfovResultLink(wimfovResultId) }))
    expect(link).toEqual({ ok: true, values: { kind: 'wimfov-link', resultId: wimfovResultId } })
    const points = valuesOf(draftWith({ tool: 'wimfov', wimfovInput: 'points', wimfovPoints: `"points":"${wimfovPoints}"` }))
    expect(points.ok && points.values.kind).toBe('wimfov-points')
  })

  it('splits TestHMD angles into halves', () => {
    const result = valuesOf(draftWith({ tool: 'testhmd', testHmdHorizontal: ' 102.5 ', testHmdVertical: '96' }))
    expect(result.ok && result.values.kind === 'testhmd' && result.values.measures.left).toEqual({ left: 51.25, up: 48, down: 48 })
  })
})

describe('valuesMessage', () => {
  it('stays quiet while a field is not filled in', () => {
    expect(valuesMessage('empty')).toBeNull()
    expect(valuesMessage('no-tool')).toBeNull()
  })

  it('warns about an edit link and explains why', () => {
    expect(valuesMessage('wimfov-edit-link')).toContain('change or delete')
  })

  it.each<ValuesProblem>(['vrhp-too-short', 'wimfov-points-invalid', 'testhmd-out-of-range'])('explains %s', (problem) => {
    expect(valuesMessage(problem)).toEqual(expect.any(String))
  })
})

describe('vrhpPrefill', () => {
  it('preselects the catalog headset of a new link', () => {
    const draft = draftWith({ tool: 'vrhp', vrhpLink: vrhpLink() })
    expect(vrhpPrefill(draft)).toEqual({
      prefilledFrom: encodeVrhpPayload(),
      brand: 'Bigscreen',
      headset: 'bigscreen-beyond-2',
      otherHeadsetName: '',
    })
  })

  it('preselects "other" with the link’s name for a model the catalog lacks', () => {
    const draft = draftWith({ tool: 'vrhp', vrhpLink: vrhpLink({ name: 'Boba 3', id: null }) })
    expect(vrhpPrefill(draft)).toMatchObject({ brand: 'other', headset: 'other', otherHeadsetName: 'Boba 3' })
  })

  it('only remembers a link that names no usable headset', () => {
    const draft = draftWith({ tool: 'vrhp', vrhpLink: vrhpLink({ name: null, id: null }) })
    expect(vrhpPrefill(draft)).toEqual({ prefilledFrom: encodeVrhpPayload({ name: null, id: null }) })
  })

  it('keeps a choice made after the same link', () => {
    const draft = draftWith({ tool: 'vrhp', vrhpLink: vrhpLink(), prefilledFrom: encodeVrhpPayload(), headset: 'htc-vive' })
    expect(vrhpPrefill(draft)).toBeNull()
  })

  it('does nothing for other tools or unreadable links', () => {
    expect(vrhpPrefill(draftWith({ tool: 'testhmd', testHmdHorizontal: '100', testHmdVertical: '90' }))).toBeNull()
    expect(vrhpPrefill(draftWith({ tool: 'vrhp', vrhpLink: 'nothing' }))).toBeNull()
  })
})

describe('headset step', () => {
  it('needs a catalog model, or "other" with a name', () => {
    expect(stepReady(draftWith({ headset: '' }), 2)).toBe(false)
    expect(stepReady(draftWith({ headset: 'htc-vive' }), 2)).toBe(true)
    expect(stepReady(draftWith({ headset: 'other', otherHeadsetName: '' }), 2)).toBe(false)
    expect(stepReady(draftWith({ headset: 'other', otherHeadsetName: 'Boba 3' }), 2)).toBe(true)
  })

  it('explains a name that cannot be sent, and only then', () => {
    expect(headsetMessage(draftWith({ headset: 'other', otherHeadsetName: '' }))).toBeNull()
    expect(headsetMessage(draftWith({ headset: 'other', otherHeadsetName: 'Boba 3' }))).toBeNull()
    expect(headsetMessage(draftWith({ headset: 'htc-vive', otherHeadsetName: '<b>' }))).toBeNull()
    expect(headsetMessage(draftWith({ headset: 'other', otherHeadsetName: '<b>' }))).toContain('plain text')
    expect(headsetMessage(draftWith({ headset: 'other', otherHeadsetName: 'x'.repeat(81) }))).toContain('80 characters')
  })
})

describe('setup step', () => {
  it('needs the gaze and nothing else', () => {
    expect(stepReady(draftWith({}), 4)).toBe(false)
    expect(stepReady(draftWith({ gaze: 'free' }), 4)).toBe(true)
  })

  it.each<[Partial<MeasureDraft>, string, string]>([
    [{ tuningDetails: 'x'.repeat(201) }, 'tuningDetails', '200 characters'],
    [{ facialInterface: 'a <b>' }, 'facialInterface', 'plain text'],
    [{ note: 'fine\n# heading' }, 'note', 'cannot start with #'],
    [{ ipd: '30' }, 'ipd', 'Between 45 and 85'],
    [{ ipd: '63.25' }, 'ipd', 'one decimal'],
    [{ ipd: 'wide' }, 'ipd', 'Between 45 and 85'],
  ])('refuses %j', (changes, field, message) => {
    const problems = setupProblems(draftWith({ gaze: 'fixed', ...changes }))
    expect(Object.keys(problems)).toEqual([field])
    expect(Object.values(problems)[0]).toContain(message)
    expect(stepReady(draftWith({ gaze: 'fixed', ...changes }), 4)).toBe(false)
  })

  it('accepts a multi-line note and an IPD with one decimal', () => {
    expect(setupProblems(draftWith({ note: 'one\ntwo', ipd: ' 63.5 ' }))).toEqual({})
  })
})

describe('furthestStep', () => {
  it('stops at the first incomplete step', () => {
    expect(furthestStep(emptyDraft())).toBe(0)
    expect(furthestStep(draftWith({ tool: 'vrhp' }))).toBe(1)
    expect(furthestStep(draftWith({ tool: 'vrhp', vrhpLink: vrhpLink() }))).toBe(2)
    expect(furthestStep(completeDraft({ tool: 'vrhp', vrhpLink: vrhpLink(), noseBridge: null }))).toBe(3)
    expect(furthestStep(completeDraft({ tool: 'vrhp', vrhpLink: vrhpLink(), gaze: null }))).toBe(4)
    expect(furthestStep(completeDraft({ tool: 'vrhp', vrhpLink: vrhpLink() }))).toBe(lastStep)
    expect(stepReady(emptyDraft(), lastStep)).toBe(true)
  })
})

describe('issueOf', () => {
  const fieldsOfUrl = (url: string): ReadonlyMap<string, string> => new Map(new URL(url).searchParams)

  it('refuses an incomplete form', () => {
    expect(issueOf(draftWith({ tool: 'vrhp', vrhpLink: vrhpLink() }))).toEqual({ ok: false, error: 'incomplete' })
  })

  it('opens an issue the Action accepts for a VR Headset Picker link', () => {
    const draft = completeDraft({
      tool: 'vrhp',
      vrhpLink: vrhpLink(),
      physicallyModded: true,
      tuningDetails: ' Large FOV ',
      ipd: '63.5',
      facialInterface: 'stock',
      note: 'first line\nsecond line',
    })
    const issue = issueOf(draft)
    if (!issue.ok) throw new Error(issue.error)
    const parameters = fieldsOfUrl(issue.url)
    expect(parameters.get('measure')).toBe(encodeVrhpPayload())
    expect(parameters.get('modded')).toBe('yes')
    expect(parameters.get('tuned')).toBe('no')
    expect(parameters.get('tuning-details')).toBe('Large FOV')
    const body = readIssueForm(renderIssueBody(issue.fields))
    expect(body.ok && submissionFromFields(body.fields).ok).toBe(true)
  })

  it('opens an issue for a WIMFOV read-only link that the Action reads', () => {
    const issue = issueOf(completeDraft({ tool: 'wimfov', wimfovLink: wimfovResultLink(wimfovResultId) }))
    if (!issue.ok) throw new Error(issue.error)
    expect(issue.fields.measure).toBe('')
    expect(fieldsOfUrl(issue.url).get('wimfov-link')).toBe(wimfovResultLink(wimfovResultId))
    expect(submissionFromFields(issue.fields, { wimfovPage: wimfovPage() }).ok).toBe(true)
  })

  it('sends pasted WIMFOV points in WIMFOV’s own layout', () => {
    const issue = issueOf(completeDraft({ tool: 'wimfov', wimfovInput: 'points', wimfovPoints: wimfovPoints }))
    expect(issue.ok && issue.fields.measure).toBe(wimfovPoints)
  })

  it('sends TestHMD angles as typed, with a headset the catalog lacks', () => {
    const issue = issueOf(
      completeDraft({ tool: 'testhmd', testHmdHorizontal: '102.5', testHmdVertical: '96', brand: 'other', headset: 'other', otherHeadsetName: ' Boba 3 ' }),
    )
    if (!issue.ok) throw new Error(issue.error)
    expect(issue.fields.measure).toBe('{"horizontal":102.5,"vertical":96}')
    expect(issue.fields['headset-name']).toBe('Boba 3')
    expect(fieldsOfUrl(issue.url).get('title')).toBe('Measure: Boba 3 (testhmd)')
  })

  it('refuses a form too long for a GitHub link', () => {
    const wide = '€'.repeat(200)
    const issue = issueOf(
      completeDraft({ tool: 'wimfov', wimfovInput: 'points', wimfovPoints, tuningDetails: wide, facialInterface: wide, note: '€'.repeat(500) }),
    )
    expect(issue).toEqual({ ok: false, error: 'url-too-long' })
  })
})

describe('keptMeasureOf', () => {
  it('keeps the measure exactly as it would be published', () => {
    const kept = keptMeasureOf(completeDraft({ tool: 'testhmd', testHmdHorizontal: '102.5', testHmdVertical: '96', ipd: '63' }))
    if (!kept.ok) throw new Error(kept.error)
    expect(kept.submission).toMatchObject({ tool: 'testhmd', headset: 'bigscreen-beyond-2', ipd: 63, gaze: 'fixed' })
  })

  it('refuses an incomplete form', () => {
    expect(keptMeasureOf(emptyDraft())).toEqual({ ok: false, error: 'incomplete' })
  })

  it('cannot keep a WIMFOV read-only link, whose values only the Action reads', () => {
    expect(keptMeasureOf(completeDraft({ tool: 'wimfov', wimfovLink: wimfovResultLink(wimfovResultId) }))).toEqual({
      ok: false,
      error: 'wimfov-link',
    })
  })
})
