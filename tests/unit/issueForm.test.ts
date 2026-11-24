import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildIssueUrl,
  headsetChoiceOfVrhpLink,
  issueFields,
  issueFieldsOf,
  maximumBodyLength,
  newIssueUrl,
  parseIssueBody,
  readIssueForm,
  renderIssueBody,
  submissionFromFields,
  wimfovResultToFetch,
  type IssueFields,
} from '../../src/lib/issueForm'
import type { Submission } from '../../src/lib/submission'
import { decodeVrhpLink, type VrhpMeasure } from '../../src/lib/vrhpLink'
import { wimfovResultLink } from '../../src/lib/wimfov'
import {
  atlasSubmission,
  beyondAngles,
  encodeVrhpPayload,
  testHmdSubmission,
  wimfovPage,
  wimfovPoints,
  wimfovResultId,
} from './fixtures'

const atlasFields = issueFieldsOf(atlasSubmission)
const fieldsWith = (changes: Partial<IssueFields>): IssueFields => ({ ...atlasFields, ...changes })
const vrhpShareLink = `https://vrheadsetpicker.example/measure-your-fov/results?results=${encodeVrhpPayload()}`
const typedEyes = JSON.stringify({
  left: { 'left': 55, 'right': 42, 'up': 43, 'down': 53.9, 'down-left': 59 },
  right: { 'left': 41.5, 'right': 54.3, 'up': 44.2, 'down': 52.5, 'up-right': 52 },
})

function parsed(fields: IssueFields, options = {}): Submission {
  const result = submissionFromFields(fields, options)
  if (!result.ok) throw new Error(`Rejected: ${result.error}`)
  return result.submission
}

describe('issue form template', () => {
  const template = readFileSync('.github/ISSUE_TEMPLATE/submission.yml', 'utf8')
  it.each(issueFields.map(({ id, label }) => [id, label]))('declares the field %s labelled "%s"', (id, label) => {
    expect(template).toContain(`    id: ${id}\n    attributes:\n      label: ${label}\n`)
  })
  it('declares no other field', () => {
    expect(template.match(/^ {4}id: /gm)).toHaveLength(issueFields.length)
  })
})

describe('readIssueForm', () => {
  it('reads every section, with empty responses as empty strings', () => {
    const body = renderIssueBody(fieldsWith({ note: '', 'facial-interface': '' }))
    expect(body).toContain('### Note\n\n_No response_\n')
    expect(readIssueForm(body)).toEqual({ ok: true, fields: fieldsWith({ note: '', 'facial-interface': '' }) })
  })

  it('accepts Windows line breaks and leading blank lines', () => {
    const body = `\n\n${renderIssueBody(atlasFields).replaceAll('\n', '\r\n')}`
    expect(readIssueForm(body)).toEqual({ ok: true, fields: atlasFields })
  })

  const body = renderIssueBody(atlasFields)
  it.each([
    ['body-too-long', `${body}${' '.repeat(maximumBodyLength)}`],
    ['body-malformed', `Hello\n\n${body}`],
    ['body-malformed', `${body}\n### Extra\n\nvalue\n`],
    ['body-malformed', `${body}\n### Note\n\nagain\n`],
    ['body-malformed', body.replace('### Note\n', '### Notes\n')],
    ['body-malformed', body.slice(0, body.indexOf('### Note'))],
  ])('rejects a body with %s', (error, markdown) => {
    expect(readIssueForm(markdown)).toEqual({ ok: false, error })
  })
})

