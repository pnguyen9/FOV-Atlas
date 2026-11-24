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
import type { EyeMeasure, Submission, Tool } from '../../src/lib/submission.ts'

const vrhpEye = (temporal: number, nasal: number, up: number, down: number, diagonal: number): Submission['measures'] => ({
  left: { left: temporal, right: nasal, up, down, 'down-left': diagonal },
  right: { left: nasal, right: temporal, up, down, 'up-right': diagonal - 4 },
})

const base: Submission = {
  tool: 'vrhp',
  headset: 'bigscreen-beyond-2',
  otherHeadsetName: '',
  measures: vrhpEye(55, 42, 43, 53.9, 59),
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

export const vrhpBeyond: Submission = { ...base, measures: vrhpEye(55, 42, 43, 53.9, 59) }
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
  { tool: 'atlas', headset: 'bigscreen-beyond-2', pages: [pageOf('atlas', 'bigscreen-beyond-2', 0, [[9, { author: 'delta-pilot', submission: atlasBeyond }]])] },
]

/**
 * The site's data files by path below the site root. `htc-vive` is listed in the index for VR
 * Headset Picker, but its files are missing, as when a deploy is half done.
 */
export function siteFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const headsets = new Map<Tool, Map<string, { count: number; pages: number }>>()
  for (const { tool, headset, pages } of headsetData) {
    const aggregate = aggregatePages(tool, headset, pages)
    files.set(`data/aggregates/${tool}/${headset}.json`, serialize(aggregate))
    for (const page of pages) files.set(`data/submissions/${tool}/${headset}/${String(page.page)}.json`, serializePage(page))
    const byHeadset = headsets.get(tool) ?? new Map<string, { count: number; pages: number }>()
    byHeadset.set(headset, { count: aggregate.count, pages: pages.length })
    headsets.set(tool, byHeadset)
  }
  headsets.get('vrhp')?.set('htc-vive', { count: 1, pages: 1 })
  const index = { version: 1, headsets: Object.fromEntries([...headsets].map(([tool, byHeadset]) => [tool, Object.fromEntries(byHeadset)])) }
  files.set('data/index.json', serialize(index))
  return files
}
