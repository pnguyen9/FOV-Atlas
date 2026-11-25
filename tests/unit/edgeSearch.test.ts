import { describe, expect, it } from 'vitest'
import { hasAtMostDecimals } from '../../src/lib/submission'
import { answerSearch, searchOutcome, searchTuning, startSearch, type EdgeSearch } from '../../src/lib/edgeSearch'

/** The edge a search settled on, or null while it asks or when it couldn't settle. */
function searchResult(search: EdgeSearch): number | null {
  const outcome = searchOutcome(search)
  return outcome?.settled === true ? outcome.edge : null
}

/** Answers for a wearer who sees the line up to `edge` and never past it. */
const steadyWearer = (edge: number) => (probe: number) => probe <= edge

function runSearch(search: EdgeSearch, sees: (probe: number, answerIndex: number) => boolean): { result: number | null; probes: number[] } {
  let current = search
  const probes: number[] = []
  while (searchOutcome(current) === null && probes.length < 200) {
    probes.push(current.probe)
    current = answerSearch(current, sees(current.probe, probes.length - 1))
  }
  return { result: searchResult(current), probes }
}

describe('startSearch', () => {
  it('starts in the middle of a window ending at what the headset draws', () => {
    const search = startSearch(1, 55)
    expect(search.phase).toBe('searching')
    expect(search.low).toBe(55 - searchTuning.window)
    expect(search.high).toBe(55)
    expect(search.probe).toBe(45)
  })

  it('starts the window at the minimum when the headset draws less than a window', () => {
    expect(startSearch(1, 11).low).toBe(1)
    expect(startSearch(1, 11).probe).toBe(6)
  })

  it('asks nothing when nothing is drawn past the minimum', () => {
    expect(searchResult(startSearch(1, 0.6))).toBe(0.6)
    expect(searchResult(startSearch(1, -2))).toBe(0)
  })

  it('asks only at the limit when the window is too narrow to halve', () => {
    const search = startSearch(1, 1.4)
    expect(search.phase).toBe('checking-limit')
    expect(search.probe).toBe(1.4)
    expect(runSearch(search, () => true).result).toBe(1.4)
    expect(runSearch(search, steadyWearer(1.2)).result).toBe(1)
    expect(runSearch(search, () => false).result).toBe(1)
  })
})

describe('answerSearch', () => {
  it.each([36.3, 40, 47.77, 52.5, 54.4])('settles within the tolerance below an edge at %f°', (edge) => {
    const { result, probes } = runSearch(startSearch(1, 55), steadyWearer(edge))
    expect(result).not.toBeNull()
    expect(result ?? 0).toBeLessThanOrEqual(edge)
    expect(edge - (result ?? 0)).toBeLessThanOrEqual(searchTuning.tolerance)
    expect(probes.length).toBeLessThanOrEqual(8)
    // The kept angle is asked about once more before the search ends.
    expect(probes.at(-1)).toBe(result)
  })

  it('keeps every probe in hundredths of a degree, inside what the headset draws', () => {
    const { probes } = runSearch(startSearch(1, 54.81), steadyWearer(50.123))
    expect(probes.every((probe) => hasAtMostDecimals(probe, 2) && probe <= 54.81 && probe >= 1)).toBe(true)
  })

  it('confirms an edge at what the headset draws and keeps it there', () => {
    const { result, probes } = runSearch(startSearch(1, 55), () => true)
    expect(result).toBe(55)
    expect(probes.at(-1)).toBe(55)
  })

  it('checks the result after a "no" at the limit', () => {
    const { result, probes } = runSearch(startSearch(1, 55), steadyWearer(54.9))
    expect(result).toBeGreaterThan(54.4)
    expect(probes.filter((probe) => probe === 55)).toHaveLength(1)
  })

  it('moves the window inward when the edge lies before it', () => {
    const { result, probes } = runSearch(startSearch(1, 55), steadyWearer(20))
    expect(result).toBeLessThanOrEqual(20)
    expect(20 - (result ?? 0)).toBeLessThanOrEqual(searchTuning.tolerance)
    expect(Math.min(...probes)).toBeLessThan(35)
  })

  it('moves inward more than once for an edge far in', () => {
    const { result } = runSearch(startSearch(1, 70), steadyWearer(8))
    expect(8 - (result ?? 0)).toBeLessThanOrEqual(searchTuning.tolerance)
  })

  it('ends at the minimum for a wearer who never sees the line', () => {
    expect(runSearch(startSearch(1, 55), () => false).result).toBe(1)
  })

  it('starts over inward when the check of the result fails', () => {
    // A careless first "yes" at 45° would otherwise decide the result.
    const sees = (probe: number, answerIndex: number): boolean => (answerIndex === 0 ? true : probe <= 40)
    const { result, probes } = runSearch(startSearch(1, 55), sees)
    expect(result).toBeLessThanOrEqual(40)
    expect(40 - (result ?? 0)).toBeLessThanOrEqual(searchTuning.tolerance)
    expect(probes.length).toBeGreaterThan(8)
  })

  it('gives up on a wearer who keeps contradicting themselves, keeping the last angle seen', () => {
    // Says "yes" the first time at every angle inside the limit and "no" when asked again, so every check fails.
    const asked = new Set<number>()
    const contradicting = (probe: number): boolean => {
      const firstTime = !asked.has(probe)
      asked.add(probe)
      return firstTime && probe < 55
    }
    const { result, probes } = runSearch(startSearch(1, 55), contradicting)
    expect(probes).toHaveLength(searchTuning.maximumAnswers)
    expect(result).not.toBeNull()
  })

  it('ends unsettled when the answers run out before the window, moving inward, ever holds a "yes"', () => {
    // Drawn almost to straight behind, the window has to move inward more often than the answers allow.
    let search = startSearch(1, 179)
    let answers = 0
    while (searchOutcome(search) === null) {
      search = answerSearch(search, false)
      answers += 1
    }
    expect(searchOutcome(search)).toEqual({ settled: false })
    expect(answers).toBe(searchTuning.maximumAnswers)
  })

  it('ends unsettled, storing no angle, when nothing in the window was seen within the answers allowed', () => {
    const search: EdgeSearch = { ...startSearch(1, 55), answers: searchTuning.maximumAnswers - 1 }
    const ended = answerSearch(search, false)
    expect(searchOutcome(ended)).toEqual({ settled: false })
    expect(answerSearch(ended, true)).toBe(ended)
  })

  it('keeps the angle last seen when the answers run out after a "yes"', () => {
    const search: EdgeSearch = { ...startSearch(1, 55), answers: searchTuning.maximumAnswers - 1 }
    expect(searchOutcome(answerSearch(search, true))).toEqual({ settled: true, edge: search.probe })
  })

  it('leaves a finished search unchanged', () => {
    const done = startSearch(1, 0.5)
    expect(answerSearch(done, true)).toBe(done)
    expect(searchResult(startSearch(1, 55))).toBeNull()
  })
})
