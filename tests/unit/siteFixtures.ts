/**
 * A small published site for the Compare and headset page tests: several tools, headsets and
 * pages, built with the store's own functions. Also written out by hand for looking at the built
 * pages in a browser; it is never part of `public/data`.
 */

import {
  aggregatePages,
  emptyPage,
  serialize,
  serializePage,
  withEntry,
  type Page,
  type StoredEntry,
} from '../../src/lib/submissionStore.ts'
import { renderedAverageOf } from '../../src/lib/renderedAverage.ts'
import type { EyeMeasure, Submission, Tool } from '../../src/lib/submission.ts'

const vrhpEye = (temporal: number, nasal: number, up: number, down: number, diagonal: number): Submission['measures'] => ({
  left: { left: temporal, right: nasal, up, down, 'down-left': diagonal },
  right: { left: nasal, right: temporal, up, down, 'up-right': diagonal - 4 },
})

/**
 * The real Bigscreen Beyond 2 link: VR Headset Picker stops each angle at the edge it draws, so
 * each eye's width and height stay within the link's totals (the left eye's width equals them).
 */
const realBeyondMeasures: Submission['measures'] = {
  left: { left: 54.98, right: 41.97, up: 43.04, down: 53.89, 'down-left': 59.04 },
  right: { left: 41.49, right: 54.26, up: 44.17, down: 52.5, 'up-right': 52.03 },
}

const base: Submission = {
  tool: 'vrhp',
  headset: 'bigscreen-beyond-2',
  otherHeadsetName: '',
  measures: realBeyondMeasures,
  ceiling: {
    source: 'link',
    totals: {
      leftHorizontal: 96.95,
      leftVertical: 96.93,
      rightHorizontal: 96.62,
      rightVertical: 96.67,
      binocularHorizontal: 109.24,
      binocularHorizontalOverlap: 84.33,
      binocularVertical: 98.06,
      binocularVerticalOverlap: 95.54,
      binocularDiagonal: 122.66,
    },
  },
  cornerMask: 'unknown',
  provenance: { input: 'link', linkData: 'BAeG' },
  reportedHeadset: 'Bigscreen Beyond 2',
  face: { eyeDepth: 'almost-flush', noseBridge: 'in-between' },
  tuning: { physicallyModded: false, driverTuned: false, details: '' },
  gaze: 'fixed',
  ipd: 65,
  facialInterface: 'Studioform 3 mm cushion',
  note: '',
}

export const vrhpBeyond: Submission = base
export const vrhpBeyondDeepSet: Submission = {
  ...base,
  measures: vrhpEye(51, 40, 41, 50, 55),
  face: { eyeDepth: 'deep-set', noseBridge: 'high' },
  tuning: { physicallyModded: true, driverTuned: false, details: 'Thinner cushion' },
  gaze: 'free',
  ipd: null,
  facialInterface: '',
  ceiling: { source: 'none' },
}
export const vrhpBeyondThird: Submission = { ...vrhpBeyond, measures: vrhpEye(53, 41, 42, 52, 57) }
export const vrhpIndex: Submission = {
  ...base,
  headset: 'valve-index',
  reportedHeadset: '',
  measures: vrhpEye(58, 45, 50, 52, 62),
  ceiling: { source: 'none' },
}

const wimfovEye = (scale: number): EyeMeasure => ({
  'up': 41 * scale, 'up-left': 52 * scale, 'left': 54 * scale, 'down-left': 62 * scale,
  'down': 52 * scale, 'down-right': 47 * scale, 'right': 40 * scale, 'up-right': 38 * scale,
  'up-up-left': 47 * scale, 'left-down-left': 58 * scale,
})
export const wimfovBeyond: Submission = {
  ...base,
  tool: 'wimfov',
  measures: { left: wimfovEye(1), right: { ...wimfovEye(1), left: 41, right: 52 } },
  ceiling: { source: 'none' },
  provenance: { input: 'paste', linkData: null },
}

export const testHmdQuest: Submission = {
  ...base,
  tool: 'testhmd',
  headset: 'meta-quest-2',
  measures: { left: { left: 50, up: 47, down: 47 }, right: { right: 50, up: 47, down: 47 } },
  ceiling: { source: 'none' },
  provenance: { input: 'typed', linkData: null },
}

export const atlasBeyond: Submission = {
  ...wimfovBeyond,
  tool: 'atlas',
  ceiling: {
    source: 'measured',
    left: { left: 55, right: 42, up: 44.2, down: 54 },
    right: { left: 42, right: 55, up: 44.2, down: 54 },
    canting: 0,
  },
  cornerMask: 'on',
  provenance: { input: 'measured', linkData: null },
}

/** Read a little differently by another unit of the same model. */
export const atlasBeyondSecond: Submission = {
  ...atlasBeyond,
  ceiling: {
    source: 'measured',
    left: { left: 55.4, right: 41.6, up: 44, down: 54.3 },
    right: { left: 41.6, right: 55.4, up: 44, down: 54.3 },
    canting: 0,
  },
  face: { eyeDepth: 'in-between', noseBridge: 'low' },
}

