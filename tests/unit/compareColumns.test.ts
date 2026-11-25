import { describe, expect, it } from 'vitest'
import {
  cellParts,
  columnsFor,
  defaultColumnsFor,
  formatCell,
  headlineColumnsFor,
  headlineWidthOfRow,
  measureListColumnsFor,
  sortRows,
  type CompareRow,
} from '../../src/pages/compare/columns'
import { eyeDepthOptions, faceFitLabelOf, faceFitOptionOf } from '../../src/components/faceFit'
import { combineCells, figuresOfCombined, figuresOfMeasure } from '../../src/lib/fovStats'
import { aggregatePages, emptyPage, withEntry } from '../../src/lib/submissionStore'
import { tools, type Submission } from '../../src/lib/submission'
import { gazeLabelOf, headsetName, tuningLabelOf } from '../../src/components/measureLabels'
import { renderedAverageOf } from '../../src/lib/renderedAverage'
import { atlasBeyond, atlasBeyondSecond, testHmdQuest, vrhpBeyond, vrhpIndex, wimfovBeyond } from './siteFixtures'

const rowOf = (key: string, submission: Submission): CompareRow => ({
  key,
  headset: submission.headset,
  name: key,
  figures: figuresOfMeasure(submission),
  total: 1,
})
const index = rowOf('Index', vrhpIndex)
const beyond = rowOf('Beyond', vrhpBeyond)
const broken: CompareRow = { ...beyond, key: 'Broken', name: 'Broken', figures: null }
const cellsOf = (row: CompareRow, tool: typeof tools[number]): Record<string, string> =>
  Object.fromEntries(columnsFor(tool).map((column) => [column.id, formatCell(column, row)]))

describe('Compare columns', () => {
  const averaged = renderedAverageOf('bigscreen-beyond-2', [atlasBeyond, atlasBeyondSecond])

  it('gives VR Headset Picker per-eye figures, left / right, each against the same eye of its link', () => {
    expect(cellsOf(beyond, 'vrhp')).toMatchObject({
      highestWidth: '97.0° / 95.8°',
      highestHeight: '96.9° / 96.7°',
      count: '1',
      renderedWidth: '97.0° / 96.6°',
      widthGap: '0.0° / 0.9°',
      heightGap: '0.0° / 0.0°',
      renderedHorizontal: '109.2°',
      linkOverlap: '84.3°',
      averagedWidth: '—',
    })
    expect(columnsFor('vrhp').find((column) => column.id === 'renderedHorizontal')?.label).toBe('Rendered horizontal (link)')
    expect(columnsFor('atlas').find((column) => column.id === 'renderedHorizontal')?.label).toBe('Rendered horizontal')
    expect(columnsFor('vrhp').map((column) => column.id)).not.toContain('highestHorizontal')
    expect(columnsFor('vrhp').map((column) => column.id)).not.toContain('highestOverlap')
    expect(cellsOf(index, 'vrhp').widthGap).toBe('—')
    expect(cellsOf({ ...index, figures: { ...figuresOfMeasure(vrhpIndex), pairs: new Map() } }, 'vrhp').highestWidth).toBe('—')
  })

  it('takes both eyes of a pair from one measure, the one leading the pair', () => {
    const lopsided: Submission = {
      ...vrhpBeyond,
      measures: { left: { left: 40, right: 40, up: 45, down: 45 }, right: { left: 40, right: 60, up: 40, down: 40 } },
    }
    const page = withEntry(withEntry(emptyPage('vrhp', 'bigscreen-beyond-2', 0), 1, { author: 'even', submission: vrhpBeyond }), 2, {
      author: 'lopsided',
      submission: lopsided,
    })
    const anyFilters = { eyeDepth: [], noseBridge: [], tuning: [], gaze: [] }
    const combined = combineCells(aggregatePages('vrhp', 'bigscreen-beyond-2', [page]), anyFilters)
    const group = { ...beyond, figures: figuresOfCombined(combined) }
    expect(cellsOf(group, 'vrhp')).toMatchObject({
      highestWidth: '80.0° / 100.0°',
      highestHeight: '96.9° / 96.7°',
      widthGap: '16.9° / -3.4°',
      renderedWidth: '97.0° / 96.6°',
    })
    expect(cellsOf({ ...group, averaged }, 'vrhp').averagedWidthGap).toBe('17.0° / -3.0°')
    expect(headlineWidthOfRow('vrhp', group)).toBe(100)
    expect(headlineWidthOfRow('vrhp', broken)).toBeUndefined()
    expect(headlineWidthOfRow('atlas', rowOf('Atlas', atlasBeyond))).toBe(106)
  })

  it('sets VR Headset Picker figures against the model’s averaged pictures, per eye', () => {
    expect(cellsOf({ ...beyond, averaged }, 'vrhp')).toMatchObject({
      averagedWidth: '97.0° / 97.0°',
      averagedHeight: '98.3° / 98.3°',
      averagedWidthGap: '0.0° / 1.3°',
    })
  })

  it('shows one eye’s figure when only it exists, sorting by it', () => {
    const [width] = columnsFor('vrhp')
    const ownFigures = figuresOfMeasure(vrhpBeyond)
    const leftOnly: CompareRow = {
      ...beyond,
      figures: { ...ownFigures, pairs: new Map([...ownFigures.pairs, ['width', new Map([['leftWidth', 90]])]]) },
    }
    expect(width === undefined ? '' : formatCell(width, leftOnly)).toBe('90.0° / —')
    expect(width?.value(leftOnly)).toBe(90)
  })

  it('gives TestHMD and FOV Atlas the model’s averaged rendered horizontal and the gap to it', () => {
    expect(cellsOf({ ...rowOf('Quest', testHmdQuest), averaged }, 'testhmd')).toMatchObject({
      averagedHorizontal: '110.4°',
      averagedGap: '10.4°',
    })
    expect(cellsOf(rowOf('Quest', testHmdQuest), 'testhmd').averagedHorizontal).toBe('—')
    expect(cellsOf({ ...rowOf('Atlas', atlasBeyond), averaged }, 'atlas').averagedGap).toBe('4.4°')
    expect(defaultColumnsFor('testhmd')).toContain('averagedHorizontal')
  })

  it('gives FOV Atlas its own headset’s rendered horizontal and the gap to it', () => {
    expect(cellsOf(rowOf('Atlas', atlasBeyond), 'atlas')).toMatchObject({
      highestHorizontal: '106.0°',
      renderedHorizontal: '110.0°',
      renderedGap: '4.0°',
    })
  })

  it('gives WIMFOV no rendered columns, and TestHMD only the model’s average', () => {
    const renderedIds = (tool: typeof tools[number]): string[] =>
      columnsFor(tool)
        .map((column) => column.id)
        .filter((id) => id.includes('rendered') || id.includes('Gap') || id.includes('averaged'))
    expect(renderedIds('wimfov')).toEqual([])
    expect(renderedIds('testhmd')).toEqual(['averagedHorizontal', 'averagedGap'])
    expect(cellsOf(rowOf('WIMFOV', wimfovBeyond), 'wimfov').overlapShare).toBe('76.4 %')
  })

  it('shows only columns the tool has, and leads headset pages with a few of them', () => {
    for (const tool of tools) {
      const available = columnsFor(tool).map((column) => column.id)
      expect(defaultColumnsFor(tool).every((id) => available.includes(id))).toBe(true)
      expect(headlineColumnsFor(tool).every((column) => available.includes(column.id))).toBe(true)
    }
    expect(columnsFor('vrhp').map((column) => formatCell(column, broken)).every((cell) => cell === '—')).toBe(true)
  })

  it('sorts either way, rows without the figure last, ties by name', () => {
    const [gap] = columnsFor('vrhp').filter((column) => column.id === 'widthGap')
    if (gap === undefined) throw new Error('no column')
    const quest = rowOf('Quest', testHmdQuest)
    expect(sortRows([quest, beyond, index], gap, true).map((row) => row.name)).toEqual(['Beyond', 'Index', 'Quest'])
    expect(sortRows([index, quest, beyond], gap, false).map((row) => row.name)).toEqual(['Beyond', 'Index', 'Quest'])
    expect(sortRows([broken, quest], gap, true).map((row) => row.name)).toEqual(['Broken', 'Quest'])
    expect(sortRows([beyond, { ...beyond, name: 'Another' }], gap, true).map((row) => row.name)).toEqual(['Another', 'Beyond'])
  })
})

