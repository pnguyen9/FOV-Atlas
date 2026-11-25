/**
 * How the wearer answers in the headset, in the way chosen before starting:
 *
 * - head: a Yes and a No target hang in the room, below where the wearer faced when ready, and
 *   the wearer turns their head toward one and holds it there until its ring fills. A smaller
 *   Back target, further down between them, undoes the last answer once there is one. WebXR reports
 *   where the head points, not where the eyes look, so the head's straight-ahead direction does
 *   the pointing. After each answer the targets wait until the head has left them, so holding
 *   still never answers twice.
 * - controller: Trigger, A or X answers Yes, B or Y answers No, Grip goes back one answer.
 * - keyboard: Enter answers Yes, Space No, Backspace goes back one answer.
 *
 * Each button or key press answers once. Before the first question the wearer shows they are
 * ready: with the head, by looking around and then holding still on the centre dot; otherwise
 * with a Yes press. A headset lying on a desk does neither.
 */

import { angleBetween, pitchOf, rotate, straightAhead, yawOf, yawPitchDirection, type Quaternion, type Vector3 } from './headFrame.ts'

export const answerModes = ['head', 'controller', 'keyboard'] as const
export type AnswerMode = (typeof answerModes)[number]

export type Choice = 'yes' | 'no'
export type Command = Choice | 'back'
/** What a target selects: an answer, going back one answer, or switching to answering with the head. */
export type TargetAction = Command | 'head-pointing'

export interface AnswerTarget {
  readonly action: TargetAction
  /** Where the target hangs, in the room's frame. */
  readonly direction: Vector3
  /** How close to its centre the head has to point, in degrees; its ring is drawn there. */
  readonly radius: number
}

export const targetLayout = {
  /** Sideways from where the wearer faced, Yes to the left and No to the right. */
  sideways: 14,
  /** Below where the wearer faced. */
  below: 20,
  /** How close to a target's centre the head has to point. */
  radius: 6,
  /** Below where the wearer faced, for the Back target: well apart from Yes and No. */
  backBelow: 33,
  /** The Back target is smaller, so it reads as the lesser choice. */
  backRadius: 4,
  /** How long the head has to stay on a target. */
  holdSeconds: 1,
} as const

/** The Yes, No and Back targets, placed from the head's rotation when ready; only its turn to the side counts. */
export function answerTargets(readyHead: Quaternion): AnswerTarget[] {
  const facing = yawOf(readyHead)
  return [
    { action: 'yes', direction: yawPitchDirection(facing + targetLayout.sideways, -targetLayout.below), radius: targetLayout.radius },
    { action: 'no', direction: yawPitchDirection(facing - targetLayout.sideways, -targetLayout.below), radius: targetLayout.radius },
    { action: 'back', direction: yawPitchDirection(facing, -targetLayout.backBelow), radius: targetLayout.backRadius },
  ]
}

/** The target offering head pointing, straight below where the wearer faces, between where Yes and No will hang. */
export function headPointingTarget(head: Quaternion): AnswerTarget {
  return { action: 'head-pointing', direction: yawPitchDirection(yawOf(head), -targetLayout.below), radius: targetLayout.radius }
}

/** The target the head points at, if any. */
export function pointedAction(head: Quaternion, targets: readonly AnswerTarget[]): TargetAction | null {
  const pointing = rotate(head, straightAhead)
  return targets.find((target) => angleBetween(pointing, target.direction) <= target.radius)?.action ?? null
}

export interface HoldState {
  /** False right after a selection, until the head leaves every target. */
  readonly armed: boolean
  readonly action: TargetAction | null
  readonly heldSeconds: number
}

export const restingHold: HoldState = { armed: true, action: null, heldSeconds: 0 }

interface HoldUpdate {
  readonly hold: HoldState
  readonly chosen: TargetAction | null
}

/** The hold after `deltaSeconds` with the head on `pointed`. */
export function updateHold(hold: HoldState, pointed: TargetAction | null, deltaSeconds: number): HoldUpdate {
  if (pointed === null) return { hold: restingHold, chosen: null }
  if (!hold.armed) return { hold, chosen: null }
  const heldSeconds = (hold.action === pointed ? hold.heldSeconds : 0) + Math.max(0, deltaSeconds)
  // Frame times add up with rounding errors; a hold a hair short of the full time is full.
  if (heldSeconds >= targetLayout.holdSeconds - 1e-9) return { hold: { armed: false, action: null, heldSeconds: 0 }, chosen: pointed }
  return { hold: { armed: true, action: pointed, heldSeconds }, chosen: null }
}

