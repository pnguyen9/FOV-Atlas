import { describe, expect, it } from 'vitest'
import {
  answerTargets,
  ButtonPresses,
  facesLevel,
  headPointingTarget,
  isSteady,
  keyCommand,
  notReady,
  pointedAction,
  readyFill,
  readyLayout,
  restingHold,
  ringFill,
  targetLayout,
  updateHold,
  updateReady,
  type Command,
  type ControllerLike,
  type HoldState,
  type ReadyState,
} from '../../src/lib/answerTargets'
import { identity } from '../../src/lib/headFrame'
import { headTurned } from './xrFixtures'

describe('answerTargets', () => {
  it('hangs Yes to the left and No to the right, below where the wearer faced', () => {
    const targets = answerTargets(identity)
    const yes = targets.find((target) => target.action === 'yes')
    const no = targets.find((target) => target.action === 'no')
    expect(yes?.direction.right).toBeLessThan(0)
    expect(no?.direction.right).toBeGreaterThan(0)
    expect(yes?.direction.up).toBeLessThan(0)
  })

  it('hangs a smaller Back target further down between them, apart from both', () => {
    const targets = answerTargets(identity)
    const back = targets.find((target) => target.action === 'back')
    expect(back?.radius).toBeLessThan(targetLayout.radius)
    expect(pointedAction(headTurned(0, -targetLayout.backBelow), targets)).toBe('back')
    expect(pointedAction(headTurned(0, -targetLayout.backBelow + targetLayout.backRadius + 1), targets)).toBeNull()
    expect(pointedAction(headTurned(targetLayout.sideways, -targetLayout.below), targets)).toBe('yes')
  })

  it('follows where the wearer faced when ready, not how the head was tilted', () => {
    const targets = answerTargets(headTurned(90, 30))
    expect(pointedAction(headTurned(90 + targetLayout.sideways, -targetLayout.below), targets)).toBe('yes')
    expect(pointedAction(headTurned(90 - targetLayout.sideways, -targetLayout.below), targets)).toBe('no')
  })

  it('offers head pointing straight below where the wearer faces, away from both answers', () => {
    const offer = headPointingTarget(headTurned(40, 10))
    expect(pointedAction(headTurned(40, -targetLayout.below), [offer])).toBe('head-pointing')
    expect(pointedAction(headTurned(40, -targetLayout.below), answerTargets(headTurned(40, 10)))).toBeNull()
  })
})

describe('pointedAction', () => {
  const targets = answerTargets(identity)
  it('finds the target the head points at, within its ring', () => {
    expect(pointedAction(headTurned(targetLayout.sideways, -targetLayout.below), targets)).toBe('yes')
    expect(pointedAction(headTurned(targetLayout.sideways + 4, -targetLayout.below + 2), targets)).toBe('yes')
    expect(pointedAction(headTurned(-targetLayout.sideways, -targetLayout.below), targets)).toBe('no')
  })

  it('finds nothing while the head looks ahead or elsewhere', () => {
    expect(pointedAction(identity, targets)).toBeNull()
    expect(pointedAction(headTurned(0, -targetLayout.below), targets)).toBeNull()
    expect(pointedAction(headTurned(targetLayout.sideways + 9, -targetLayout.below), targets)).toBeNull()
    expect(pointedAction(identity, [])).toBeNull()
  })
})

describe('updateHold', () => {
  it('answers once the head has stayed on a target long enough', () => {
    let hold: HoldState = restingHold
    let chosen = null
    for (let frame = 0; frame < 9; frame += 1) ({ hold, chosen } = updateHold(hold, 'yes', 0.1))
    expect(chosen).toBeNull()
    expect(ringFill(hold, 'yes')).toBeCloseTo(0.9, 9)
    expect(ringFill(hold, 'no')).toBe(0)
    ;({ hold, chosen } = updateHold(hold, 'yes', 0.1))
    expect(chosen).toBe('yes')
    expect(hold.armed).toBe(false)
  })

  it('starts over when the head moves to the other target or away', () => {
    const half = updateHold(restingHold, 'yes', 0.6).hold
    expect(updateHold(half, 'no', 0.5)).toEqual({ hold: { armed: true, action: 'no', heldSeconds: 0.5 }, chosen: null })
    expect(updateHold(half, null, 0.5)).toEqual({ hold: restingHold, chosen: null })
  })

  it('answers only once until the head leaves the targets', () => {
    const answered = updateHold(restingHold, 'no', 2)
    expect(answered.chosen).toBe('no')
    const still = updateHold(answered.hold, 'no', 2)
    expect(still.chosen).toBeNull()
    const away = updateHold(still.hold, null, 0.1)
    expect(away.hold.armed).toBe(true)
  })

  it('never counts time going backward', () => {
    expect(updateHold(restingHold, 'yes', -5).hold.heldSeconds).toBe(0)
    expect(ringFill({ armed: true, action: 'yes', heldSeconds: 5 }, 'yes')).toBe(1)
  })
})