describe('measure list columns', () => {
  const listOf = (row: CompareRow, tool: typeof tools[number]): [string, string, string[]][] =>
    measureListColumnsFor(tool).map((column) => [column.label, column.title, cellParts(column, row)])

  it('lists each single measure’s figures in short words, both eyes apart', () => {
    expect(listOf(beyond, 'vrhp')).toEqual([
      ['Width L / R', 'Width of the left eye / the right eye', ['97.0°', '95.8°']],
      ['Height L / R', 'Height of the left eye / the right eye', ['96.9°', '96.7°']],
      [
        'Gap L / R',
        'Width of each eye’s picture, as the link reports it, minus the width measured; left eye / right eye',
        ['0.0°', '0.9°'],
      ],
    ])
    expect(listOf(index, 'vrhp').at(-1)?.[2]).toEqual(['—', '—'])
  })

  it('lists both eyes’ figures for the tools measuring from the head', () => {
    expect(measureListColumnsFor('atlas').map((column) => column.label)).toEqual(['Horiz.', 'Vert.', 'Overlap', 'Gap'])
    expect(measureListColumnsFor('wimfov').map((column) => column.label)).toEqual(['Horiz.', 'Vert.', 'Overlap'])
    expect(measureListColumnsFor('testhmd').map((column) => column.label)).toEqual(['Horiz.', 'Vert.'])
    expect(listOf(rowOf('Quest', testHmdQuest), 'testhmd').map(([, , parts]) => parts)).toEqual(
      measureListColumnsFor('testhmd').map((column) => [formatCell(column, rowOf('Quest', testHmdQuest))]),
    )
  })
})

describe('face fit labels', () => {
  it('words an answer, or nothing while it isn’t given', () => {
    expect(faceFitLabelOf(eyeDepthOptions, 'deep-set')).toBe('Deep-set')
    expect(faceFitLabelOf(eyeDepthOptions, null)).toBe('')
    expect(faceFitOptionOf(eyeDepthOptions, 'almost-flush')?.hint).toBe('Eyes and brow almost level')
  })
})

describe('measure labels', () => {
  it('names headsets, tunings and gazes', () => {
    expect(headsetName({ headset: 'other', otherHeadsetName: 'Boba 3' })).toBe('Boba 3')
    expect(headsetName({ headset: 'not-listed', otherHeadsetName: '' })).toBe('not-listed')
    expect(tuningLabelOf('both')).toBe('Modded + tuned')
    expect(gazeLabelOf('free')).toBe('Looked around')
  })
})