/** How full a target's ring is, from 0 to 1. */
export const ringFill = (hold: HoldState, action: TargetAction): number =>
  hold.action === action ? Math.min(1, hold.heldSeconds / targetLayout.holdSeconds) : 0

export const readyLayout = {
  /** How long the head has to stay still on the dot. */
  steadySeconds: 1.5,
  /** How far the head may drift and still count as still. */
  steadyDegrees: 2,
  /** How far the head has to move before holding still counts, so a headset lying on a desk never starts. */
  wornDegrees: 3,
  /** Looking further up or down than this leaves no clear way the wearer faces, to place the targets by. */
  maximumPitch: 45,
} as const

/** Whether the head faces level enough to place the targets from. */
export const facesLevel = (head: Quaternion): boolean => Math.abs(pitchOf(head)) <= readyLayout.maximumPitch

export interface ReadyState {
  /** Where the head pointed on the first frame. */
  readonly first: Vector3 | null
  readonly moved: boolean
  /** Where the head pointed when it last came to rest. */
  readonly anchor: Vector3 | null
  readonly steadySeconds: number
}

export const notReady: ReadyState = { first: null, moved: false, anchor: null, steadySeconds: 0 }

/** The wait for a head held still on the dot, after `deltaSeconds` more with the head at `head`. */
export function updateReady(state: ReadyState, head: Quaternion, deltaSeconds: number): ReadyState {
  const pointing = rotate(head, straightAhead)
  const first = state.first ?? pointing
  const moved = state.moved || angleBetween(first, pointing) >= readyLayout.wornDegrees
  if (!moved || !facesLevel(head)) return { first, moved, anchor: null, steadySeconds: 0 }
  if (state.anchor === null || angleBetween(state.anchor, pointing) > readyLayout.steadyDegrees) {
    return { first, moved, anchor: pointing, steadySeconds: 0 }
  }
  return { first, moved, anchor: state.anchor, steadySeconds: state.steadySeconds + Math.max(0, deltaSeconds) }
}

/** How full the ring around the dot is while the head holds still, from 0 to 1. */
export const readyFill = (state: ReadyState): number => Math.min(1, state.steadySeconds / readyLayout.steadySeconds)

export const isSteady = (state: ReadyState): boolean => state.steadySeconds >= readyLayout.steadySeconds - 1e-9

/** Button positions of the WebXR standard controller layout, and what each does. */
const buttonCommands: readonly (readonly [number, Command])[] = [
  [0, 'yes'],
  [4, 'yes'],
  [5, 'no'],
  [1, 'back'],
]

interface ButtonLike {
  readonly pressed: boolean
}

export interface ControllerLike {
  readonly handedness: string
  readonly gamepad?: { readonly buttons: readonly ButtonLike[] } | null
}

/**
 * Tells new presses from held buttons, frame after frame. A button counts on the frame it goes
 * down, so every press answers once, however quickly presses follow each other.
 */
export class ButtonPresses {
  private readonly held = new Map<string, Set<number>>()
  private readonly seen = new Set<string>()

  /** Adds the commands of the buttons pressed since the last reading to `commands`. */
  read(controllers: Iterable<ControllerLike>, commands: Command[]): void {
    this.seen.clear()
    for (const controller of controllers) {
      const buttons = controller.gamepad?.buttons ?? []
      let held = this.held.get(controller.handedness)
      if (held === undefined) {
        held = new Set()
        this.held.set(controller.handedness, held)
      }
      this.seen.add(controller.handedness)
      for (const [button, command] of buttonCommands) {
        if (buttons.at(button)?.pressed !== true) {
          held.delete(button)
        } else if (!held.has(button)) {
          held.add(button)
          commands.push(command)
        }
      }
    }
    // A controller that went away holds nothing down.
    for (const [hand, held] of this.held) if (!this.seen.has(hand)) held.clear()
  }
}

const keyCommands: ReadonlyMap<string, Command> = new Map([
  ['Enter', 'yes'],
  [' ', 'no'],
  ['Backspace', 'back'],
])

/** What a key does, by its `KeyboardEvent.key`, or null for any other key. */
export const keyCommand = (key: string): Command | null => keyCommands.get(key) ?? null
