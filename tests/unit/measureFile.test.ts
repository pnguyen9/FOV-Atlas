import { describe, expect, it } from 'vitest'
import { issueFieldsOf, submissionFromFields } from '../../src/lib/issueForm'
import {
  encodeMeasureParameter,
  encodeMeasureText,
  maximumEncodedLength,
  maximumMeasureTextLength,
  measureFormat,
  measureLink,
  measureParameterOfLink,
  parseMeasureInput,
  parseMeasureParameter,
  parseMeasureText,
} from '../../src/lib/measureFile'
import type { Submission } from '../../src/lib/submission'
import { atlasSubmission, encodeVrhpPayload, testHmdSubmission } from './fixtures'

const vrhpParsed = submissionFromFields({ ...issueFieldsOf(atlasSubmission), tool: 'vrhp', measure: encodeVrhpPayload() })
if (!vrhpParsed.ok) throw new Error(vrhpParsed.error)
const vrhpSubmission = vrhpParsed.submission

const fileOf = (submission: unknown, changes: Record<string, unknown> = {}): string =>
  JSON.stringify({ format: measureFormat, version: 1, submission, ...changes })

/** The atlas submission with one top-level or nested change. */
const changed = (changes: Record<string, unknown>): Record<string, unknown> => ({ ...atlasSubmission, ...changes })

const base64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

describe('measure text', () => {
  it.each<[string, Submission]>([
    ['a FOV Atlas measure with its measured ceiling', atlasSubmission],
    ['a VR Headset Picker measure with the link totals', vrhpSubmission],
    ['a TestHMD measure', testHmdSubmission],
    ['a headset the catalog lacks', { ...testHmdSubmission, headset: 'other', otherHeadsetName: 'Boba 3' }],
  ])('round-trips %s', (_description, submission) => {
    const text = encodeMeasureText(submission)
    expect(text).toContain('"format": "fov-atlas-measure"')
    expect(parseMeasureText(text)).toEqual({ ok: true, submission })
  })

  it.each<[string, string, string]>([
    ['text far too long', ' '.repeat(maximumMeasureTextLength + 1), 'too-long'],
    ['text that is not JSON', '{"format":', 'not-json'],
    ['an array', '[]', 'not-a-measure'],
    ['another format', fileOf(atlasSubmission, { format: 'wimfov' }), 'not-a-measure'],
    ['a later version', fileOf(atlasSubmission, { version: 2 }), 'unsupported-version'],
    ['an extra top-level field', fileOf(atlasSubmission, { author: 'someone' }), 'shape-invalid'],
    ['a missing submission', JSON.stringify({ format: measureFormat, version: 1, other: 1 }), 'shape-invalid'],
    ['a submission that is not an object', fileOf('measure'), 'shape-invalid'],
    ['an extra submission field', fileOf(changed({ author: 'someone' })), 'shape-invalid'],
    ['a missing submission field', fileOf({ ...atlasSubmission, note: undefined }), 'shape-invalid'],
    ['an unknown tool', fileOf(changed({ tool: 'hmdq' })), 'shape-invalid'],
    ['a headset that is not text', fileOf(changed({ headset: 7 })), 'shape-invalid'],
    ['an unknown direction', fileOf(changed({ measures: { left: { sideways: 40 }, right: {} } })), 'shape-invalid'],
    ['an angle that is not a number', fileOf(changed({ measures: { left: { up: '40' }, right: {} } })), 'shape-invalid'],
    ['an eye that is not an object', fileOf(changed({ measures: { left: [], right: {} } })), 'shape-invalid'],
    ['a ceiling that is not an object', fileOf(changed({ ceiling: 'none' })), 'shape-invalid'],
    ['an unknown ceiling source', fileOf(changed({ ceiling: { source: 'guess' } })), 'shape-invalid'],
    ['a ceiling of none with extra fields', fileOf(changed({ ceiling: { source: 'none', totals: {} } })), 'shape-invalid'],
    [
      'measured edges missing one',
      fileOf(changed({ ceiling: { source: 'measured', left: { left: 1, right: 1, up: 1 }, right: { left: 1, right: 1, up: 1, down: 1 }, canting: 0 } })),
      'shape-invalid',
    ],
    ['link totals out of range', fileOf({ ...vrhpSubmission, ceiling: { source: 'link', totals: { ...totalsOf(vrhpSubmission), binocularDiagonal: 400 } } }), 'shape-invalid'],
    ['link totals missing one', fileOf({ ...vrhpSubmission, ceiling: { source: 'link', totals: { leftHorizontal: 90 } } }), 'shape-invalid'],
    ['an unknown corner mask state', fileOf(changed({ cornerMask: 'off' })), 'shape-invalid'],
    ['an unknown input kind', fileOf(changed({ provenance: { input: 'scanned', linkData: null } })), 'shape-invalid'],
    ['link data that is not text', fileOf(changed({ provenance: { input: 'measured', linkData: 5 } })), 'shape-invalid'],
    ['an unknown face answer', fileOf(changed({ face: { eyeDepth: 'deep', noseBridge: 'low' } })), 'shape-invalid'],
    ['a tuning flag that is not a boolean', fileOf(changed({ tuning: { physicallyModded: 'no', driverTuned: true, details: '' } })), 'shape-invalid'],
    ['an unknown gaze', fileOf(changed({ gaze: 'wandering' })), 'shape-invalid'],
    ['an IPD that is not a number', fileOf(changed({ ipd: '63' })), 'shape-invalid'],
    ['an angle past straight behind', fileOf(changed({ measures: { ...atlasSubmission.measures, left: { ...atlasSubmission.measures.left, up: 200 } } })), 'angle-out-of-range'],
    ['an IPD out of range', fileOf(changed({ ipd: 20 })), 'ipd-out-of-range'],
    ['a headset missing from the catalog', fileOf(changed({ headset: 'boba-3' })), 'headset-invalid'],
    ['markup in the note', fileOf(changed({ note: '<script>' })), 'note-markup'],
  ])('refuses %s', (_description, text, error) => {
    expect(parseMeasureText(text)).toEqual({ ok: false, error })
  })
})

