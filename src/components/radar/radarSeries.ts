/** One shape on the radar: a headset's figures, one measure, or a kept measure. */

import { keptMeasureName } from '../measureLabels.ts'
import { renderedFrameOf, type OutlinePoint, type RenderedFrame } from '../../lib/ceiling.ts'
import { shapeOf, type Combined, type OneEyeValue, type Statistic } from '../../lib/fovStats.ts'
import { averagedHeadFrame, averagedPictureFrame, unitDifference, unitDifferenceWords, type RenderedAverage } from '../../lib/renderedAverage.ts'
import { loadedValue, type Loaded } from '../../lib/siteData.ts'
import { angleOriginOf, showsRenderedAverage, type EyeMeasure, type EyeMeasures, type KeptSubmission, type Submission, type Tool } from '../../lib/submission.ts'

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
  /** A group's mean shape, which the radar can draw beside its main one; null for a single measure. */
  readonly meanMeasures: EyeMeasures | null
  /** The rendered field of view of the series' own headsets, drawn as an outline per eye. */
  readonly rendered: RenderedFrame | undefined
  /** Where the outline comes from, for the note under the chart. */
  readonly renderedNote: string
  /** Said next to the note when units of the series' model report drawing noticeably different pictures. */
  readonly renderedWarning: string | null
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
  readonly tool: Tool
  /** The model's averaged rendered field of view, a loaded null when it has none; null while loading. */
  readonly average: Loaded<RenderedAverage | null> | null
}

const warningOf = (average: RenderedAverage | null): string | null => {
  const difference = average === null ? null : unitDifference(average)
  return difference === null ? null : unitDifferenceWords(difference)
}

function missingAverageNote(name: string, average: Loaded<RenderedAverage | null> | null): string {
  if (average === null) return `${name}: loading the model's averaged rendered field of view…`
  if (!average.ok) return `${name}: the model's averaged rendered field of view couldn't be loaded. Try again in a moment`
  return `${name}: no FOV Atlas measure of this model has read what it draws yet`
}

/**
 * A group's outline: its model's averaged pictures, from the FOV Atlas measures that read their
 * edges, in the tool's own terms: from the centre of each picture or from straight ahead of the
 * head. None for a tool that never shows the average.
 */
function averagedOutline(
  name: string,
  tool: Tool,
  loaded: Loaded<RenderedAverage | null> | null,
): Pick<RadarSeries, 'rendered' | 'renderedNote' | 'renderedWarning'> {
  if (!showsRenderedAverage(tool)) return { rendered: undefined, renderedNote: '', renderedWarning: null }
  const average = loadedValue(loaded)
  const rendered = angleOriginOf(tool) === 'picture' ? averagedPictureFrame(average) : averagedHeadFrame(average)
  const headsets = average?.count ?? 0
  return {
    rendered,
    renderedNote:
      rendered === undefined
        ? missingAverageNote(name, loaded)
        : `${name}: average of ${String(headsets)} ${headsets === 1 ? 'headset' : 'headsets'} of this model, as they report drawing it`,
    renderedWarning: warningOf(average),
  }
}

/**
 * Everyone measured on a headset who passes the filters, with the average of what the model's
 * headsets report drawing. The mean shape goes along for the radar to draw beside the highest.
 */
export function aggregateSeries({ key, name, colour, combined, statistic, seeText, tool, average }: AggregateSeriesOptions): RadarSeries {
  const matching = combined !== null && combined.count > 0 ? combined : null
  let label = `${name} · couldn't load`
  if (matching !== null) label = `${name} · ${statistic} (n=${String(matching.count)})`
  else if (combined !== null) label = `${name} · no matching measure`
  return {
    key,
    label,
    name,
    colour,
    measures: matching === null ? null : shapeOf(matching.stats, statistic),
    meanMeasures: matching === null ? null : shapeOf(matching.stats, 'mean'),
    ...averagedOutline(name, tool, average),
    seeText,
  }
}

/** Words for where a single measure's outline comes from. */
function measureRenderedNote(who: string, submission: Pick<Submission, 'ceiling'>): string {
  if (submission.ceiling.source === 'measured') return `${who}: what the headset reported drawing while measuring`
  if (submission.ceiling.source === 'link') return `${who}: its link gives only totals, set against its own figures`
  return `${who}: the headset's report wasn't read`
}

interface MeasureSeriesOptions extends Pick<RadarSeries, 'key' | 'label' | 'name' | 'colour' | 'seeText'> {
  readonly submission: Pick<Submission, 'measures' | 'ceiling'>
}

/** A single measure, with the outline of what its own headset reported drawing when it has one. */
export function measureSeries({ key, label, name, colour, seeText, submission }: MeasureSeriesOptions): RadarSeries {
  return {
    key,
    label,
    name,
    colour,
    measures: submission.measures,
    meanMeasures: null,
    rendered: renderedFrameOf(submission),
    renderedNote: measureRenderedNote(name, submission),
    renderedWarning: null,
    seeText,
  }
}

/** A kept measure: dashed, with its own headset's outline, never part of any group. */
export const keptSeries = (kept: KeptSubmission): RadarSeries =>
  measureSeries({
    key: 'kept',
    label: `Kept measure · ${keptMeasureName(kept)} (not published)`,
    name: 'Kept measure',
    colour: 'kept',
    seeText: 'the kept measure',
    submission: kept,
  })

/** A series as the chart draws it, for one eye mode. */
export interface ChartCurve {
  readonly key: string
  readonly colourClass: string
  readonly label: string
  readonly shape: EyeMeasure
  /** Angles only one eye has, drawn as marked dots beside an either-eye or both-eyes shape. */
  readonly oneEye: readonly OneEyeValue[]
  readonly filled: boolean
  readonly dashed: boolean
  readonly emphasised: boolean
  /** A group's mean drawn beside its highest: thinner and dash-dotted. */
  readonly mean: boolean
}

/** The outlines of a series' rendered pictures, one per eye shown. */
export interface ChartOutline {
  readonly key: string
  readonly colourClass: string
  readonly outlines: readonly (readonly OutlinePoint[])[]
}
