/**
 * Finding one edge of what an eye sees: the furthest angle at which the wearer still sees the
 * line, asked one still line at a time ("do you see the line?").
 *
 * The search starts in a window just inside what the headset draws and halves it after each
 * answer. Once the window is narrower than the tolerance, the angle kept is checked once more,
 * since one careless answer would otherwise decide the result. When every answer was "no", the
 * edge lies further in, so the window moves inward and the search starts over there; when a check
 * fails, the search starts over inward of the angle that failed. The line can never be drawn
 * beyond what the headset draws, so an edge reaching that far is confirmed there and kept at it.
 * A wearer whose answers never settle within the answers allowed gets the last angle seen, or,
 * with nothing seen at all, no edge: an unsettled edge is reported as such, never stored as a
 * guess.
 *
 * Angles are degrees from straight ahead of the head, in hundredths of a degree.
 */

import { roundCenti } from './ceiling.ts'

export const searchTuning = {
  /** The window is halved until narrower than this. */
  tolerance: 0.5,
  /** Width of the first window, and of each inward restart. */
  window: 20,
  /** Answers allowed per edge, so a wearer who keeps contradicting themselves is not asked forever. */
  maximumAnswers: 40,
} as const

export type SearchPhase =
  /** Halving the window between `low` and `high`. */
  | 'searching'
  /** Asking at the furthest angle the headset draws, every answer so far having been "yes". */
  | 'checking-limit'
  /** Asking once more at `low`, the angle about to be kept. */
  | 'checking-result'
  | 'done'
  /** Out of answers with nothing seen in the window: no edge can be told. */
  | 'unsettled'

export interface EdgeSearch {
  readonly phase: SearchPhase
  /** The smallest angle asked about. */
  readonly minimum: number
  /** The furthest angle the headset draws in this direction. */
  readonly maximum: number
  readonly low: number
  /** Whether the line was seen at `low`. */
  readonly lowSeen: boolean
  readonly high: number
  /** Whether the line was missed at `high`. */
  readonly highMissed: boolean
  /** Where the line is shown now. */
  readonly probe: number
  readonly answers: number
}

const middleOf = (low: number, high: number): number => roundCenti((low + high) / 2)

function finished(search: EdgeSearch, result: number): EdgeSearch {
  return { ...search, phase: 'done', low: result, probe: result }
}

/** Where to ask next, from bounds just updated by an answer or a restart. */
function nextQuestion(search: EdgeSearch): EdgeSearch {
  const { low, high, minimum, maximum } = search
  if (search.answers >= searchTuning.maximumAnswers) return search.lowSeen ? finished(search, low) : { ...search, phase: 'unsettled' }
  if (high - low > searchTuning.tolerance) return { ...search, phase: 'searching', probe: middleOf(low, high) }
  if (!search.lowSeen) {
    // Even the smallest angle went unseen: nothing further in is worth asking about.
    if (low <= minimum) return finished(search, minimum)
    return nextQuestion({ ...search, low: Math.max(minimum, roundCenti(low - searchTuning.window)) })
  }
  // The window always ends at the limit, so an edge no "no" has bounded lies at the limit or beyond it.
  if (!search.highMissed) return { ...search, phase: 'checking-limit', probe: maximum }
  return { ...search, phase: 'checking-result', probe: low }
}

/**
 * A new search between `minimum` and `maximum` (the furthest angle the headset draws, in
 * hundredths). With nothing drawn beyond the minimum there is nothing to ask.
 */
export function startSearch(minimum: number, maximum: number): EdgeSearch {
  const search: EdgeSearch = {
    phase: 'searching',
    minimum,
    maximum,
    low: Math.max(minimum, roundCenti(maximum - searchTuning.window)),
    lowSeen: false,
    high: maximum,
    highMissed: false,
    probe: maximum,
    answers: 0,
  }
  if (maximum <= minimum) return finished(search, Math.max(0, maximum))
  // A window too narrow to halve goes straight to the check at the limit.
  if (maximum - minimum <= searchTuning.tolerance) return { ...search, low: minimum, lowSeen: true, phase: 'checking-limit' }
  return nextQuestion(search)
}

/** The search after the wearer answers whether they see the line at `probe`. */
export function answerSearch(search: EdgeSearch, seen: boolean): EdgeSearch {
  const answered = { ...search, answers: search.answers + 1 }
  const { probe } = search
  switch (search.phase) {
    case 'done':
    case 'unsettled':
      return search
    case 'searching':
      return nextQuestion(seen ? { ...answered, low: probe, lowSeen: true } : { ...answered, high: probe, highMissed: true })
    case 'checking-limit':
      return seen ? finished(answered, probe) : nextQuestion({ ...answered, high: probe, highMissed: true })
    case 'checking-result':
      if (seen) return finished(answered, probe)
      return nextQuestion({
        ...answered,
        high: probe,
        highMissed: true,
        low: Math.max(search.minimum, roundCenti(probe - searchTuning.window)),
        lowSeen: false,
      })
  }
}

export type SearchOutcome = { readonly settled: true; readonly edge: number } | { readonly settled: false }

/** How the search ended, or null while it still asks. */
export function searchOutcome(search: EdgeSearch): SearchOutcome | null {
  if (search.phase === 'done') return { settled: true, edge: search.low }
  return search.phase === 'unsettled' ? { settled: false } : null
}