describe('updateReady', () => {
  /** The ready state after holding `head` for `seconds`, in frames of a tenth of a second. */
  function held(state: ReadyState, head: ReturnType<typeof headTurned>, seconds: number): ReadyState {
    let current = state
    for (let frame = 0; frame < Math.round(seconds * 10); frame += 1) current = updateReady(current, head, 0.1)
    return current
  }

  it('never gets ready while the head has not moved, as a headset lying on a desk', () => {
    const still = held(notReady, identity, 10)
    expect(still.moved).toBe(false)
    expect(isSteady(still)).toBe(false)
    expect(readyFill(still)).toBe(0)
  })

  it('gets ready once the head, having moved, holds still long enough', () => {
    const moved = updateReady(updateReady(notReady, identity, 0), headTurned(readyLayout.wornDegrees + 1, 0), 0.1)
    expect(moved.moved).toBe(true)
    const almost = held(moved, headTurned(readyLayout.wornDegrees + 1, 0), 1.4)
    expect(isSteady(almost)).toBe(false)
    expect(readyFill(almost)).toBeGreaterThan(0.8)
    expect(isSteady(updateReady(almost, headTurned(readyLayout.wornDegrees + 1, 0), 0.1))).toBe(true)
  })

  it('starts the stillness over when the head drifts too far, but not for a small tremble', () => {
    const moved = updateReady(updateReady(notReady, identity, 0), headTurned(10, 0), 0.1)
    const settled = held(moved, headTurned(10, 0), 1)
    expect(updateReady(settled, headTurned(10 + readyLayout.steadyDegrees / 2, 0), 0.1).steadySeconds).toBeGreaterThan(1)
    expect(updateReady(settled, headTurned(10 + readyLayout.steadyDegrees * 2, 0), 0.1).steadySeconds).toBe(0)
  })

  it('never gets ready looking almost straight up or down', () => {
    const moved = updateReady(updateReady(notReady, identity, 0), headTurned(0, 80), 0.1)
    expect(isSteady(held(moved, headTurned(0, 80), 5))).toBe(false)
    expect(facesLevel(headTurned(0, -80))).toBe(false)
    expect(facesLevel(headTurned(170, readyLayout.maximumPitch - 1))).toBe(true)
  })
})

describe('ButtonPresses', () => {
  const controller = (hand: string, ...buttons: number[]): ControllerLike => ({
    handedness: hand,
    gamepad: { buttons: Array.from({ length: 6 }, (_, button) => ({ pressed: buttons.includes(button) })) },
  })
  const read = (presses: ButtonPresses, controllers: ControllerLike[]): Command[] => {
    const commands: Command[] = []
    presses.read(controllers, commands)
    return commands
  }

  it.each<[string, number, Command]>([
    ['trigger', 0, 'yes'],
    ['A or X', 4, 'yes'],
    ['B or Y', 5, 'no'],
    ['grip', 1, 'back'],
  ])('reads the %s', (_, button, command) => {
    expect(read(new ButtonPresses(), [controller('right', button)])).toEqual([command])
  })

  it('counts each press once, however fast presses follow, per controller', () => {
    const presses = new ButtonPresses()
    expect(read(presses, [controller('right', 0)])).toEqual(['yes'])
    expect(read(presses, [controller('right', 0)])).toEqual([])
    expect(read(presses, [controller('right', 0), controller('left', 0)])).toEqual(['yes'])
    expect(read(presses, [controller('right'), controller('left')])).toEqual([])
    expect(read(presses, [controller('right', 0)])).toEqual(['yes'])
  })

  it('counts a press again after its controller went away', () => {
    const presses = new ButtonPresses()
    read(presses, [controller('right', 5)])
    expect(read(presses, [])).toEqual([])
    expect(read(presses, [controller('right', 5)])).toEqual(['no'])
  })

  it('ignores the thumbstick, other buttons and controllers without buttons', () => {
    expect(read(new ButtonPresses(), [controller('right', 2, 3)])).toEqual([])
    expect(read(new ButtonPresses(), [{ handedness: 'none', gamepad: null }, { handedness: 'left' }])).toEqual([])
  })
})

describe('keyCommand', () => {
  it('reads Enter as Yes, Space as No and Backspace as back, and nothing else', () => {
    expect(keyCommand('Enter')).toBe('yes')
    expect(keyCommand(' ')).toBe('no')
    expect(keyCommand('Backspace')).toBe('back')
    expect(keyCommand('a')).toBeNull()
  })
})