describe('round trips through the issue body', () => {
  const vrhpFromLink = parsed(fieldsWith({ tool: 'vrhp', measure: vrhpShareLink }))
  const wimfovPasted = parsed(fieldsWith({ tool: 'wimfov', measure: wimfovPoints }))
  const wimfovLinked = parsed(
    fieldsWith({ tool: 'wimfov', measure: '', 'wimfov-link': wimfovResultLink(wimfovResultId) }),
    { wimfovPage: wimfovPage() },
  )

  it.each([
    ['FOV Atlas, measured', atlasSubmission],
    ['FOV Atlas, typed', { ...atlasSubmission, ceiling: { source: 'model' }, cornerMask: 'unknown', provenance: { input: 'typed', linkData: null } } as const],
    ['TestHMD', testHmdSubmission],
    ['a VR Headset Picker link', vrhpFromLink],
    ['typed VR Headset Picker values', parsed(fieldsWith({ tool: 'vrhp', measure: typedEyes }))],
    ['pasted WIMFOV points', wimfovPasted],
    ['a WIMFOV link', wimfovLinked],
    ['a VR Headset Picker link without totals', parsed(fieldsWith({ tool: 'vrhp', measure: encodeVrhpPayload({ totals: null }) }))],
    ['a headset missing from the catalog', { ...atlasSubmission, headset: 'other', otherHeadsetName: 'Meta Boba 3 prototype' }],
  ])('keeps %s unchanged', (_description, submission: Submission) => {
    const body = renderIssueBody(issueFieldsOf(submission))
    expect(parseIssueBody(body, { wimfovPage: wimfovPage() })).toEqual({ ok: true, submission })
  })

  it('decodes a VR Headset Picker link into head-frame directions with its totals', () => {
    expect(vrhpFromLink.measures.left).toEqual({ 'left': 55, 'right': 42, 'up': 43, 'down': 53.9, 'down-left': 59 })
    expect(vrhpFromLink.measures.right['up-right']).toBe(52)
    expect(vrhpFromLink.ceiling.source).toBe('link')
    expect(vrhpFromLink.reportedHeadset).toBe('Bigscreen Beyond 2')
    expect(vrhpFromLink.provenance).toEqual({ input: 'link', linkData: encodeVrhpPayload() })
    expect(vrhpFromLink.cornerMask).toBe('unknown')
  })

  it('infers the corner mask from the link when the model figure is known', () => {
    const submission = parsed(fieldsWith({ tool: 'vrhp', measure: vrhpShareLink }), { maskedDiagonalOf: () => 114.3 })
    expect(submission.cornerMask).toBe('off-probably')
  })

  it('takes the model figure from the hmdgdb records by default', () => {
    const submission = parsed(fieldsWith({ tool: 'vrhp', headset: 'valve-index', measure: vrhpShareLink }))
    expect(submission.cornerMask).toBe('off-probably')
  })

  it('falls back to the model ceiling when the link has no totals', () => {
    const submission = parsed(fieldsWith({ tool: 'vrhp', measure: encodeVrhpPayload({ totals: null }) }), { maskedDiagonalOf: () => 114.3 })
    expect([submission.ceiling, submission.cornerMask]).toEqual([{ source: 'model' }, 'unknown'])
  })

  it('records how WIMFOV values arrived', () => {
    expect(wimfovPasted.provenance).toEqual({ input: 'paste', linkData: null })
    expect(wimfovLinked.provenance).toEqual({ input: 'link', linkData: wimfovResultId })
    expect(wimfovLinked.reportedHeadset).toBe('Beyond')
  })

  it('accepts a WIMFOV link together with the same pasted points', () => {
    const fields = fieldsWith({ tool: 'wimfov', measure: wimfovPoints, 'wimfov-link': wimfovResultLink(wimfovResultId) })
    expect(parsed(fields, { wimfovPage: wimfovPage() })).toEqual(wimfovLinked)
  })
})