/** Driver tuning widened what this one drew, so it stays out of the model's average. */
export const atlasBeyondTuned: Submission = {
  ...atlasBeyond,
  ceiling: {
    source: 'measured',
    left: { left: 60, right: 45, up: 47, down: 57 },
    right: { left: 45, right: 60, up: 47, down: 57 },
    canting: 0,
  },
  tuning: { physicallyModded: false, driverTuned: true, details: 'Wide mode' },
}

/** Two Valve Index units whose pictures differ by several degrees, each turned outward. */
export const atlasIndex: Submission = {
  ...atlasBeyond,
  headset: 'valve-index',
  reportedHeadset: '',
  measures: { left: wimfovEye(1.05), right: { ...wimfovEye(1.05), left: 43, right: 56.7 } },
  ceiling: {
    source: 'measured',
    left: { left: 62, right: 48, up: 50, down: 52 },
    right: { left: 48, right: 62, up: 50, down: 52 },
    canting: 5,
  },
}
export const atlasIndexWider: Submission = {
  ...atlasIndex,
  ceiling: {
    source: 'measured',
    left: { left: 67, right: 51, up: 53, down: 55 },
    right: { left: 51, right: 67, up: 53, down: 55 },
    canting: 5,
  },
  gaze: 'free',
}

function pageOf(tool: Tool, headset: string, pageNumber: number, entries: readonly (readonly [number, StoredEntry])[]): Page {
  return entries.reduce((page, [issue, entry]) => withEntry(page, issue, entry), emptyPage(tool, headset, pageNumber))
}

interface HeadsetData {
  readonly tool: Tool
  readonly headset: string
  readonly pages: readonly Page[]
}

const headsetData: readonly HeadsetData[] = [
  {
    tool: 'vrhp',
    headset: 'bigscreen-beyond-2',
    pages: [
      pageOf('vrhp', 'bigscreen-beyond-2', 0, [
        [3, { author: 'lens-fox', submission: vrhpBeyond }],
        [5, { author: 'quiet-owl', submission: vrhpBeyondDeepSet }],
      ]),
      pageOf('vrhp', 'bigscreen-beyond-2', 1, [[12, { author: 'nova-wren', submission: vrhpBeyondThird }]]),
    ],
  },
  { tool: 'vrhp', headset: 'valve-index', pages: [pageOf('vrhp', 'valve-index', 0, [[4, { author: 'amber-kite', submission: vrhpIndex }]])] },
  {
    tool: 'wimfov',
    headset: 'bigscreen-beyond-2',
    pages: [pageOf('wimfov', 'bigscreen-beyond-2', 0, [[6, { author: 'lens-fox', submission: wimfovBeyond }]])],
  },
  { tool: 'testhmd', headset: 'meta-quest-2', pages: [pageOf('testhmd', 'meta-quest-2', 0, [[7, { author: 'fern-moth', submission: testHmdQuest }]])] },
  {
    tool: 'atlas',
    headset: 'bigscreen-beyond-2',
    pages: [
      pageOf('atlas', 'bigscreen-beyond-2', 0, [
        [9, { author: 'delta-pilot', submission: atlasBeyond }],
        [10, { author: 'quiet-owl', submission: atlasBeyondSecond }],
        [11, { author: 'amber-kite', submission: atlasBeyondTuned }],
      ]),
    ],
  },
  {
    tool: 'atlas',
    headset: 'valve-index',
    pages: [
      pageOf('atlas', 'valve-index', 0, [
        [13, { author: 'amber-kite', submission: atlasIndex }],
        [14, { author: 'fern-moth', submission: atlasIndexWider }],
      ]),
    ],
  },
]

/**
 * The site's data files by path below the site root. `htc-vive` is listed in the index for VR
 * Headset Picker, but its files are missing, as when a deploy is half done.
 */
export function siteFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const headsets = new Map<Tool, Map<string, { count: number; pages: number }>>()
  const rendered = new Map<string, number>()
  for (const { tool, headset, pages } of headsetData) {
    const average =
      tool === 'atlas' ? renderedAverageOf(headset, pages.flatMap((page) => Object.values(page.entries).map((entry) => entry.submission))) : null
    if (average !== null) {
      files.set(`data/rendered/${headset}.json`, serialize(average))
      rendered.set(headset, average.count)
    }
    const aggregate = aggregatePages(tool, headset, pages)
    files.set(`data/aggregates/${tool}/${headset}.json`, serialize(aggregate))
    for (const page of pages) files.set(`data/submissions/${tool}/${headset}/${String(page.page)}.json`, serializePage(page))
    const byHeadset = headsets.get(tool) ?? new Map<string, { count: number; pages: number }>()
    byHeadset.set(headset, { count: aggregate.count, pages: pages.length })
    headsets.set(tool, byHeadset)
  }
  headsets.get('vrhp')?.set('htc-vive', { count: 1, pages: 1 })
  const index = {
    version: 1,
    headsets: Object.fromEntries([...headsets].map(([tool, byHeadset]) => [tool, Object.fromEntries(byHeadset)])),
    rendered: Object.fromEntries(rendered),
  }
  files.set('data/index.json', serialize(index))
  return files
}
