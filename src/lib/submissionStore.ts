/**
 * Submissions as the site serves them: one shard per tool and headset holding every accepted
 * issue, and next to it the shard's aggregate, which is all the compare pages need to load.
 *
 * An aggregate is split into cells, one per combination of the soft filters with a closed set of
 * values (face fit, tuning, gaze). Each cell keeps count, sum, sum of squares and max per direction
 * and per binocular figure, so the site combines any selection of cells into a mean, a spread and
 * a maximum without the raw values. Tools never share a file, so nothing combines across tools.
 */

import {
  type Direction,
  type EyeMeasure,
  type EyeMeasures,
  type Submission,
  type Tool,
} from './submission.ts'

export const dataRoot = 'public/data'
export const indexPath = `${dataRoot}/index.json`
export const shardDirectory = `${dataRoot}/submissions`
export const shardPath = (tool: Tool, headset: string): string => `${shardDirectory}/${tool}/${headset}.json`
export const aggregatePath = (tool: Tool, headset: string): string => `${dataRoot}/aggregates/${tool}/${headset}.json`

const formatVersion = 1

export interface StoredEntry {
  /** The issue author's public GitHub login, shown next to the measure. */
  readonly author: string
  readonly submission: Submission
}

export interface Shard {
  readonly version: typeof formatVersion
  readonly tool: Tool
  readonly headset: string
  /** Keyed by issue number. */
  readonly entries: Readonly<Record<string, StoredEntry>>
}

/** `count`, `sum` and `sumsq` add up across cells; `max` combines by taking the largest. */
export interface Stat {
  readonly count: number
  readonly sum: number
  readonly sumsq: number
  readonly max: number
}

export const binocularFigures = ['horizontal', 'vertical', 'overlap'] as const
export type BinocularFigure = (typeof binocularFigures)[number]

export interface CellStats {
  readonly left: Partial<Record<Direction, Stat>>
  readonly right: Partial<Record<Direction, Stat>>
  readonly binocular: Partial<Record<BinocularFigure, Stat>>
}

export interface Aggregate {
  readonly version: typeof formatVersion
  readonly tool: Tool
  readonly headset: string
  readonly count: number
  /** Keyed by `cellKey`. */
  readonly cells: Readonly<Record<string, CellStats>>
}

export interface DataIndex {
  readonly version: typeof formatVersion
  /** Number of stored submissions per tool and headset; only shards that hold any are listed. */
  readonly counts: Readonly<Partial<Record<Tool, Readonly<Record<string, number>>>>>
}

export type Tuning = 'stock' | 'modded' | 'tuned' | 'both'

export function tuningOf({ tuning }: Submission): Tuning {
  if (tuning.physicallyModded) return tuning.driverTuned ? 'both' : 'modded'
  return tuning.driverTuned ? 'tuned' : 'stock'
}

/** `<eye depth>|<nose bridge>|<tuning>|<gaze>` */
export function cellKey(submission: Submission): string {
  return [submission.face.eyeDepth, submission.face.noseBridge, tuningOf(submission), submission.gaze].join('|')
}

export const emptyShard = (tool: Tool, headset: string): Shard => ({ version: formatVersion, tool, headset, entries: {} })
export const emptyIndex = (): DataIndex => ({ version: formatVersion, counts: {} })

export function withEntry(shard: Shard, issue: number, entry: StoredEntry): Shard {
  return { ...shard, entries: Object.fromEntries([...Object.entries(shard.entries), [String(issue), entry]]) }
}

export function withoutEntry(shard: Shard, issue: number): Shard {
  return { ...shard, entries: Object.fromEntries(Object.entries(shard.entries).filter(([key]) => key !== String(issue))) }
}

/** Shards are written only by the submission Action, so this checks the frame, not each value. */
export function parseShard(json: string, tool: Tool, headset: string): Shard | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  const shard = parsed as Partial<Shard> | null
  if (shard?.version !== formatVersion || shard.tool !== tool || shard.headset !== headset) return null
  const entries: unknown = shard.entries
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return null
  const entriesValid = Object.entries(entries as Record<string, Partial<StoredEntry>>).every(
    ([issue, entry]) =>
      /^[1-9]\d*$/.test(issue) &&
      typeof entry.author === 'string' &&
      entry.submission?.tool === tool &&
      entry.submission.headset === headset,
  )
  return entriesValid ? (shard as Shard) : null
}