function totalsOf(submission: Submission): Record<string, number> {
  if (submission.ceiling.source !== 'link') throw new Error('No link totals')
  return { ...submission.ceiling.totals }
}

describe('measure links', () => {
  it('carries the measure in the fragment of the Compare page', () => {
    const link = measureLink(atlasSubmission, 'https://pnguyen9.github.io/FOV-Atlas/#submit')
    expect(link.startsWith('https://pnguyen9.github.io/FOV-Atlas/#compare?measure=')).toBe(true)
    expect(link.split('#')).toHaveLength(2)
    expect(parseMeasureInput(link)).toEqual({ ok: true, submission: atlasSubmission })
  })

  it('round-trips text outside ASCII', () => {
    const submission = { ...testHmdSubmission, note: 'Coussin d’origine, réglé à 3 mm' }
    expect(parseMeasureParameter(encodeMeasureParameter(submission))).toEqual({ ok: true, submission })
  })

  it.each<[string, string, string]>([
    ['a value far too long', 'a'.repeat(maximumEncodedLength + 1), 'too-long'],
    ['characters outside base64url', 'abc+def', 'not-base64url'],
    ['bytes that are not UTF-8', base64Url('') + '_w', 'not-base64url'],
    ['a value that holds no JSON', base64Url('hello'), 'not-json'],
    ['a value that holds another format', base64Url('{"format":"x"}'), 'not-a-measure'],
  ])('refuses %s', (_description, value, error) => {
    expect(parseMeasureParameter(value)).toEqual({ ok: false, error })
  })
})

describe('measureParameterOfLink', () => {
  it.each<[string, string | null]>([
    ['https://example.com/FOV-Atlas/#compare?measure=abc', 'abc'],
    ['#compare?measure=abc', 'abc'],
    ['compare?measure=abc', 'abc'],
    ['https://example.com/FOV-Atlas/#compare', null],
    ['https://example.com/FOV-Atlas/#submit?measure=abc', null],
    ['#compare?measure=abc&other=1', null],
    ['#compare?other=abc', null],
    [`#compare?measure=${'a'.repeat(maximumEncodedLength + 3000)}`, null],
  ])('reads %s', (link, expected) => {
    expect(measureParameterOfLink(link)).toBe(expected)
  })
})

describe('parseMeasureInput', () => {
  it('reads pasted or opened text', () => {
    expect(parseMeasureInput(`\n${encodeMeasureText(atlasSubmission)}`)).toEqual({ ok: true, submission: atlasSubmission })
  })

  it('refuses input that is neither', () => {
    expect(parseMeasureInput('https://example.com/')).toEqual({ ok: false, error: 'no-measure-in-link' })
  })
})
