import { describe, expect, it } from 'vitest'
import { readyLayout, targetLayout, type AnswerMode, type Command } from '../../src/lib/answerTargets'
import { identity, type Quaternion } from '../../src/lib/headFrame'
import { noPressArrived, noPressSeconds, startFlow, stepFlow, type FlowState } from '../../src/lib/measureFlow'
import { measureSteps, progressCount, startMeasure } from '../../src/lib/measureSession'
import { readRenderedViews } from '../../src/lib/renderedViews'
import { headTurned, readingsOf, straightHeadset } from './xrFixtures'

function flowIn(mode: AnswerMode): FlowState {
  const read = readRenderedViews(readingsOf(straightHeadset))
  if (!read.ok) throw new Error(read.error)
  return startFlow(startMeasure(measureSteps('principal', read)), mode)
}

const frame = (state: FlowState, head: Quaternion = identity, commands: Command[] = [], keyPressed = false, deltaSeconds = 0.1): FlowState =>
  stepFlow(state, { head, deltaSeconds, commands, keyPressed })

function frames(state: FlowState, count: number, head: Quaternion = identity): FlowState {
  let current = state
  for (let frameIndex = 0; frameIndex < count; frameIndex += 1) current = frame(current, head)
  return current
}

const answers = (state: FlowState): number => state.progress.history.length

describe('getting ready with the head', () => {
  it('asks nothing until the head, having moved, holds still; then hangs Yes and No from there', () => {
    const lying = frames(flowIn('head'), 50)
    expect(lying.stage).toBe('ready')
    const facingLeft = headTurned(60, 5)
    const ready = frames(frame(lying, facingLeft), Math.round(readyLayout.steadySeconds * 10), facingLeft)
    expect(ready.stage).toBe('asking')
    expect(ready.targets.map((target) => target.action)).toEqual(['yes', 'no'])
    // Yes hangs below and to the left of where the head faced when ready.
    const onYes = headTurned(60 + targetLayout.sideways, -targetLayout.below)
    const answered = frames(ready, 10, onYes)
    expect(answers(answered)).toBe(1)
  })

  it('shows Back once there is an answer to undo, undoes one answer with it, and hides it again', () => {
    const ready = frames(frame(flowIn('head'), headTurned(5, 0)), Math.round(readyLayout.steadySeconds * 10) + 1)
    expect(ready.stage).toBe('asking')
    const onBack = headTurned(0, -targetLayout.backBelow)
    expect(answers(frames(ready, 15, onBack))).toBe(0)
    const answered = frames(frames(ready, 10, headTurned(-targetLayout.sideways, -targetLayout.below)), 1)
    expect(answers(answered)).toBe(1)
    expect(answered.targets.map((target) => target.action)).toEqual(['yes', 'no', 'back'])
    const undone = frames(answered, 10, onBack)
    expect(answers(undone)).toBe(0)
    expect(undone.targets.map((target) => target.action)).toEqual(['yes', 'no'])
    // Unchanged targets keep their identity, so the scene isn't rebuilt every frame.
    expect(frame(undone).targets).toBe(undone.targets)
  })

  it('takes no answer from looking at where a target would hang before it is ready', () => {
    const looking = frames(flowIn('head'), 5, headTurned(targetLayout.sideways, -targetLayout.below))
    expect(looking.stage).toBe('ready')
    expect(answers(looking)).toBe(0)
  })
})

describe('getting ready with a press', () => {
  it.each<AnswerMode>(['controller', 'keyboard'])('starts on a Yes press in %s mode, with no targets', (mode) => {
    const waiting = frame(flowIn(mode), identity, ['no', 'back'])
    expect(waiting.stage).toBe('ready')
    expect(waiting.pressArrived).toBe(true)
    const asking = frame(waiting, identity, ['yes'])
    expect(asking.stage).toBe('asking')
    expect(asking.targets).toEqual([])
    expect(answers(asking)).toBe(0)
  })

  it('ignores a Yes press made looking almost straight down', () => {
    expect(frame(flowIn('controller'), headTurned(0, -80), ['yes']).stage).toBe('ready')
  })

  it('answers each press in order, and goes back with back', () => {
    const asking = frame(flowIn('keyboard'), identity, ['yes'])
    const answered = frame(asking, identity, ['no', 'no', 'yes'])
    expect(answers(answered)).toBe(3)
    expect(answers(frame(answered, identity, ['back']))).toBe(2)
  })

  it('ignores the head in press modes', () => {
    const asking = frame(flowIn('controller'), identity, ['yes'])
    expect(answers(frames(asking, 30, headTurned(targetLayout.sideways, -targetLayout.below)))).toBe(0)
  })
})

describe('when no press arrives', () => {
  const silent = (mode: AnswerMode): FlowState => frames(flowIn(mode), noPressSeconds * 10 + 1)

  it('tells after a while, and offers head pointing below where the head faces', () => {
    expect(noPressArrived(frames(flowIn('keyboard'), noPressSeconds * 10 - 5))).toBe(false)
    const waited = silent('keyboard')
    expect(noPressArrived(waited)).toBe(true)
    expect(waited.targets.map((target) => target.action)).toEqual(['head-pointing'])
  })

  it('switches to the head when the offer is held, and asks at once with Yes and No', () => {
    const switched = frames(silent('controller'), 10, headTurned(0, -targetLayout.below))
    expect(switched.mode).toBe('head')
    expect(switched.stage).toBe('asking')
    expect(switched.targets.map((target) => target.action)).toEqual(['yes', 'no'])
    expect(noPressArrived(switched)).toBe(false)
    const answered = frames(frame(switched), 10, headTurned(targetLayout.sideways, -targetLayout.below))
    expect(answers(answered)).toBe(1)
  })

  it('withdraws the offer once any key arrives', () => {
    const heard = frame(silent('keyboard'), identity, [], true)
    expect(noPressArrived(heard)).toBe(false)
    expect(heard.targets).toEqual([])
    expect(frame(heard, identity, ['yes']).stage).toBe('asking')
  })

  it('waits for the head to face level before offering', () => {
    const lookingUp = frames(flowIn('keyboard'), noPressSeconds * 10 + 1, headTurned(0, 80))
    expect(noPressArrived(lookingUp)).toBe(true)
    expect(lookingUp.targets).toEqual([])
  })

  it('never tells in head mode', () => {
    expect(noPressArrived(frames(flowIn('head'), noPressSeconds * 10 + 1))).toBe(false)
  })
})

describe('the end of the measure', () => {
  it('takes no more answers once every edge is found, but still goes back', () => {
    let state = frame(flowIn('controller'), identity, ['yes'])
    for (let count = 0; count < 400 && progressCount(state.progress).done < 16; count += 1) state = frame(state, identity, ['yes'])
    expect(progressCount(state.progress).done).toBe(16)
    const finished = answers(state)
    expect(answers(frame(state, identity, ['yes']))).toBe(finished)
    expect(answers(frame(state, identity, ['back']))).toBe(finished - 1)
  })
})
