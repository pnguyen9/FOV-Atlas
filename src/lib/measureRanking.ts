/**
 * Which single measure comes first among several of one tool and headset: the one the radar draws
 * whole as "highest", and the one each pair of eye figures in the Compare table comes from, so a
 * pair never sets one measure's left eye beside another's right eye.
 *
 * Every ranking is a total order: its figures compared in turn, larger first, a missing figure
 * below any present one, then the newest (highest issue number). The first of any set of measures
 * is then the first of the firsts of its parts, which lets each aggregate cell keep its own and
 * the site combine the cells passing the filters.
 */

import { toCenti } from './degrees.ts'
import { angleOriginOf, type EyeMeasures, type Tool } from './submission.ts'
import type { FigureName } from './submissionStore.ts'

/** The figures of each eye the Compare table shows side by side, left then right. */
export const eyePairs = {
  width: ['leftWidth', 'rightWidth'],
  height: ['leftHeight', 'rightHeight'],
  renderedWidth: ['renderedLeftWidth', 'renderedRightWidth'],
  renderedHeight: ['renderedLeftHeight', 'renderedRightHeight'],
  widthPastRendered: ['leftWidthPastRendered', 'rightWidthPastRendered'],
  heightPastRendered: ['leftHeightPastRendered', 'rightHeightPastRendered'],
} as const satisfies Readonly<Record<string, readonly [FigureName, FigureName]>>
export type EyePair = keyof typeof eyePairs
const pairFigureNames = new Map(Object.entries(eyePairs) as [EyePair, readonly [FigureName, FigureName]][])
export const eyePairNames = [...pairFigureNames.keys()]

/** The left and right eye figure of a pair. */
export function eyePairFigures(pair: EyePair): readonly [FigureName, FigureName] {
  const names = pairFigureNames.get(pair)
  if (names === undefined) throw new Error(`Unknown eye pair ${pair}`)
  return names
}

/** One measure's figures, as `figuresOf` in `submissionStore.ts` works them out. */
export type MeasureFigures = Readonly<Partial<Record<FigureName, number>>>

/**
 * The figures a tool's headline width and height are the larger of: each eye's own for a tool
 * measuring from the centre of each picture, both eyes together for the others. The Compare table
 * leads with the width, and the radar's highest is the measure with the largest.
 */
export function headlineFiguresOf(tool: Tool): { readonly width: readonly FigureName[]; readonly height: readonly FigureName[] } {
  return angleOriginOf(tool) === 'picture' ? { width: eyePairs.width, height: eyePairs.height } : { width: ['horizontal'], height: ['vertical'] }
}

/** One measure's figures by name, for looking them up. */
export type FigureValues = ReadonlyMap<string, number>

function presentOf(values: FigureValues, names: readonly FigureName[]): number[] {
  return names.flatMap((name) => {
    const value = values.get(name)
    return value === undefined ? [] : [value]
  })
}

function largestOf(values: FigureValues, names: readonly FigureName[]): number | undefined {
  const present = presentOf(values, names)
  return present.length === 0 ? undefined : Math.max(...present)
}

/** A measure's headline width (see `headlineFiguresOf`), in degrees. */
export const headlineWidthOf = (tool: Tool, values: FigureValues): number | undefined => largestOf(values, headlineFiguresOf(tool).width)

/** The pairs a tool's measures are ranked for: the width for every tool, every eye pair for a tool that has them. */
export const rankingsFor = (tool: Tool): readonly EyePair[] => (angleOriginOf(tool) === 'picture' ? eyePairNames : ['width'])

/** Figures in hundredths of a degree, so equal figures compare equal; null for a figure the measure lacks. */
export type Rank = readonly (number | null)[]

const centi = (degrees: number | undefined): number | null => (degrees === undefined ? null : toCenti(degrees))

/**
 * A measure's rank in each ranking its tool has. The width: the headline width, then the headline
 * height, then all its angles added up. Every other pair: the larger of its two eye figures, then
 * the other eye's, then all the angles. A pair "past rendered" is a measure minus its own headset's
 * picture, so its first is the measure with the smallest gap.
 */
export function ranksOf(tool: Tool, figures: MeasureFigures, measures: EyeMeasures): Partial<Record<EyePair, Rank>> {
  const angles = [...Object.values(measures.left), ...Object.values(measures.right)]
  const total = angles.reduce((sum, degrees) => sum + toCenti(degrees), 0)
  const values: FigureValues = new Map(Object.entries(figures))
  const headline = headlineFiguresOf(tool)
  const rankOf = (pair: EyePair): Rank => {
    if (pair === 'width') return [centi(largestOf(values, headline.width)), centi(largestOf(values, headline.height)), total]
    const present = presentOf(values, eyePairFigures(pair))
    const other = present.length === 2 ? Math.min(...present) : undefined
    return [centi(largestOf(values, eyePairFigures(pair))), centi(other), total]
  }
  return Object.fromEntries(rankingsFor(tool).map((pair) => [pair, rankOf(pair)]))
}

export interface Ranked {
  readonly rank: Rank
  readonly issue: number
}

/** Whether `first` comes before `second`: the larger rank figures, then the newer issue. */
export function isAhead(first: Ranked, second: Ranked): boolean {
  for (const [place, value] of first.rank.entries()) {
    const other = second.rank.at(place) ?? null
    if (value === other) continue
    if (value === null || other === null) return other === null
    return value > other
  }
  return first.issue > second.issue
}
