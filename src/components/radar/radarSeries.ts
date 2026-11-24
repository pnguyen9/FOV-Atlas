/** One shape on the radar: a headset's figures, one measure, or a kept measure. */

import { headsetName } from '../measureLabels.ts'
import { renderedFrameOf, type OutlinePoint, type RenderedFrame } from '../../lib/ceiling.ts'
import { renderedFrameOfCombined, shapeOf, type Combined, type Statistic } from '../../lib/fovStats.ts'
import type { EyeMeasure, EyeMeasures, Submission } from '../../lib/submission.ts'

export interface RadarSeries {
  readonly key: string
  /** The legend's text. */
  readonly label: string
  /** The name in the "Looking through" choice. */
  readonly name: string
  /** A colour slot from 1, or `kept` for a kept measure, drawn in the text colour and dashed. */
  readonly colour: number | 'kept'
  /** Null when no measure matches the filters. */
  readonly measures: EyeMeasures | null
  /** The rendered field of view of the series' own headsets, drawn as an outline per eye. */
  readonly rendered: RenderedFrame | undefined
  /** Where the outline comes from, for the note under the chart. */
  readonly renderedNote: string
  /** Completes "Clear: inside …" under "What you see". */
  readonly seeText: string
}

export const colourClass = (colour: RadarSeries['colour']): string => (colour === 'kept' ? 'series-kept' : `series-${String(colour)}`)

interface AggregateSeriesOptions {
  readonly key: string
  /** The legend's name for the group: the headset's name, or "Everyone". */
  readonly name: string
  readonly colour: number
  /** The group's figures after the filters, or null when they couldn't be loaded. */
  readonly combined: Combined | null
  readonly statistic: Statistic
  readonly seeText: string
}

/** Everyone measured on a headset who passes the filters, with what their own headsets draw. */
export function aggregateSeries({ key, name, colour, combined, statistic, seeText }: AggregateSeriesOptions): RadarSeries {
  const matching = combined !== null && combined.count > 0 ? combined : null
  let label = `${name} · couldn't load`
  if (matching !== null) label = `${name} · ${statistic} (n=${String(matching.count)})`
  else if (combined !== null) label = `${name} · no matching measure`
  const rendered = matching === null ? undefined : renderedFrameOfCombined(matching, statistic)
  return {
    key,
    label,
    name,
    colour,
    measures: matching === null ? null : shapeOf(matching.stats, statistic),
    rendered,
    renderedNote:
      rendered === undefined
        ? `${name}: no headset reported what it draws`
        : `${name}: what the measurers' own headsets report drawing (${statistic} of each edge)`,
    seeText,
  }
}

/** Words for where a single measure's outline comes from. */
export function measureRenderedNote(who: string, submission: Submission): string {
  return submission.ceiling.source === 'measured'
    ? `${who}: what the headset reported drawing while measuring`
    : `${who}: the headset's report wasn't read`
}

/** A kept measure: dashed, with its own headset's outline, never part of any group. */
export function keptSeries(kept: Submission): RadarSeries {
  return {
    key: 'kept',
    label: `Kept measure · ${headsetName(kept)} (not published)`,
    name: 'Kept measure',
    colour: 'kept',
    measures: kept.measures,
    rendered: renderedFrameOf(kept),
    renderedNote: measureRenderedNote('Kept measure', kept),
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

/** The outlines of a series' rendered pictures, one per eye shown. */
export interface ChartOutline {
  readonly key: string
  readonly colourClass: string
  readonly outlines: readonly (readonly OutlinePoint[])[]
}
