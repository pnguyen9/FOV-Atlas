/**
 * Submissions as the site serves them, per tool and headset: the accepted issues split into pages
 * the site loads one at a time, and an aggregate of all of them, which is all the compare pages
 * need to load. `index.json` lists each headset's count and number of pages, and the issue
 * lookups, kept for the Action only, say where each issue is stored, so it never has to read
 * other headsets.
 *
 * An aggregate is split into cells, one per combination of the soft filters with a closed set of
 * values (face fit, tuning, gaze). Each cell keeps count, sum, sum of squares and max per direction
 * and per figure (`figuresOf`), so the site combines any selection of cells into
 * a mean, a spread and a maximum without the raw values. Tools never share a file, so nothing
 * combines across tools.
 */

import {
  isHeadsetId,
  tools,
  type Direction,
  type EyeMeasures,
  type Submission,
  type Tool,
} from './submission.ts'

export const dataRoot = 'public/data'
export const indexPath = `${dataRoot}/index.json`

/** A page fills up to this many entries; the site loads a headset's submissions one page at a time. */
export const entriesPerPage = 100
export const pagePath = (tool: Tool, headset: string, page: number): string =>
  `${dataRoot}/submissions/${tool}/${headset}/${String(page)}.json`
export const aggregatePath = (tool: Tool, headset: string): string => `${dataRoot}/aggregates/${tool}/${headset}.json`

/** Issue numbers per lookup file, so that finding an issue reads one small file. */
export const issuesPerLookup = 1000
export const lookupNumberOf = (issue: number): number => Math.floor(issue / issuesPerLookup)
/** Only the Action reads the lookups, so they sit outside the published site. */
export const lookupRoot = 'data/issues'
export const lookupPath = (lookup: number): string => `${lookupRoot}/${String(lookup)}.json`

/**
 * The directory a data file path the store builds lives in: lowercase ids and page numbers below
 * `dataRoot` or `lookupRoot`. Null for any other path, which was not built here.
 */
export function dataRootOf(path: string): string | null {
  const root = [dataRoot, lookupRoot].find((candidate) => path.startsWith(`${candidate}/`))
  if (root === undefined || !path.endsWith('.json')) return null
  const segments = path.slice(root.length + 1, -'.json'.length).split('/')
  return segments.every((segment) => /^[a-z0-9-]+$/.test(segment)) ? root : null
}

const formatVersion = 1

export interface StoredEntry {
  /** The issue author's public GitHub login, shown next to the measure. */
  readonly author: string
  readonly submission: Submission
}

/**
 * Up to `entriesPerPage` entries of one tool and headset. Entries are appended to the last page
 * and keep their page until withdrawn, because the issue lookup names it; higher pages hold later
 * submissions, and a withdrawal leaves a gap on its page.
 */
export interface Page {
  readonly version: typeof formatVersion
  readonly tool: Tool
  readonly headset: string
  readonly page: number
  /** Keyed by issue number. */
  readonly entries: Readonly<Record<string, StoredEntry>>
}

/** Where an issue's entry is stored. */
export interface Location {
  readonly tool: Tool
  readonly headset: string
  readonly page: number
}

/** The stored issues numbered from `lookup * issuesPerLookup` up to the next lookup. */
export interface IssueLookup {
  readonly version: typeof formatVersion
  readonly lookup: number
  /** Keyed by issue number. */
  readonly issues: Readonly<Record<string, Location>>
}

/** `count`, `sum` and `sumsq` add up across cells; `max` combines by taking the largest. */
export interface Stat {
  readonly count: number
  readonly sum: number
  readonly sumsq: number
  readonly max: number
}

/**
 * Figures worked out from each measure, in degrees. Which ones a measure has depends on its tool
 * and on whether it carries the rendered field of view of its own headset:
 *
 * - `horizontal`, `vertical`, `overlap`: both eyes together, for tools whose angles all start
 *   straight ahead of the head (every tool but VR Headset Picker).
 * - `leftWidth` … `rightHeight`: each eye on its own, for VR Headset Picker, whose angles start
 *   at the centre of each eye's picture. Adding the left eye's left angle to the right eye's
 *   right angle would mix two starting points on headsets that turn each eye's picture outward.
 * - `rendered…`: what the measure's own headset reports it draws, in the tool's convention.
 * - `…PastRendered`: the measured figure minus the rendered one, worked out per measure, so the
 *   gap always sets a measure against its own headset. Below zero for every measure that stays
 *   inside what is drawn; the highest is the smallest gap.
 * - `canting`: how far each eye's picture is turned outward.
 */