export function parseIndex(json: string): DataIndex | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  const index = parsed as Partial<DataIndex> | null
  const counts: unknown = index?.counts
  if (index?.version !== formatVersion || typeof counts !== 'object' || counts === null) return null
  return index as DataIndex
}

export function withCount(index: DataIndex, tool: Tool, headset: string, count: number): DataIndex {
  const counts = new Map(Object.entries(index.counts))
  const headsets = new Map(Object.entries(counts.get(tool) ?? {}))
  if (count > 0) headsets.set(headset, count)
  else headsets.delete(headset)
  if (headsets.size > 0) counts.set(tool, Object.fromEntries([...headsets].sort(([first], [second]) => first.localeCompare(second))))
  else counts.delete(tool)
  return { ...index, counts: Object.fromEntries(counts) }
}

/** Hundredths of a degree, so that sums stay exact. */
const toCenti = (degrees: number): number => Math.round(degrees * 100)

interface Accumulator {
  count: number
  sum: number
  sumsq: number
  max: number
}

function accumulate(accumulators: Map<string, Accumulator>, key: string, degrees: number): void {
  const centi = toCenti(degrees)
  const accumulator = accumulators.get(key) ?? { count: 0, sum: 0, sumsq: 0, max: centi }
  accumulator.count += 1
  accumulator.sum += centi
  accumulator.sumsq += centi * centi
  accumulator.max = Math.max(accumulator.max, centi)
  accumulators.set(key, accumulator)
}

function statsOf(accumulators: Map<string, Accumulator>, prefix: string): Record<string, Stat> {
  return Object.fromEntries(
    [...accumulators]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, { count, sum, sumsq, max }]) => [
        key.slice(prefix.length),
        { count, sum: sum / 100, sumsq: sumsq / 10_000, max: max / 100 },
      ]),
  )
}

/** The binocular figures, as the site shows them for a single measure. */
export function binocularOf({ left, right }: EyeMeasures): Partial<Record<BinocularFigure, number>> {
  const sumOf = (first: number | undefined, second: number | undefined): number | undefined =>
    first === undefined || second === undefined ? undefined : (toCenti(first) + toCenti(second)) / 100
  const horizontal = sumOf(left.left, right.right)
  const leftVertical = sumOf(left.up, left.down)
  const rightVertical = sumOf(right.up, right.down)
  const vertical = leftVertical === undefined || rightVertical === undefined ? undefined : Math.max(leftVertical, rightVertical)
  const overlap = sumOf(left.right, right.left)
  return Object.fromEntries(
    Object.entries({ horizontal, vertical, overlap }).filter(([, value]) => value !== undefined),
  )
}

function cellOf(submissions: readonly Submission[]): CellStats {
  const accumulators = new Map<string, Accumulator>()
  const addEye = (prefix: string, eye: EyeMeasure): void => {
    for (const [direction, degrees] of Object.entries(eye)) accumulate(accumulators, `${prefix}${direction}`, degrees)
  }
  for (const submission of submissions) {
    addEye('left:', submission.measures.left)
    addEye('right:', submission.measures.right)
    for (const [figure, degrees] of Object.entries(binocularOf(submission.measures))) {
      accumulate(accumulators, `binocular:${figure}`, degrees)
    }
  }
  return { left: statsOf(accumulators, 'left:'), right: statsOf(accumulators, 'right:'), binocular: statsOf(accumulators, 'binocular:') }
}

export function aggregateShard(shard: Shard): Aggregate {
  const groups = new Map<string, Submission[]>()
  const submissions = Object.values(shard.entries).map(({ submission }) => submission)
  for (const submission of submissions) {
    const key = cellKey(submission)
    groups.set(key, [...(groups.get(key) ?? []), submission])
  }
  const cells = Object.fromEntries(
    [...groups].sort(([first], [second]) => first.localeCompare(second)).map(([key, group]) => [key, cellOf(group)]),
  )
  return { version: formatVersion, tool: shard.tool, headset: shard.headset, count: submissions.length, cells }
}

export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
