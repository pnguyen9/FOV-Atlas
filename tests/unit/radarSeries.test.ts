import { describe, expect, it } from 'vitest'
import { aggregateSeries, keptSeries, measureSeries } from '../../src/components/radar/radarSeries'
import { combineCells, meanShapeOf, type Filters } from '../../src/lib/fovStats'
import { averagedHeadFrame, averagedPictureFrame, renderedAverageOf } from '../../src/lib/renderedAverage'
import { renderedFrameOf } from '../../src/lib/ceiling'
import type { Tool } from '../../src/lib/submission'
import { aggregatePages, emptyPage, withEntry, type ListedEntry } from '../../src/lib/submissionStore'
import { atlasBeyond, atlasBeyondSecond, vrhpBeyond, vrhpBeyondDeepSet, vrhpBeyondThird, wimfovBeyond } from './siteFixtures'

const anyFilters: Filters = { eyeDepth: [], noseBridge: [], tuning: [], gaze: [] }
const average = renderedAverageOf('bigscreen-beyond-2', [atlasBeyond, atlasBeyondSecond])
const combinedOf = (tool: Tool, submission: typeof atlasBeyond) =>
  combineCells(aggregatePages(tool, submission.headset, [withEntry(emptyPage(tool, submission.headset, 0), 1, { author: 'someone', submission })]), anyFilters)

const groupOf = (tool: Tool, submission: typeof atlasBeyond, loaded: Parameters<typeof aggregateSeries>[0]['average']) =>
  aggregateSeries({
    key: 'beyond',
    name: 'Beyond',
    colour: 1,
    combined: combinedOf(tool, submission),
    statistic: 'highest',
    seeText: 'the widest measure',
    tool,
    average: loaded,
  })

describe('aggregateSeries', () => {
  it('outlines a group with its model’s averaged pictures, from the head', () => {
    const series = groupOf('atlas', atlasBeyond, { ok: true, value: average })
    expect(series.rendered).toEqual(averagedHeadFrame(average))
    expect(series.renderedNote).toBe('Beyond: average of 2 headsets of this model, as they report drawing it')
    expect(series.label).toBe('Beyond · widest measure (n=1)')
  })

  it('outlines a VR Headset Picker group from the centre of each picture', () => {
    expect(groupOf('vrhp', vrhpBeyond, { ok: true, value: average }).rendered).toEqual(averagedPictureFrame(average))
  })

  it('never outlines a WIMFOV group, even with an average at hand', () => {
    const series = groupOf('wimfov', wimfovBeyond, { ok: true, value: average })
    expect(series.rendered).toBeUndefined()
    expect(series.renderedNote).toBe('')
    expect(series.renderedWarning).toBeNull()
  })

  it.each([
    ['while it loads', null, "Beyond: loading the model's averaged rendered field of view…"],
    ['when it fails', { ok: false, error: 'network' } as const, "Beyond: the model's averaged rendered field of view couldn't be loaded. Try again in a moment"],
    ['when the model has none', { ok: true, value: null } as const, 'Beyond: no FOV Atlas measure of this model has read what it draws yet'],
  ])('says why there is no outline %s', (_description, loaded, note) => {
    const series = groupOf('atlas', atlasBeyond, loaded)
    expect(series.rendered).toBeUndefined()
    expect(series.renderedNote).toBe(note)
  })

  describe('the highest', () => {
    const listed: ListedEntry[] = [
      { issue: 3, entry: { author: 'third', submission: vrhpBeyondThird } },
      { issue: 2, entry: { author: 'deep', submission: vrhpBeyondDeepSet } },
      { issue: 1, entry: { author: 'first', submission: vrhpBeyond } },
    ]
    const page = listed.reduce((built, { issue, entry }) => withEntry(built, issue, entry), emptyPage('vrhp', 'bigscreen-beyond-2', 0))
    const aggregate = aggregatePages('vrhp', 'bigscreen-beyond-2', [page])
    const combined = combineCells(aggregate, anyFilters)
    const highestOf = (filters: Filters) =>
      aggregateSeries({ key: 'beyond', name: 'Beyond', colour: 1, combined: combineCells(aggregate, filters), statistic: 'highest', seeText: '', tool: 'vrhp', average: null })

    it('draws one whole measure, the widest, and names it', () => {
      const series = highestOf(anyFilters)
      expect(series.measures).toEqual(vrhpBeyond.measures)
      expect(series.drawn).toEqual({ issue: 1, author: 'first' })
      expect(series.label).toBe('Beyond · widest measure (n=3)')
      expect(series.meanMeasures).toEqual(meanShapeOf(combined.stats))
    })

    it('picks among the measures the filters let through', () => {
      const series = highestOf({ ...anyFilters, gaze: ['free'] })
      expect([series.drawn, series.measures]).toEqual([{ issue: 2, author: 'deep' }, vrhpBeyondDeepSet.measures])
      expect(highestOf({ ...anyFilters, gaze: ['fixed'], eyeDepth: ['deep-set'] }).drawn).toBeNull()
    })
  })

  it('draws the mean of each direction, naming no single measure', () => {
    const combined = combinedOf('vrhp', vrhpBeyond)
    const series = aggregateSeries({ key: 'beyond', name: 'Beyond', colour: 1, combined, statistic: 'mean', seeText: '', tool: 'vrhp', average: null })
    expect([series.label, series.measures, series.drawn]).toEqual(['Beyond · mean (n=1)', meanShapeOf(combined.stats), null])
  })

  it('says when no measure matches, or when the figures could not be loaded', () => {
    const options = { key: 'beyond', name: 'Beyond', colour: 1, statistic: 'mean', seeText: '', tool: 'atlas', average: null } as const
    const empty = aggregateSeries({ ...options, combined: { count: 0, stats: { left: {}, right: {}, figures: {}, leaders: {} } } })
    expect([empty.label, empty.measures]).toEqual(['Beyond · no matching measure', null])
    expect(aggregateSeries({ ...options, combined: null }).label).toBe("Beyond · couldn't load")
  })
})

describe('measureSeries', () => {
  it('outlines a single measure with what its own headset reported', () => {
    const series = measureSeries({ key: '7', label: 'someone · issue #7', name: 'someone #7', colour: 2, seeText: 'it', submission: atlasBeyond })
    expect(series.rendered).toEqual(renderedFrameOf(atlasBeyond))
    expect(series.renderedNote).toBe('someone #7: what the headset reported drawing while measuring')
    expect(series.meanMeasures).toBeNull()
  })

  it.each([
    [vrhpBeyond, 'Kept measure: its link gives only totals, set against its own figures'],
    [wimfovBeyond, "Kept measure: the headset's report wasn't read"],
  ])('words where a kept measure’s outline comes from', (submission, note) => {
    expect(keptSeries(submission).renderedNote).toBe(note)
  })
})