export const figureNames = [
  'horizontal',
  'vertical',
  'overlap',
  'leftWidth',
  'leftHeight',
  'rightWidth',
  'rightHeight',
  'renderedHorizontal',
  'renderedOverlap',
  'renderedLeftWidth',
  'renderedLeftHeight',
  'renderedRightWidth',
  'renderedRightHeight',
  'horizontalPastRendered',
  'leftWidthPastRendered',
  'leftHeightPastRendered',
  'rightWidthPastRendered',
  'rightHeightPastRendered',
  'canting',
] as const
export type FigureName = (typeof figureNames)[number]
/** The figures that can be below zero. */
export const signedFigures: readonly FigureName[] = figureNames.filter(
  (figure) => figure.endsWith('PastRendered') || figure === 'canting',
)


export interface CellStats {
  readonly left: Partial<Record<Direction, Stat>>
  readonly right: Partial<Record<Direction, Stat>>
  readonly figures: Partial<Record<FigureName, Stat>>
}

export interface Aggregate {
  readonly version: typeof formatVersion
  readonly tool: Tool
  readonly headset: string
  readonly count: number
  /** Keyed by `cellKey`. */
  readonly cells: Readonly<Record<string, CellStats>>
}

export interface HeadsetSummary {
  readonly count: number
  /** Pages `0` to `pages - 1` all exist; the last one is never empty. */
  readonly pages: number
}

export interface DataIndex {
  readonly version: typeof formatVersion
  /** Per tool and headset; only headsets with stored submissions are listed. */
  readonly headsets: Readonly<Partial<Record<Tool, Readonly<Record<string, HeadsetSummary>>>>>
  /**
   * The headsets with an averaged rendered field of view (see `renderedAverage.ts`) and how many
   * measures it pools. Left out while there is none.
   */
  readonly rendered?: Readonly<Record<string, number>>
}

export const tunings = ['stock', 'modded', 'tuned', 'both'] as const
export type Tuning = (typeof tunings)[number]

export function tuningOf({ tuning }: Submission): Tuning {
  if (tuning.physicallyModded) return tuning.driverTuned ? 'both' : 'modded'
  return tuning.driverTuned ? 'tuned' : 'stock'
}

/** `<eye depth>|<nose bridge>|<tuning>|<gaze>` */
export function cellKey(submission: Submission): string {
  return [submission.face.eyeDepth, submission.face.noseBridge, tuningOf(submission), submission.gaze].join('|')
}

export const emptyPage = (tool: Tool, headset: string, page: number): Page => ({
  version: formatVersion,
  tool,
  headset,
  page,
  entries: {},
})
export const emptyLookup = (lookup: number): IssueLookup => ({ version: formatVersion, lookup, issues: {} })
export const emptyIndex = (): DataIndex => ({ version: formatVersion, headsets: {} })

export function withEntry(page: Page, issue: number, entry: StoredEntry): Page {
  return { ...page, entries: Object.fromEntries([...Object.entries(page.entries), [String(issue), entry]]) }
}

export function withoutEntry(page: Page, issue: number): Page {
  return { ...page, entries: Object.fromEntries(Object.entries(page.entries).filter(([key]) => key !== String(issue))) }
}

export function withLocation(lookup: IssueLookup, issue: number, location: Location | null): IssueLookup {
  const issues = Object.entries(lookup.issues).filter(([key]) => key !== String(issue))
  if (location !== null) issues.push([String(issue), location])
  return { ...lookup, issues: Object.fromEntries(issues.sort(([first], [second]) => Number(first) - Number(second))) }
}

const issuePattern = /^[1-9]\d*$/
const isPageNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Pages are written only by the submission Action, so this checks the frame, not each value. */
export function parsePage(json: string, tool: Tool, headset: string, pageNumber: number): Page | null {
  const page = parseJson(json) as Partial<Page> | null
  if (page?.version !== formatVersion || page.tool !== tool || page.headset !== headset || page.page !== pageNumber) return null
  const entries: unknown = page.entries
  if (!isPlainObject(entries)) return null
  const entriesValid = Object.entries(entries as Record<string, Partial<StoredEntry> | null>).every(
    ([issue, entry]) =>
      issuePattern.test(issue) &&
      typeof entry?.author === 'string' &&
      entry.submission?.tool === tool &&
      entry.submission.headset === headset,
  )
  return entriesValid && Object.keys(entries).length <= entriesPerPage ? (page as Page) : null
}

