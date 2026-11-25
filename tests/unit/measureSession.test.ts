import { describe, expect, it } from 'vitest'
import {
  answerProbe,
  currentProbe,
  goBack,
  estimatedMinutes,
  isComplete,
  isFinished,
  measureSteps,
  measuresOf,
  minimumAngle,
  progressCount,
  startMeasure,
  type MeasureProgress,
} from '../../src/lib/measureSession'
import { readRenderedViews } from '../../src/lib/renderedViews'
import { directions, principalDirections, submissionProblem, type Direction } from '../../src/lib/submission'
import { atlasSubmission } from './fixtures'
import { readingsOf, straightHeadset, turnedHeadset, type HeadsetShape } from './xrFixtures'

function viewsOf(shape: HeadsetShape) {
  const read = readRenderedViews(readingsOf(shape))
  if (!read.ok) throw new Error(read.error)
  return read
}

/** What a wearer sees: everything up to a fixed share of what the headset draws. */
function answerAll(progress: MeasureProgress, share = 0.9): MeasureProgress {
  let current = progress
  for (let answer = 0; answer < 2000 && !isFinished(current); answer += 1) {
    const probe = currentProbe(current)
    const step = current.steps[current.stepIndex]
    if (probe === null || step === undefined) break
    current = answerProbe(current, probe.angle <= step.maximum * share)
  }
  return current
}

describe('measureSteps', () => {
  it('asks the eight principal directions of the left eye, then of the right eye', () => {
    const views = viewsOf(straightHeadset)
    const steps = measureSteps('principal', views)
    expect(steps).toHaveLength(16)
    expect(steps.slice(0, 8).every((step) => step.eye === 'left')).toBe(true)
    expect(steps.map((step) => step.direction).slice(0, 8)).toEqual(principalDirections)
    expect(steps.find((step) => step.eye === 'left' && step.direction === 'left')?.maximum).toBe(54.8)
    expect(steps.find((step) => step.eye === 'right' && step.direction === 'left')?.maximum).toBe(42)
  })

  it('asks all sixteen directions when chosen', () => {
    const steps = measureSteps('all', viewsOf(turnedHeadset))
    expect(steps).toHaveLength(32)
    expect(steps.slice(16).map((step) => step.direction)).toEqual(directions)
    expect(steps.find((step) => step.eye === 'left' && step.direction === 'left')?.maximum).toBe(60)
  })
})

describe('a whole measure', () => {
  it('finds every edge and gives measures a FOV Atlas submission accepts', () => {
    const views = viewsOf(turnedHeadset)
    const finished = answerAll(startMeasure(measureSteps('all', views)))
    expect(isFinished(finished)).toBe(true)
    expect(currentProbe(finished)).toBeNull()
    expect(progressCount(finished)).toEqual({ done: 32, total: 32 })
    const results = measuresOf(finished)
    if (results === null) throw new Error('unfinished')
    const { measures } = results
    expect(results.unsettled).toEqual([])
    expect(Object.keys(measures.left)).toHaveLength(16)
    expect(measures.left.left).toBeGreaterThan(60 * 0.9 - 0.5)
    expect(measures.left.left).toBeLessThanOrEqual(54)
    expect(
      submissionProblem({ ...atlasSubmission, measures, ceiling: views.ceiling, cornerMask: 'unknown' }),
    ).toBeNull()
  })

  it('shows the line in the left eye first, at angles inside what is drawn', () => {
    const progress = startMeasure(measureSteps('principal', viewsOf(straightHeadset)))
    expect(currentProbe(progress)).toEqual({ eye: 'left', direction: 'up', angle: 34 })
    expect(measuresOf(progress)).toBeNull()
  })

  it('goes back one answer at a time, even across a finished edge', () => {
    const start = startMeasure(measureSteps('principal', viewsOf(straightHeadset)))
    expect(goBack(start)).toBe(start)
    let progress = start
    while (progress.stepIndex === 0) progress = answerProbe(progress, true)
    expect(progress.results).toHaveLength(1)
    const back = goBack(progress)
    expect(back.stepIndex).toBe(0)
    expect(back.results).toHaveLength(0)
    expect(back.search?.phase).toBe('checking-limit')
    expect(goBack(answerProbe(start, false))).toEqual(start)
  })

  it('skips directions in which nothing is drawn past the minimum', () => {
    const steps = measureSteps('principal', viewsOf(straightHeadset)).map((step, stepIndex) =>
      stepIndex === 0 ? { ...step, maximum: minimumAngle / 2 } : step,
    )
    const progress = startMeasure(steps)
    expect(progress.stepIndex).toBe(1)
    expect(progress.results).toEqual([{ settled: true, edge: 0.5 }])
  })

  it('is finished at once with nothing to ask, and ignores answers then', () => {
    const progress = startMeasure([])
    expect(isFinished(progress)).toBe(true)
    expect(answerProbe(progress, true)).toBe(progress)
    expect(measuresOf(progress)).toEqual({ measures: { left: {}, right: {} }, unsettled: [] })
  })

  it('names each direction once per eye', () => {
    const measures = measuresOf(answerAll(startMeasure(measureSteps('principal', viewsOf(straightHeadset)))))
    const names = Object.keys(measures?.measures.right ?? {}) as Direction[]
    expect(names.sort()).toEqual([...principalDirections].sort())
  })
})

describe('edges that never settle', () => {
  /** Never sees the line in one step, whose window moves inward more often than the answers allow. */
  function blindIn(progress: MeasureProgress, unseen: number): MeasureProgress {
    let current = progress
    for (let answer = 0; answer < 3000 && !isFinished(current); answer += 1) {
      const probe = currentProbe(current)
      const step = current.steps[current.stepIndex]
      if (probe === null || step === undefined) break
      const seen = current.stepIndex !== unseen && probe.angle <= step.maximum * 0.9
      current = answerProbe(current, seen)
    }
    return current
  }

  it('leaves an in-between direction out and lists it, the measure still complete', () => {
    const drawn = measureSteps('all', viewsOf(straightHeadset))
    const unseen = drawn.findIndex((step) => step.direction === 'up-up-left')
    const steps = drawn.map((step, stepIndex) => (stepIndex === unseen ? { ...step, maximum: 179 } : step))
    const results = measuresOf(blindIn(startMeasure(steps), unseen))
    if (results === null) throw new Error('unfinished')
    expect(results.unsettled).toEqual([{ eye: 'left', direction: 'up-up-left' }])
    expect(results.measures.left['up-up-left']).toBeUndefined()
    expect(results.measures.left.up).toBeDefined()
    expect(isComplete(results)).toBe(true)
  })

  it('counts a measure missing a principal direction as incomplete', () => {
    expect(isComplete({ measures: { left: {}, right: {} }, unsettled: [{ eye: 'right', direction: 'down' }] })).toBe(false)
    expect(isComplete({ measures: { left: {}, right: {} }, unsettled: [{ eye: 'right', direction: 'down-down-left' }] })).toBe(true)
  })
})

describe('estimatedMinutes', () => {
  it('takes about five to six minutes for eight directions per eye, about eleven for sixteen', () => {
    expect(estimatedMinutes('principal', 3)).toBe(6)
    expect(estimatedMinutes('all', 3)).toBe(11)
    expect(estimatedMinutes('principal', 2.5)).toBe(5)
  })
})
