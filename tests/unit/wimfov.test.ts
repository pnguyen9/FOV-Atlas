import { describe, expect, it } from 'vitest'
import {
  formatWimfovPoints,
  maximumPageLength,
  parseWimfovLink,
  parseWimfovPage,
  parseWimfovPoints,
  wimfovResultLink,
} from '../../src/lib/wimfov'
import { wimfovLeftRaw, wimfovPage, wimfovPoints, wimfovResultId } from './fixtures'

const expectedLeft = {
  'up': 38, 'up-up-left': 41, 'up-left': 44, 'left-up-left': 47, 'left': 50, 'left-down-left': 51,
  'down-left': 51, 'down-down-left': 51, 'down': 50, 'down-down-right': 48, 'down-right': 46,
  'right-down-right': 43, 'right': 40, 'right-up-right': 38, 'up-right': 36, 'up-up-right': 37,
}

describe('parseWimfovPoints', () => {
  it('maps the raw order onto the radial directions, keeping the values as given', () => {
    const result = parseWimfovPoints(wimfovPoints)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.measures.left).toEqual(expectedLeft)
    expect(result.measures.right.up).toBe(39)
    expect(result.measures.right['up-up-right']).toBe(40)
  })

  it.each([
    ['the points fragment of the page', `  "points":"${wimfovPoints}",  `],
    ['the whole JSON object', `{"created":"2024-05-26","points":"${wimfovPoints}","model":"Beyond"}`],
  ])('accepts %s', (_description, input) => {
    expect(parseWimfovPoints(input)).toEqual(parseWimfovPoints(wimfovPoints))
  })

  it('accepts decimals', () => {
    const decimals = wimfovPoints.replace('38,', '38.25,')
    const result = parseWimfovPoints(decimals)
    expect(result.ok && result.measures.left.up).toBe(38.25)
  })

  it('accepts angles beyond 90°, up to straight behind', () => {
    const wide = parseWimfovPoints(wimfovPoints.replace('38,', '95.5,').replace('50,', '180,'))
    expect(wide.ok && [wide.measures.left.up, wide.measures.left.left]).toEqual([95.5, 180])
  })

  it('formats measures back into the same text', () => {
    const result = parseWimfovPoints(wimfovPoints)
    expect(result.ok && formatWimfovPoints(result.measures)).toBe(wimfovPoints)
  })

  const fifteen = wimfovLeftRaw.slice(1).join(',')
  it.each([
    ['wimfov-points-invalid', 'x'.repeat(4097)],
    ['wimfov-points-invalid', wimfovLeftRaw.join(',')],
    ['wimfov-points-invalid', `${fifteen}|${fifteen}`],
    ['wimfov-points-invalid', `${wimfovPoints}|${wimfovLeftRaw.join(',')}`],
    ['wimfov-points-invalid', wimfovPoints.replace('38,', '-38,')],
    ['wimfov-points-invalid', wimfovPoints.replace('38,', '38.123,')],
    ['wimfov-points-invalid', wimfovPoints.replace('38,', '1038,')],
    ['wimfov-points-invalid', wimfovPoints.replace('38,', '38 ,')],
    ['wimfov-points-invalid', '{"points": 5}'],
    ['wimfov-points-invalid', '{"points": "1,2"'],
    ['wimfov-points-invalid', '{}'],
    ['wimfov-points-invalid', '{"other":"x"}'],
    ['wimfov-angle-out-of-range', wimfovPoints.replace('38,', '180.01,')],
  ])('rejects input with %s', (error, input) => {
    expect(parseWimfovPoints(input)).toEqual({ ok: false, error })
  })

  it.each([['[1,2]'], ['null']])('rejects the JSON value %s', (input) => {
    expect(parseWimfovPoints(input)).toEqual({ ok: false, error: 'wimfov-points-invalid' })
  })
})

