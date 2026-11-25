/**
 * The whole FOV Atlas measure: every direction of the left eye, then of the right eye, each found
 * by its own edge search, with a way back one answer at a time. An edge whose answers never
 * settle is left out of the measure and listed as unsettled.
 *
 * The measure is a plain value changed only by answers, so the same answers always give the same
 * result, whatever headset or browser asks them.
 */

import { answerSearch, searchOutcome, startSearch, type EdgeSearch, type SearchOutcome } from './edgeSearch.ts'
import { reachToward, type RenderedView } from './renderedViews.ts'
import { directions, principalDirections, type Ceiling, type CornerMask, type Direction, type Eye, type EyeMeasures } from './submission.ts'

/** The eight principal directions are required; the eight in between are optional. */
export type DirectionChoice = 'principal' | 'all'
const directionChoices: ReadonlyMap<DirectionChoice, readonly Direction[]> = new Map([
  ['principal', principalDirections],
  ['all', directions],
])

/** The directions asked per eye. */
export const directionsOf = (choice: DirectionChoice): readonly Direction[] => directionChoices.get(choice) ?? principalDirections

/** The line is never shown closer to straight ahead than this, where everyone sees it. */
export const minimumAngle = 1
const eyes: readonly Eye[] = ['left', 'right']

export interface MeasureStep {
  readonly eye: Eye
  readonly direction: Direction
  /** The furthest angle the headset draws for this eye in this direction. */
  readonly maximum: number
}

export function measureSteps(choice: DirectionChoice, views: Readonly<Record<Eye, RenderedView>>): MeasureStep[] {
  return eyes.flatMap((eye) =>
    directionsOf(choice).map((direction) => ({
      eye,
      direction,
      maximum: reachToward(eye === 'left' ? views.left : views.right, direction),
    })),
  )
}

interface Position {
  readonly stepIndex: number
  readonly search: EdgeSearch | null
  /** How the search of each step done so far ended. */
  readonly results: readonly SearchOutcome[]
}

export interface MeasureProgress extends Position {
  readonly steps: readonly MeasureStep[]
  /** Every earlier position, the latest last, for going back one answer at a time. */
  readonly history: readonly Position[]
}

const searchFor = (step: MeasureStep | undefined): EdgeSearch | null =>
  step === undefined ? null : startSearch(minimumAngle, step.maximum)

/** Moves on past every step whose search needs no question. */
function settle(steps: readonly MeasureStep[], position: Position): Position {
  let current = position
  let result = current.search === null ? null : searchOutcome(current.search)
  while (result !== null) {
    const stepIndex = current.stepIndex + 1
    current = { stepIndex, search: searchFor(steps.at(stepIndex)), results: [...current.results, result] }
    result = current.search === null ? null : searchOutcome(current.search)
  }
  return current
}

export function startMeasure(steps: readonly MeasureStep[]): MeasureProgress {
  return { steps, history: [], ...settle(steps, { stepIndex: 0, search: searchFor(steps.at(0)), results: [] }) }
}

const positionOf = ({ stepIndex, search, results }: MeasureProgress): Position => ({ stepIndex, search, results })

export function answerProbe(progress: MeasureProgress, seen: boolean): MeasureProgress {
  if (progress.search === null) return progress
  const answered = { ...positionOf(progress), search: answerSearch(progress.search, seen) }
  return { ...progress, history: [...progress.history, positionOf(progress)], ...settle(progress.steps, answered) }
}

/** Undoes the last answer, even one that finished an edge. */
export function goBack(progress: MeasureProgress): MeasureProgress {
  const previous = progress.history.at(-1)
  if (previous === undefined) return progress
  return { ...progress, history: progress.history.slice(0, -1), ...previous }
}

export const isFinished = (progress: MeasureProgress): boolean => progress.search === null

export interface Probe {
  readonly eye: Eye
  readonly direction: Direction
  readonly angle: number
}

/** Where the line is shown now, or nothing once every edge is found. */
export function currentProbe(progress: MeasureProgress): Probe | null {
  const step = progress.steps.at(progress.stepIndex)
  if (step === undefined || progress.search === null) return null
  return { eye: step.eye, direction: step.direction, angle: progress.search.probe }
}

/** Steps done, and how many there are. */
export const progressCount = (progress: MeasureProgress): { readonly done: number; readonly total: number } => ({
  done: progress.results.length,
  total: progress.steps.length,
})

export interface EyeDirection {
  readonly eye: Eye
  readonly direction: Direction
}

export interface MeasureResults {
  /** Every edge found, per eye. */
  readonly measures: EyeMeasures
  /** The directions whose answers never settled, left out of `measures`. */
  readonly unsettled: readonly EyeDirection[]
}

/** What the measure found, once it is finished. */
export function measuresOf(progress: MeasureProgress): MeasureResults | null {
  if (!isFinished(progress)) return null
  const found = progress.steps.flatMap((step, stepIndex) => {
    const result = progress.results.at(stepIndex)
    return result === undefined ? [] : [{ step, result }]
  })
  const eyeMeasure = (eye: Eye): Partial<Record<Direction, number>> =>
    Object.fromEntries(found.flatMap(({ step, result }) => (step.eye === eye && result.settled ? [[step.direction, result.edge]] : [])))
  return {
    measures: { left: eyeMeasure('left'), right: eyeMeasure('right') },
    unsettled: found.flatMap(({ step, result }) => (result.settled ? [] : [{ eye: step.eye, direction: step.direction }])),
  }
}

/** Whether every required direction settled, so the measure can be kept and published. */
export const isComplete = (results: MeasureResults): boolean =>
  results.unsettled.every(({ direction }) => !principalDirections.includes(direction))

/** Answers an edge usually takes: about five halvings, a check, and the odd restart. */
const answersPerEdge = 7

/** About how many minutes the measure takes, from the edges asked and the time one answer takes. */
export function estimatedMinutes(choice: DirectionChoice, secondsPerAnswer: number): number {
  return Math.round((directionsOf(choice).length * eyes.length * answersPerEdge * secondsPerAnswer) / 60)
}

/** A finished FOV Atlas measure: what the wearer saw, and what the headset reported it draws. */
export interface AtlasMeasure {
  readonly measures: EyeMeasures
  /** The directions left out because their answers never settled; only in-between directions can be. */
  readonly unsettled: readonly EyeDirection[]
  readonly ceiling: Ceiling
  readonly cornerMask: CornerMask
}
