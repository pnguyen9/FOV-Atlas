/**
 * The measure from the wearer's side, frame by frame: getting ready, then answering one question
 * after another in the chosen answer mode. A plain value changed only by what each frame brings
 * (where the head points, the presses since the last frame), so it is the same on every headset.
 *
 * Nothing answers before the wearer is ready, and the Yes and No targets are placed from where
 * the head faces at that moment, never from the first frame, when the headset may still lie on a
 * desk. In keyboard or controller mode, a wearer whose presses never reach the page is offered a
 * target that switches to answering with the head, from inside the headset.
 */

import {
  answerTargets,
  facesLevel,
  headPointingTarget,
  isSteady,
  notReady,
  pointedAction,
  restingHold,
  updateHold,
  updateReady,
  type AnswerMode,
  type AnswerTarget,
  type Command,
  type HoldState,
  type ReadyState,
} from './answerTargets.ts'
import type { Quaternion } from './headFrame.ts'
import { answerProbe, goBack, isFinished, type MeasureProgress } from './measureSession.ts'

/** How long to wait for a first key or button press before offering to answer with the head. */
export const noPressSeconds = 20

export type Stage = 'ready' | 'asking'

export interface FlowState {
  readonly progress: MeasureProgress
  readonly mode: AnswerMode
  readonly stage: Stage
  readonly ready: ReadyState
  readonly hold: HoldState
  /** The targets hanging in the room: Yes, No and, once there is an answer to undo, Back in head mode; or the offer to switch to it. */
  readonly targets: readonly AnswerTarget[]
  /** Every target of head mode, placed when ready, Back included. */
  readonly headTargets: readonly AnswerTarget[]
  /** Whether any key or button press has reached the page. */
  readonly pressArrived: boolean
  /** Time spent getting ready with no press arriving, in seconds. */
  readonly waitedSeconds: number
}

export function startFlow(progress: MeasureProgress, mode: AnswerMode): FlowState {
  return { progress, mode, stage: 'ready', ready: notReady, hold: restingHold, targets: [], headTargets: [], pressArrived: false, waitedSeconds: 0 }
}

export interface FrameInput {
  /** The head's rotation in the room. */
  readonly head: Quaternion
  readonly deltaSeconds: number
  /** Commands of the presses since the last frame, in the order they came. */
  readonly commands: readonly Command[]
  /** Whether any key at all was pressed since the last frame. */
  readonly keyPressed: boolean
}

/** Whether to tell the wearer that no press has reached the page. */
export const noPressArrived = (state: FlowState): boolean =>
  state.mode !== 'head' && state.stage === 'ready' && !state.pressArrived && state.waitedSeconds >= noPressSeconds

/** The head-mode targets to show: Back only once there is an answer to undo. Unchanged targets keep their identity. */
function withShownTargets(state: FlowState): FlowState {
  const canGoBack = state.progress.history.length > 0
  const shown = state.headTargets.filter((target) => target.action !== 'back' || canGoBack)
  const same = shown.length === state.targets.length && shown.every((target, targetIndex) => target === state.targets.at(targetIndex))
  return same ? state : { ...state, targets: shown }
}

function begin(state: FlowState, head: Quaternion): FlowState {
  const headTargets = state.mode === 'head' ? answerTargets(head) : []
  return withShownTargets({ ...state, stage: 'asking', headTargets, targets: [], hold: restingHold })
}

function getReady(state: FlowState, { head, deltaSeconds, commands, keyPressed }: FrameInput): FlowState {
  if (state.mode === 'head') {
    const ready = updateReady(state.ready, head, deltaSeconds)
    return isSteady(ready) ? begin({ ...state, ready }, head) : { ...state, ready }
  }
  const pressArrived = state.pressArrived || keyPressed || commands.length > 0
  if (commands.includes('yes') && facesLevel(head)) return begin({ ...state, pressArrived, targets: [] }, head)
  if (pressArrived) return { ...state, pressArrived, targets: [], hold: restingHold }
  const waiting = { ...state, waitedSeconds: state.waitedSeconds + Math.max(0, deltaSeconds) }
  if (!noPressArrived(waiting)) return waiting
  const targets = waiting.targets.length > 0 || !facesLevel(head) ? waiting.targets : [headPointingTarget(head)]
  const update = updateHold(waiting.hold, pointedAction(head, targets), deltaSeconds)
  if (update.chosen === 'head-pointing') return begin({ ...waiting, mode: 'head', targets }, head)
  return { ...waiting, targets, hold: update.hold }
}

function answer(state: FlowState, command: Command): FlowState {
  if (command === 'back') return { ...state, progress: goBack(state.progress) }
  return isFinished(state.progress) ? state : { ...state, progress: answerProbe(state.progress, command === 'yes') }
}

/** The flow after one frame the wearer could see. */
export function stepFlow(state: FlowState, input: FrameInput): FlowState {
  if (state.stage === 'ready') return getReady(state, input)
  if (state.mode !== 'head') return input.commands.reduce(answer, state)
  const update = updateHold(state.hold, pointedAction(input.head, state.targets), input.deltaSeconds)
  const { chosen } = update
  const answered = chosen === 'yes' || chosen === 'no' || chosen === 'back' ? answer(state, chosen) : state
  return withShownTargets({ ...answered, hold: update.hold })
}