/**
 * Lookups are written only by the submission Action, but every location in one becomes a file
 * path, so each is checked in full: a known tool, a valid headset id, a page number, and an issue
 * that belongs in this lookup.
 */
export function parseLookup(json: string, lookupNumber: number): IssueLookup | null {
  const lookup = parseJson(json) as Partial<IssueLookup> | null
  if (lookup?.version !== formatVersion || lookup.lookup !== lookupNumber) return null
  const issues: unknown = lookup.issues
  if (!isPlainObject(issues)) return null
  const issuesValid = Object.entries(issues).every(([issue, location]) => {
    if (!issuePattern.test(issue) || lookupNumberOf(Number(issue)) !== lookupNumber || !isPlainObject(location)) return false
    const { tool, headset, page } = location
    return tools.includes(tool as Tool) && typeof headset === 'string' && isHeadsetId(headset) && isPageNumber(page)
  })
  return issuesValid ? (lookup as IssueLookup) : null
}

const isPositiveCount = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) > 0

/** The index names the headset files to read, so its ids and numbers are checked in full. */
export function parseIndex(json: string): DataIndex | null {
  const index = parseJson(json) as Partial<DataIndex> | null
  const headsets: unknown = index?.headsets
  if (index?.version !== formatVersion || !isPlainObject(headsets)) return null
  const rendered: unknown = index.rendered
  if (
    rendered !== undefined &&
    !(isPlainObject(rendered) && Object.entries(rendered).every(([headset, count]) => isHeadsetId(headset) && isPositiveCount(count)))
  ) {
    return null
  }
  const headsetsValid = Object.entries(headsets).every(
    ([tool, summaries]) =>
      tools.includes(tool as Tool) &&
      isPlainObject(summaries) &&
      Object.entries(summaries).every(
        ([headset, summary]) =>
          isHeadsetId(headset) &&
          isPlainObject(summary) &&
          isPositiveCount(summary.count) &&
          isPositiveCount(summary.pages),
      ),
  )
  return headsetsValid ? (index as DataIndex) : null
}

export function withSummary(index: DataIndex, tool: Tool, headset: string, summary: HeadsetSummary | null): DataIndex {
  const byTool = new Map(Object.entries(index.headsets))
  const summaries = new Map(Object.entries(byTool.get(tool) ?? {}))
  if (summary === null) summaries.delete(headset)
  else summaries.set(headset, summary)
  if (summaries.size > 0) byTool.set(tool, Object.fromEntries([...summaries].sort(([first], [second]) => first.localeCompare(second))))
  else byTool.delete(tool)
  return { ...index, headsets: Object.fromEntries(byTool) }
}