describe('submissionFromFields', () => {
  const wimfovLink = wimfovResultLink(wimfovResultId)
  const atlasMeasure = (changes: Record<string, unknown>): string =>
    JSON.stringify({ ...(JSON.parse(atlasFields.measure) as object), ...changes })
  const ceiling = (value: unknown): string => atlasMeasure({ ceiling: value })
  const edges = { left: 55, right: 42, up: 44, down: 54 }

  it.each([
    ['tool-invalid', { tool: 'hmdq' }],
    ['headset-invalid', { headset: 'Beyond 2' }],
    ['headset-invalid', { headset: 'pimax-dream-air-max' }],
    ['headset-name-missing', { headset: 'other' }],
    ['headset-name-unexpected', { 'headset-name': 'Bigscreen Beyond 2' }],
    ['headset-name-too-long', { headset: 'other', 'headset-name': 'x'.repeat(81) }],
    ['eye-depth-invalid', { 'eye-depth': 'deep' }],
    ['nose-bridge-invalid', { 'nose-bridge': '' }],
    ['modded-invalid', { modded: 'true' }],
    ['tuned-invalid', { tuned: 'No' }],
    ['gaze-invalid', { gaze: 'around' }],
    ['ipd-invalid', { ipd: '63,5' }],
    ['ipd-invalid', { ipd: '63.25' }],
    ['ipd-out-of-range', { ipd: '90' }],
    ['measure-invalid', { measure: 'x'.repeat(4097) }],
    ['measure-missing', { measure: '' }],
    ['measure-missing', { tool: 'wimfov', measure: '' }],
    ['measure-missing', { tool: 'testhmd', measure: '' }],
    ['measure-invalid', { measure: '{not json' }],
    ['measure-invalid', { measure: '[1]' }],
    ['measure-invalid', { measure: atlasMeasure({ extra: 1 }) }],
    ['measure-invalid', { measure: atlasMeasure({ left: [1] }) }],
    ['measure-invalid', { measure: atlasMeasure({ left: null }) }],
    ['measure-invalid', { measure: atlasMeasure({ left: { forward: 3 } }) }],
    ['measure-invalid', { measure: atlasMeasure({ right: { up: '3' } }) }],
    ['measure-invalid', { measure: atlasMeasure({ cornerMask: 'maybe' }) }],
    ['measure-invalid', { measure: ceiling('measured') }],
    ['measure-invalid', { measure: ceiling([]) }],
    ['measure-invalid', { measure: ceiling({ left: edges, right: edges }) }],
    ['measure-invalid', { measure: ceiling({ left: edges, right: edges, canting: '0' }) }],
    ['measure-invalid', { measure: ceiling({ left: edges, right: [edges], canting: 0 }) }],
    ['measure-invalid', { measure: ceiling({ left: { ...edges, up: '44' }, right: edges, canting: 0 }) }],
    ['measure-invalid', { measure: ceiling({ left: { left: 55 }, right: edges, canting: 0 }) }],
    ['measure-invalid', { measure: ceiling({ left: edges, right: edges, canting: 0, extra: 1 }) }],
    ['measure-invalid', { tool: 'vrhp', measure: '{"left":' }],
    ['measure-invalid', { tool: 'vrhp', measure: JSON.stringify({ left: {}, right: {}, extra: {} }) }],
    ['measure-invalid', { tool: 'testhmd', measure: '{"horizontal":104}' }],
    ['measure-invalid', { tool: 'testhmd', measure: '104 x 95' }],
    ['testhmd-out-of-range', { tool: 'testhmd', measure: '{"horizontal":104,"vertical":361}' }],
    ['vrhp-too-short', { tool: 'vrhp', measure: 'AAAA' }],
    ['vrhp-angle-out-of-range', { tool: 'vrhp', measure: encodeVrhpPayload({ angles: [90, ...beyondAngles.slice(1)] }) }],
    ['wimfov-link-wrong-tool', { tool: 'vrhp', measure: vrhpShareLink, 'wimfov-link': wimfovLink }],
    ['wimfov-link-not-read-only', { tool: 'wimfov', 'wimfov-link': `${wimfovLink}&edit=1` }],
    ['wimfov-page-unavailable', { tool: 'wimfov', 'wimfov-link': wimfovLink }],
    ['wimfov-points-invalid', { tool: 'wimfov', measure: '1,2,3' }],
    ['angle-out-of-range', { measure: atlasMeasure({ left: { ...atlasSubmission.measures.left, up: 180.5 } }) }],
    ['angle-out-of-range', { tool: 'vrhp', measure: typedEyes.replace('59', '181') }],
    ['missing-direction', { tool: 'vrhp', measure: JSON.stringify({ left: {}, right: {} }) }],
    ['note-markup', { note: '<script>' }],
  ])('rejects %s', (error, changes: Partial<IssueFields>) => {
    expect(submissionFromFields(fieldsWith(changes))).toEqual({ ok: false, error })
  })

  it.each([
    ['wimfov-page-unrecognised', { 'wimfov-link': wimfovLink }, '<html></html>'],
    ['wimfov-page-id-mismatch', { 'wimfov-link': wimfovResultLink('0123abcd') }, wimfovPage()],
    ['wimfov-mismatch', { 'wimfov-link': wimfovLink, measure: wimfovPoints.replace('38,', '39,') }, wimfovPage()],
    ['wimfov-points-invalid', { 'wimfov-link': wimfovLink, measure: 'not points' }, wimfovPage()],
  ])('rejects a WIMFOV link with %s', (error, changes: Partial<IssueFields>, page) => {
    expect(submissionFromFields(fieldsWith({ tool: 'wimfov', measure: '', ...changes }), { wimfovPage: page })).toEqual({
      ok: false,
      error,
    })
  })

  it('passes body errors through parseIssueBody', () => {
    expect(parseIssueBody('nonsense')).toEqual({ ok: false, error: 'body-malformed' })
  })
})

