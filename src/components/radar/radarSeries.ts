/** One shape on the radar: a headset's figures, one measure, or a kept measure. */

import { headsetName } from '../measureLabels.ts'
import { ceilingWords, measureCeiling, modelCeiling, type CeilingEdges } from '../../lib/ceiling.ts'
import { shapeOf, type Combined, type Statistic } from '../../lib/fovStats.ts'
import { borrowedReferenceLabel } from '../../lib/headsets.ts'
import type { EyeMeasure, EyeMeasures, Submission } from '../../lib/submission.ts'

export interface RadarSeries {
  readonly key: string
  /** The legend's text. */
  readonly label: string
  /** The name in the "Looking through" choice. */
  readonly name: string
  /** A colour slot from 1, or `kept` for a kept measure, drawn in the text colour and dashed. */
  readonly colour: number | 'kept'
  /** Null when no measure matches the filters: the series then shows its ceiling only. */
  readonly measures: EyeMeasures | null
  readonly ceiling: CeilingEdges | undefined
  /** Where the ceiling marks come from, for the note under the chart. */
  readonly ceilingNote: string
  /** Completes "Clear: inside …" under "What you see". */
  readonly seeText: string
}

export const colourClass = (colour: RadarSeries['colour']): string => (colour === 'kept' ? 'series-kept' : `series-${String(colour)}`)

interface AggregateSeriesOptions {
  readonly key: string
  /** The legend's name for the group: the headset's name, or "Everyone". */
  readonly name: string
  readonly headset: string
  readonly colour: number
  /** The group's figures after the filters, or null when they couldn't be loaded. */
  readonly combined: Combined | null
  readonly statistic: Statistic
  readonly seeText: string
}

/** Everyone measured on a headset who passes the filters, with the model's reference ceiling. */
export function aggregateSeries({ key, name, headset, colour, combined, statistic, seeText }: AggregateSeriesOptions): RadarSeries {
  const matching = combined !== null && combined.count > 0 ? combined : null
  let label = `${name} · couldn't load`
  if (matching !== null) label = `${name} · ${statistic} (n=${String(matching.count)})`
  else if (combined !== null) label = `${name} · no matching measure`
  const ceiling = modelCeiling(headset)
  const borrowed = borrowedReferenceLabel(headset)
  const reference = borrowed === undefined ? 'hmdq model reference' : `hmdq model reference ${borrowed}`
  return {
    key,
    label,
    name,
    colour,
    measures: matching === null ? null : shapeOf(matching.stats, statistic),
    ceiling,
    ceilingNote:
      ceiling === undefined
        ? `${name}: no model reference recorded`
        : `${name}: ${reference}, full frame (outer edges from its width, inner edges from its overlap)`,
    seeText,
  }
}

/** A kept measure: dashed, with its own ceiling, never part of any group. */
export function keptSeries(kept: Submission): RadarSeries {
  return {
    key: 'kept',
    label: `Kept measure · ${headsetName(kept)} (not published)`,
    name: 'Kept measure',
    colour: 'kept',
    measures: kept.measures,
    ceiling: measureCeiling(kept),
    ceilingNote: `Kept measure: ${ceilingWords(kept)}`,
    seeText: 'the kept measure',
  }
}

/** A series as the chart draws it, for one eye mode. */
export interface ChartCurve {
  readonly key: string
  readonly colourClass: string
  readonly label: string
  readonly shape: EyeMeasure
  readonly filled: boolean
  readonly dashed: boolean
  readonly emphasised: boolean
}

export interface ChartCeiling {
  readonly key: string
  readonly colourClass: string
  readonly edges: EyeMeasure
}
