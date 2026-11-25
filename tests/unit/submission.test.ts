import { describe, expect, it } from 'vitest'
import {
  toolNameOf,
  angleConventionOf,
  angleOriginOf,
  directions,
  ipdProblem,
  isEdgesShape,
  isEyeShape,
  maximumTotalDegrees,
  measuresBothEyesAtOnce,
  principalDirections,
  readsOwnEdges,
  showsRenderedAverage,
  submissionProblem,
  tools,
  type Submission,
  type Tool,
} from '../../src/lib/submission'
import type { RenderedTotals } from '../../src/lib/vrhpLink'
import { atlasSubmission, testHmdSubmission } from './fixtures'

const withAtlas = (changes: Partial<Submission>): Submission => ({ ...atlasSubmission, ...changes })
const atlasLeftWithoutUp = Object.fromEntries(
  Object.entries(atlasSubmission.measures.left).filter(([direction]) => direction !== 'up'),
)

const vrhpSubmission: Submission = {
  ...atlasSubmission,
  tool: 'vrhp',
  measures: {
    left: { 'left': 55, 'right': 42, 'up': 43, 'down': 53.9, 'down-left': 59 },
    right: { 'left': 41.5, 'right': 54.3, 'up': 44.2, 'down': 52.5, 'up-right': 52 },
  },
  ceiling: { source: 'none' },
  cornerMask: 'unknown',
  provenance: { input: 'typed', linkData: null },
}

const totals: RenderedTotals = {
  leftHorizontal: 97,
  leftVertical: 97,
  rightHorizontal: 97,
  rightVertical: 97,
  binocularHorizontal: 109,
  binocularHorizontalOverlap: 84,
  binocularVertical: 98,
  binocularVerticalOverlap: 95,
  binocularDiagonal: 122,
}
const vrhpLinked: Submission = {
  ...vrhpSubmission,
  ceiling: { source: 'link', totals },
  provenance: { input: 'link', linkData: 'BAeG' },
}
const withLeftUp = (submission: Submission, up: number): Submission => ({
  ...submission,
  measures: { ...submission.measures, left: { ...submission.measures.left, up } },
})
const otherSubmission = withAtlas({ headset: 'other', otherHeadsetName: 'Meta Boba 3 prototype' })

describe('directions', () => {
  it('lists sixteen directions with the eight principal ones every other place', () => {
    expect(directions).toHaveLength(16)
    expect(principalDirections).toEqual(['up', 'up-left', 'left', 'down-left', 'down', 'down-right', 'right', 'up-right'])
  })
})