/** Lists a headset's averaged rendered field of view with the measures it pools, or drops it for null. */
export function withRendered(index: DataIndex, headset: string, measures: number | null): DataIndex {
  const rendered = new Map(Object.entries(index.rendered ?? {}))
  if (measures === null) rendered.delete(headset)
  else rendered.set(headset, measures)
  const { headsets, version } = index
  if (rendered.size === 0) return { version, headsets }
  return { version, headsets, rendered: Object.fromEntries([...rendered].sort(([first], [second]) => first.localeCompare(second))) }
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

type Figures = Partial<Record<FigureName, number>>

/** Sums and differences in hundredths of a degree, so that a figure carries no float residue. */
const sumOf = (first: number | undefined, second: number | undefined): number | undefined =>
  first === undefined || second === undefined ? undefined : (toCenti(first) + toCenti(second)) / 100
const differenceOf = (first: number | undefined, second: number | undefined): number | undefined =>
  first === undefined || second === undefined ? undefined : (toCenti(first) - toCenti(second)) / 100

function definedOnly(figures: Readonly<Record<string, number | undefined>>): Figures {
  return Object.fromEntries(Object.entries(figures).filter(([, value]) => value !== undefined))
}

function perEyeFigures({ measures, ceiling }: Submission): Figures {
  const { left, right } = measures
  const measured = {
    leftWidth: sumOf(left.left, left.right),
    leftHeight: sumOf(left.up, left.down),
    rightWidth: sumOf(right.left, right.right),
    rightHeight: sumOf(right.up, right.down),
  }
  if (ceiling.source !== 'link') return definedOnly(measured)
  const { totals } = ceiling
  return definedOnly({
    ...measured,
    renderedHorizontal: totals.binocularHorizontal,
    renderedOverlap: totals.binocularHorizontalOverlap,
    renderedLeftWidth: totals.leftHorizontal,
    renderedLeftHeight: totals.leftVertical,
    renderedRightWidth: totals.rightHorizontal,
    renderedRightHeight: totals.rightVertical,
    leftWidthPastRendered: differenceOf(measured.leftWidth, totals.leftHorizontal),
    leftHeightPastRendered: differenceOf(measured.leftHeight, totals.leftVertical),
    rightWidthPastRendered: differenceOf(measured.rightWidth, totals.rightHorizontal),
    rightHeightPastRendered: differenceOf(measured.rightHeight, totals.rightVertical),
  })
}

/** Both eyes' horizontal, vertical and overlap, for angles that all start straight ahead of the head. */
export function bothEyeFiguresOf({ left, right }: EyeMeasures): Figures {
  const leftVertical = sumOf(left.up, left.down)
  const rightVertical = sumOf(right.up, right.down)
  return definedOnly({
    horizontal: sumOf(left.left, right.right),
    vertical: leftVertical === undefined || rightVertical === undefined ? undefined : Math.max(leftVertical, rightVertical),
    overlap: sumOf(left.right, right.left),
  })
}

function bothEyeFigures({ measures, ceiling }: Submission): Figures {
  const measured = bothEyeFiguresOf(measures)
  if (ceiling.source !== 'measured') return measured
  const renderedHorizontal = sumOf(ceiling.left.left, ceiling.right.right)
  return definedOnly({
    ...measured,
    renderedHorizontal,
    renderedOverlap: sumOf(ceiling.left.right, ceiling.right.left),
    horizontalPastRendered: differenceOf(measured.horizontal, renderedHorizontal),
    canting: ceiling.canting,
  })
}

/** The figures a measure adds to its cell, and the site shows for a single measure. */
export function figuresOf(submission: Submission): Figures {
  return submission.tool === 'vrhp' ? perEyeFigures(submission) : bothEyeFigures(submission)
}

function cellOf(submissions: readonly Submission[]): CellStats {
  const accumulators = new Map<string, Accumulator>()
  const add = (prefix: string, values: Readonly<Record<string, number>>): void => {
    for (const [key, degrees] of Object.entries(values)) accumulate(accumulators, `${prefix}${key}`, degrees)
  }
  for (const submission of submissions) {
    add('left:', submission.measures.left)
    add('right:', submission.measures.right)
    add('figure:', figuresOf(submission))
  }
  return {
    left: statsOf(accumulators, 'left:'),
    right: statsOf(accumulators, 'right:'),
    figures: statsOf(accumulators, 'figure:'),
  }
}

/** Rebuilt from all of a headset's pages on every change: a maximum cannot be taken back out. */
export function aggregatePages(tool: Tool, headset: string, pages: readonly Page[]): Aggregate {
  const groups = new Map<string, Submission[]>()
  const submissions = pages.flatMap((page) => Object.values(page.entries).map(({ submission }) => submission))
  for (const submission of submissions) {
    const key = cellKey(submission)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [submission])
    else group.push(submission)
  }
  const cells = Object.fromEntries(
    [...groups].sort(([first], [second]) => first.localeCompare(second)).map(([key, group]) => [key, cellOf(group)]),
  )
  return { version: formatVersion, tool, headset, count: submissions.length, cells }
}

export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/**
 * Pages and lookups grow with every submission and hold most of the published bytes, so their
 * records are written compactly, one per line, which keeps the site small and each change a
 * one-line diff. `frame` holds the other fields; `field` names the record set, written last.
 */
function serializeByLine(frame: Readonly<Record<string, unknown>>, field: string, records: Readonly<Record<string, unknown>>): string {
  const header = `${JSON.stringify(frame).slice(0, -1)},${JSON.stringify(field)}:`
  const lines = Object.entries(records).map(([key, record]) => `${JSON.stringify(key)}:${JSON.stringify(record)}`)
  return lines.length === 0 ? `${header}{}}\n` : `${header}{\n${lines.join(',\n')}\n}}\n`
}

export const serializePage = ({ version, tool, headset, page, entries }: Page): string =>
  serializeByLine({ version, tool, headset, page }, 'entries', entries)

export const serializeLookup = ({ version, lookup, issues }: IssueLookup): string =>
  serializeByLine({ version, lookup }, 'issues', issues)
