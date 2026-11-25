import { describe, expect, it } from 'vitest'
import { aggregateSeries, keptSeries, measureSeries } from '../../src/components/radar/radarSeries'
import { combineCells } from '../../src/lib/fovStats'
import { averagedHeadFrame, averagedPictureFrame, renderedAverageOf } from '../../src/lib/renderedAverage'
import { renderedFrameOf } from '../../src/lib/ceiling'
import type { Tool } from '../../src/lib/submission'
import { aggregatePages, emptyPage, withEntry } from '../../src/lib/submissionStore'
import { atlasBeyond, atlasBeyondSecond, vrhpBeyond, wimfovBeyond } from './siteFixtures'

const anyFilters = { eyeDepth: [], noseBridge: [], tuning: [], gaze: [] }
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
    seeText: 'the highest shape',
    tool,
    average: loaded,
  })

describe('aggregateSeries', () => {
  it('outlines a group with its model’s averaged pictures, from the head', () => {
    const series = groupOf('atlas', atlasBeyond, { ok: true, value: average })
    expect(series.rendered).toEqual(averagedHeadFrame(average))
    expect(series.renderedNote).toBe('Beyond: average of 2 headsets of this model, as they report drawing it')
    expect(series.label).toBe('Beyond · highest (n=1)')
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

  it('says when no measure matches, or when the figures could not be loaded', () => {
    const options = { key: 'beyond', name: 'Beyond', colour: 1, statistic: 'mean', seeText: '', tool: 'atlas', average: null } as const
    const empty = aggregateSeries({ ...options, combined: { count: 0, stats: { left: {}, right: {}, figures: {} } } })
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