describe('submissionProblem', () => {
  it.each([
    ['a measured FOV Atlas submission', atlasSubmission],
    ['a TestHMD submission', testHmdSubmission],
    ['a typed VR Headset Picker submission', vrhpSubmission],
    ['FOV Atlas with in-between directions', withAtlas({
      measures: { ...atlasSubmission.measures, left: { ...atlasSubmission.measures.left, 'up-up-left': 50 } },
    })],
    ['no IPD and empty free text', withAtlas({ ipd: null, note: '', facialInterface: '' })],
    ['a headset missing from the catalog, with its name', otherSubmission],
    ['a FOV Atlas angle straight behind the head', withLeftUp(atlasSubmission, 180)],
    ['a typed angle straight behind the head', withLeftUp(vrhpSubmission, 180)],
    ['a VR Headset Picker link angle just below 90°', withLeftUp(vrhpLinked, 89.99)],
    ['a measured ceiling beyond 90° from straight ahead', withAtlas({
      ceiling: { source: 'measured', left: { left: 115, right: 42, up: 44, down: 54 }, right: { left: 42, right: 115, up: 44, down: 54 }, canting: 30 },
    })],
  ])('accepts %s', (_description, submission) => {
    expect(submissionProblem(submission)).toBeNull()
  })

  const leftEye = (left: Record<string, number>): Partial<Submission> => ({
    measures: { ...atlasSubmission.measures, left },
  })
  it.each<[string, Submission]>([
    ['unknown-tool', withAtlas({ tool: 'other' as Tool })],
    ['headset-invalid', withAtlas({ headset: 'Bigscreen' })],
    ['headset-invalid', withAtlas({ headset: '-beyond' })],
    ['headset-invalid', withAtlas({ headset: 'beyond-' })],
    ['headset-invalid', withAtlas({ headset: 'beyond--2' })],
    ['headset-invalid', withAtlas({ headset: 'b'.repeat(49) })],
    ['headset-invalid', withAtlas({ headset: 'pimax-dream-air-max' })],
    ['headset-name-unexpected', withAtlas({ otherHeadsetName: 'Bigscreen Beyond 2' })],
    ['headset-name-missing', { ...otherSubmission, otherHeadsetName: '' }],
    ['headset-name-missing', { ...otherSubmission, otherHeadsetName: '   ' }],
    ['headset-name-too-long', { ...otherSubmission, otherHeadsetName: 'x'.repeat(81) }],
    ['headset-name-markup', { ...otherSubmission, otherHeadsetName: '<b>Boba</b>' }],
    ['headset-name-control-character', { ...otherSubmission, otherHeadsetName: 'Boba\n3' }],
    ['missing-direction', withAtlas(leftEye(atlasLeftWithoutUp))],
    ['unexpected-direction', withAtlas(leftEye({ ...atlasSubmission.measures.left, forward: 10 }))],
    ['unexpected-direction', { ...vrhpSubmission, measures: { ...vrhpSubmission.measures, right: { ...vrhpSubmission.measures.right, 'up-left': 50 } } }],
    ['angle-out-of-range', withLeftUp(atlasSubmission, 180.01)],
    ['angle-out-of-range', withLeftUp(vrhpSubmission, 180.01)],
    ['angle-out-of-range', withLeftUp(vrhpLinked, 90)],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: -1 }))],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: 42.125 }))],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: Number.NaN }))],
    ['testhmd-not-symmetric', { ...testHmdSubmission, measures: { ...testHmdSubmission.measures, right: { right: 52, up: 47.5, down: 47.5 } } }],
    ['testhmd-not-symmetric', { ...testHmdSubmission, measures: { left: { left: 52, up: 47, down: 48 }, right: { right: 52, up: 47, down: 48 } } }],
    ['ceiling-not-allowed', { ...testHmdSubmission, ceiling: atlasSubmission.ceiling }],
    ['ceiling-out-of-range', withAtlas({ ceiling: { ...atlasSubmission.ceiling, canting: 46 } as Submission['ceiling'] })],
    ['ceiling-out-of-range', withAtlas({ ceiling: { ...atlasSubmission.ceiling, canting: Number.NaN } as Submission['ceiling'] })],
    ['ceiling-out-of-range', withAtlas({
      ceiling: { source: 'measured', left: { left: 180.5, right: 42, up: 44, down: 54 }, right: { left: 42, right: 55, up: 44, down: 54 }, canting: 0 },
    })],
    // Up 95 with a turn of 10 would make the left eye's picture 44.6° high below zero.
    ['ceiling-out-of-range', withAtlas({
      ceiling: { source: 'measured', left: { left: 55, right: 42, up: 95, down: 40 }, right: { left: 42, right: 55, up: 44, down: 54 }, canting: 10 },
    })],
    ['ceiling-out-of-range', withAtlas({
      ceiling: { source: 'measured', left: { left: 55, right: 42, up: 44, down: 54 }, right: { left: 42, right: 55, up: 44, down: 90 }, canting: 0 },
    })],
    ['ceiling-out-of-range', withAtlas({
      ceiling: { source: 'measured', left: { left: 120, right: 42, up: 44, down: 54 }, right: { left: 42, right: 120, up: 44, down: 54 }, canting: 30 },
    })],
    ['ceiling-out-of-range', withAtlas({
      ceiling: { source: 'measured', left: { left: 55, right: 70, up: 44, down: 54 }, right: { left: 42, right: 55, up: 44, down: 54 }, canting: 25 },
    })],
    ['corner-mask-not-allowed', { ...testHmdSubmission, cornerMask: 'on' }],
    ['corner-mask-not-allowed', { ...vrhpLinked, cornerMask: 'on' }],
    ['input-not-allowed', { ...testHmdSubmission, provenance: { input: 'link', linkData: 'abc' } }],
    ['input-not-allowed', withAtlas({ provenance: { input: 'paste', linkData: null } })],
    ['reported-headset-invalid', withAtlas({ reportedHeadset: 'Beyond\n2' })],
    ['ipd-out-of-range', withAtlas({ ipd: 44.9 })],
    ['ipd-out-of-range', withAtlas({ ipd: 85.1 })],
    ['ipd-out-of-range', withAtlas({ ipd: 63.25 })],
    ['tuning-details-too-long', withAtlas({ tuning: { ...atlasSubmission.tuning, details: 'x'.repeat(201) } })],
    ['facial-interface-markup', withAtlas({ facialInterface: '<img>' })],
    ['facial-interface-control-character', withAtlas({ facialInterface: 'two\nlines' })],
    ['note-heading-line', withAtlas({ note: 'fine\n# heading' })],
    ['note-too-long', withAtlas({ note: 'x'.repeat(501) })],
  ])('reports %s', (error, submission) => {
    expect(submissionProblem(submission)).toBe(error)
  })
})

