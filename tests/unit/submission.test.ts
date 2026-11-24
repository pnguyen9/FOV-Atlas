import { describe, expect, it } from 'vitest'
import {
  cornerMaskFromLinkTotals,
  directions,
  principalDirections,
  submissionProblem,
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
  ceiling: { source: 'model' },
  cornerMask: 'unknown',
  provenance: { input: 'typed', linkData: null },
}

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
    ['missing-direction', withAtlas(leftEye(atlasLeftWithoutUp))],
    ['unexpected-direction', withAtlas(leftEye({ ...atlasSubmission.measures.left, forward: 10 }))],
    ['unexpected-direction', { ...vrhpSubmission, measures: { ...vrhpSubmission.measures, right: { ...vrhpSubmission.measures.right, 'up-left': 50 } } }],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: 90.5 }))],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: -1 }))],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: 42.125 }))],
    ['angle-out-of-range', withAtlas(leftEye({ ...atlasSubmission.measures.left, up: Number.NaN }))],
    ['testhmd-not-symmetric', { ...testHmdSubmission, measures: { ...testHmdSubmission.measures, right: { right: 52, up: 47.5, down: 47.5 } } }],
    ['testhmd-not-symmetric', { ...testHmdSubmission, measures: { left: { left: 52, up: 47, down: 48 }, right: { right: 52, up: 47, down: 48 } } }],
    ['ceiling-not-allowed', { ...testHmdSubmission, ceiling: atlasSubmission.ceiling }],
    ['ceiling-out-of-range', withAtlas({ ceiling: { ...atlasSubmission.ceiling, canting: 46 } as Submission['ceiling'] })],
    ['ceiling-out-of-range', withAtlas({ ceiling: { ...atlasSubmission.ceiling, canting: Number.NaN } as Submission['ceiling'] })],
    ['ceiling-out-of-range', withAtlas({
      ceiling: { source: 'measured', left: { left: 91, right: 42, up: 44, down: 54 }, right: { left: 42, right: 55, up: 44, down: 54 }, canting: 0 },
    })],
    ['corner-mask-not-allowed', { ...testHmdSubmission, cornerMask: 'on' }],
    ['corner-mask-not-allowed', withAtlas({ cornerMask: 'off-probably' })],
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

describe('cornerMaskFromLinkTotals', () => {
  const totals = (binocularDiagonal: number): RenderedTotals => ({
    leftHorizontal: 97,
    leftVertical: 97,
    rightHorizontal: 97,
    rightVertical: 97,
    binocularHorizontal: 109,
    binocularHorizontalOverlap: 84,
    binocularVertical: 98,
    binocularVerticalOverlap: 95,
    binocularDiagonal,
  })

  it.each([
    ['unknown', 'without a model figure', 130, undefined],
    ['unknown', 'within the margin of the masked figure', 117.3, 114.3],
    ['off-probably', 'clearly above the masked figure', 120.17, 114.3],
  ])('is %s %s', (expected, _description, diagonal, masked) => {
    expect(cornerMaskFromLinkTotals(totals(diagonal), masked)).toBe(expected)
  })
})