describe('parseWimfovLink', () => {
  it('accepts the read-only link, trimmed', () => {
    expect(parseWimfovLink(`  ${wimfovResultLink('f745bc0')}\n`)).toEqual({ ok: true, resultId: 'f745bc0' })
  })

  it.each([
    ['an edit link', 'https://andreasaronsson.com/!apps/wimfov/?id=3f2a9c1e-77b0-4c1d-9e1a-55aa0b1c2d3e-9f8e7d'],
    ['an edit parameter', `${wimfovResultLink(wimfovResultId)}&edit=1a2b3c`],
    ['another parameter name', 'https://andreasaronsson.com/!apps/wimfov/?edit=b09b0749'],
    ['an uppercase id', 'https://andreasaronsson.com/!apps/wimfov/?id=B09B0749'],
    ['a too short id', 'https://andreasaronsson.com/!apps/wimfov/?id=b09b0'],
    ['a fragment', `${wimfovResultLink(wimfovResultId)}#edit`],
    ['plain http', `http://andreasaronsson.com/!apps/wimfov/?id=${wimfovResultId}`],
    ['another host', `https://andreasaronsson.com.example/!apps/wimfov/?id=${wimfovResultId}`],
    ['credentials', `https://user:pass@andreasaronsson.com/!apps/wimfov/?id=${wimfovResultId}`],
    ['another path', `https://andreasaronsson.com/!apps/wimfov/edit/?id=${wimfovResultId}`],
    ['no parameters', 'https://andreasaronsson.com/!apps/wimfov/'],
    ['an encoded id', 'https://andreasaronsson.com/!apps/wimfov/?id=b09b%300749'],
    ['an empty id', 'https://andreasaronsson.com/!apps/wimfov/?id'],
    ['text that is not a link', 'not a link'],
    ['a very long link', `${wimfovResultLink(wimfovResultId)}${'0'.repeat(200)}`],
  ])('rejects %s', (_description, input) => {
    expect(parseWimfovLink(input)).toEqual({ ok: false, error: 'wimfov-link-not-read-only' })
  })
})

describe('parseWimfovPage', () => {
  it('reads the embedded result', () => {
    const result = parseWimfovPage(wimfovPage(), wimfovResultId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model).toBe('Beyond')
    expect(result.measures.left).toEqual(expectedLeft)
  })

  it('reads a result without a model as an empty model', () => {
    const result = parseWimfovPage(wimfovPage(`{"points":"${wimfovPoints}","sid":"${wimfovResultId}"}`), wimfovResultId)
    expect(result.ok && result.model).toBe('')
  })

  const data = (fields: string): string => wimfovPage(`{${fields}}`)
  const points = `"points":"${wimfovPoints}"`
  const sid = `"sid":"${wimfovResultId}"`
  it.each([
    ['wimfov-page-too-large', `${wimfovPage()}${' '.repeat(maximumPageLength)}`],
    ['wimfov-page-unrecognised', '<html>No entry exists for this ID.</html>'],
    ['wimfov-page-unrecognised', `${wimfovPage()}${wimfovPage()}`],
    ['wimfov-page-unrecognised', "<script>JSON.parse('{\"sid\":1}"],
    ['wimfov-page-unrecognised', data(`${points},${sid},"note":"it\\'s"`)],
    ['wimfov-page-unrecognised', wimfovPage('')],
    ['wimfov-page-unrecognised', wimfovPage('{not json')],
    ['wimfov-page-unrecognised', wimfovPage('[1,2]')],
    ['wimfov-page-unrecognised', data(sid)],
    ['wimfov-page-unrecognised', data(`${points},${sid},"model":5`)],
    ['wimfov-page-unrecognised', data(`${points},${sid},"model":"<b>Beyond</b>"`)],
    ['wimfov-page-id-mismatch', data(`${points},"sid":"0000000"`)],
    ['wimfov-page-id-mismatch', data(points)],
    ['wimfov-points-invalid', data(`"points":"1,2|3,4",${sid}`)],
  ])('rejects a page with %s', (error, html) => {
    expect(parseWimfovPage(html, wimfovResultId)).toEqual({ ok: false, error })
  })
})