describe('angleConventionOf', () => {
  it.each([
    ['projected', 'vrhp', 'link'],
    ['radial', 'vrhp', 'typed'],
    ['radial', 'atlas', 'measured'],
    ['radial', 'wimfov', 'link'],
    ['radial', 'testhmd', 'typed'],
  ] as const)('is %s for %s values from %s input', (expected, tool, input) => {
    expect(angleConventionOf(tool, input)).toBe(expected)
  })
})

describe('toolNameOf', () => {
  it('names each tool', () => {
    expect(toolNameOf('vrhp')).toBe('VR Headset Picker')
    expect(toolNameOf('atlas')).toBe('FOV Atlas')
  })
})

describe('tool profiles', () => {
  it('starts VR Headset Picker angles from each picture, every other tool from the head', () => {
    expect(tools.filter((tool) => angleOriginOf(tool) === 'picture')).toEqual(['vrhp'])
  })
  it('shows the averaged rendered field of view for every tool following hmdq’s definition, never WIMFOV', () => {
    expect(tools.filter(showsRenderedAverage)).toEqual(['atlas', 'vrhp', 'testhmd'])
  })
  it('reads each eye’s edges only while measuring with FOV Atlas', () => {
    expect(tools.filter(readsOwnEdges)).toEqual(['atlas'])
  })
  it('measures both eyes at once only with TestHMD', () => {
    expect(tools.filter(measuresBothEyesAtOnce)).toEqual(['testhmd'])
  })
  it('treats an unknown tool as plainly as possible', () => {
    const unknown = 'nonsense' as Tool
    expect([angleOriginOf(unknown), showsRenderedAverage(unknown), readsOwnEdges(unknown), measuresBothEyesAtOnce(unknown)]).toEqual([
      'head',
      false,
      false,
      false,
    ])
  })
  it('lets a total span two radial angles', () => {
    expect(maximumTotalDegrees).toBe(360)
  })
})

describe('ipdProblem', () => {
  it.each([
    [null, ''],
    [null, '63'],
    [null, '63.5'],
    [null, '45'],
    [null, '85'],
    ['ipd-invalid', '63.55'],
    ['ipd-invalid', '6'],
    ['ipd-invalid', ' 63'],
    ['ipd-invalid', '63mm'],
    ['ipd-out-of-range', '44.9'],
    ['ipd-out-of-range', '85.1'],
  ] as const)('is %s for %j', (expected, text) => {
    expect(ipdProblem(text)).toBe(expected)
  })
})

describe('shape checks', () => {
  it('accepts an eye of known directions with finite angles', () => {
    expect(isEyeShape({ left: 50, 'up-up-left': 40.5 })).toBe(true)
    expect(isEyeShape({})).toBe(true)
  })
  it.each([
    ['an unknown direction', { sideways: 50 }],
    ['a text angle', { left: '50' }],
    ['an infinite angle', { left: Number.POSITIVE_INFINITY }],
    ['an array', [50]],
  ])('refuses an eye with %s', (_description, value) => {
    expect(isEyeShape(value)).toBe(false)
  })
  it('accepts exactly four finite edges', () => {
    expect(isEdgesShape({ left: 1, right: 2, up: 3, down: 4 })).toBe(true)
    expect(isEdgesShape({ left: 1, right: 2, up: 3 })).toBe(false)
    expect(isEdgesShape({ left: 1, right: 2, up: 3, down: Number.NaN })).toBe(false)
  })
})