describe('wimfovResultToFetch', () => {
  const body = (changes: Partial<IssueFields>): string => renderIssueBody(fieldsWith({ tool: 'wimfov', ...changes }))
  it.each([
    [wimfovResultId, body({ 'wimfov-link': wimfovResultLink(wimfovResultId) })],
    [null, body({ measure: wimfovPoints })],
    [null, body({ 'wimfov-link': 'https://andreasaronsson.com/!apps/wimfov/?edit=1' })],
    [null, renderIssueBody(fieldsWith({ 'wimfov-link': wimfovResultLink(wimfovResultId) }))],
    [null, 'nonsense'],
  ])('finds %s', (expected, markdown) => {
    expect(wimfovResultToFetch(markdown)).toBe(expected)
  })
})

describe('buildIssueUrl', () => {
  it('prefills every non-empty field of the form', () => {
    const result = buildIssueUrl(atlasSubmission)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url.startsWith(`${newIssueUrl}?template=submission.yml&title=`)).toBe(true)
    expect(result.url).toContain('tuning-details=Pimax%20Play%20wide%20mode')
    expect(result.url).not.toContain('wimfov-link=')
    const parameters = new URL(result.url).searchParams
    const prefilled = Object.fromEntries(issueFields.map(({ id }) => [id, parameters.get(id) ?? '']))
    expect(prefilled).toEqual(atlasFields)
  })

  it('titles a headset missing from the catalog by its typed name', () => {
    const result = buildIssueUrl({ ...atlasSubmission, headset: 'other', otherHeadsetName: 'Boba 3' })
    expect(result.ok && new URL(result.url).searchParams.get('title')).toBe('Measure: Boba 3 (atlas)')
  })

  it('refuses an invalid submission', () => {
    expect(buildIssueUrl({ ...atlasSubmission, ipd: 20 })).toEqual({ ok: false, error: 'ipd-out-of-range' })
  })

  it('refuses a link longer than GitHub accepts', () => {
    const wide = '€'.repeat(200)
    const submission = {
      ...atlasSubmission,
      tuning: { ...atlasSubmission.tuning, details: wide },
      facialInterface: wide,
      note: '€'.repeat(500),
    }
    expect(buildIssueUrl(submission)).toEqual({ ok: false, error: 'url-too-long' })
  })
})

describe('headsetChoiceOfVrhpLink', () => {
  const measureOf = (payload: string): VrhpMeasure => {
    const result = decodeVrhpLink(payload)
    if (!result.ok) throw new Error(result.error)
    return result.measure
  }
  it.each([
    ['the catalog model the link was made for', {}, { headset: 'bigscreen-beyond-2', otherHeadsetName: '' }],
    ['other with the link’s name for an unknown id', { name: 'Boba 3', id: 'meta-boba-3' }, { headset: 'other', otherHeadsetName: 'Boba 3' }],
    ['other with the link’s name for a typed-in headset', { name: 'Boba 3', id: null }, { headset: 'other', otherHeadsetName: 'Boba 3' }],
    ['nothing without a name or a known id', { name: null, id: null }, null],
    ['nothing when the name is too long for the form', { name: 'x'.repeat(81), id: null }, null],
  ])('picks %s', (_description, parts, expected) => {
    expect(headsetChoiceOfVrhpLink(measureOf(encodeVrhpPayload(parts)))).toEqual(expected)
  })
})
