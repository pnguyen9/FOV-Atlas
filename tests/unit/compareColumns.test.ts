import { describe, expect, it } from 'vitest'
import { columnsFor, defaultColumnsFor, formatCell, headlineColumnsFor, sortRows, type CompareRow } from '../../src/pages/compare/columns'
import { figuresOfMeasure } from '../../src/lib/fovStats'
import { tools, type Submission } from '../../src/lib/submission'
import { formatDegrees, gazeLabelOf, headsetName, tuningLabelOf } from '../../src/components/measureLabels'
import { atlasBeyond, testHmdQuest, vrhpBeyond, vrhpIndex, wimfovBeyond } from './siteFixtures'

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
  it('gives VR Headset Picker per-eye figures, each against the same eye of its link', () => {
    expect(cellsOf(beyond, 'vrhp')).toMatchObject({
      highestLeftWidth: '97.0°',
      highestRightWidth: '97.0°',
      highestLeftHeight: '96.9°',
      count: '1',
      renderedLeftWidth: '97.0°',
      leftWidthGap: '-0.1°',
      rightWidthGap: '-0.4°',
      leftHeightGap: '0.0°',
      linkHorizontal: '109.2°',
      linkOverlap: '84.3°',
    })
    expect(columnsFor('vrhp').map((column) => column.id)).not.toContain('highestHorizontal')
    expect(columnsFor('vrhp').map((column) => column.id)).not.toContain('highestOverlap')
    expect(cellsOf(index, 'vrhp').leftWidthGap).toBe('—')
  })

  it('gives FOV Atlas its own headset’s rendered horizontal and the gap to it', () => {
    expect(cellsOf(rowOf('Atlas', atlasBeyond), 'atlas')).toMatchObject({
      highestHorizontal: '106.0°',
      renderedHorizontal: '110.0°',
      renderedGap: '4.0°',
    })
  })

  it('gives WIMFOV and TestHMD no rendered columns', () => {
    for (const tool of ['wimfov', 'testhmd'] as const) {
      expect(columnsFor(tool).map((column) => column.id).filter((id) => id.includes('rendered') || id.includes('Gap'))).toEqual([])
    }
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
    const [gap] = columnsFor('vrhp').filter((column) => column.id === 'rightWidthGap')
    if (gap === undefined) throw new Error('no column')
    const quest = rowOf('Quest', testHmdQuest)
    expect(sortRows([quest, beyond, index], gap, true).map((row) => row.name)).toEqual(['Beyond', 'Index', 'Quest'])
    expect(sortRows([index, quest, beyond], gap, false).map((row) => row.name)).toEqual(['Beyond', 'Index', 'Quest'])
    expect(sortRows([broken, quest], gap, true).map((row) => row.name)).toEqual(['Broken', 'Quest'])
    expect(sortRows([beyond, { ...beyond, name: 'Another' }], gap, true).map((row) => row.name)).toEqual(['Another', 'Beyond'])
  })
})

describe('measure labels', () => {
  it('names headsets, tunings and gazes', () => {
    expect(headsetName({ headset: 'other', otherHeadsetName: 'Boba 3' })).toBe('Boba 3')
    expect(headsetName({ headset: 'not-listed', otherHeadsetName: '' })).toBe('not-listed')
    expect(tuningLabelOf('both')).toBe('Modded + tuned')
    expect(gazeLabelOf('free')).toBe('Looked around')
    expect(formatDegrees(undefined)).toBe('—')
    expect(formatDegrees(Number.NaN)).toBe('—')
  })
})
