import { describe, expect, it } from 'vitest'
import { columns, formatCell, sortRows, type CompareRow } from '../../src/pages/compare/columns'
import { figuresOfMeasure } from '../../src/lib/fovStats'
import { referenceConfigurationOf } from '../../src/lib/headsets'
import { formatDegrees, gazeLabelOf, headsetName, tuningLabelOf } from '../../src/components/measureLabels'
import { testHmdQuest, vrhpBeyond, vrhpIndex } from './siteFixtures'

const rowOf = (key: string, submission: typeof vrhpBeyond): CompareRow => ({
  key,
  headset: submission.headset,
  name: key,
  figures: figuresOfMeasure(submission.measures),
  total: 1,
  reference: referenceConfigurationOf(submission.headset),
})
const index = rowOf('Index', vrhpIndex)
const beyond = rowOf('Beyond', vrhpBeyond)
const quest = rowOf('Quest', testHmdQuest)
const broken: CompareRow = { ...beyond, key: 'Broken', name: 'Broken', figures: null, reference: undefined }

describe('Compare columns', () => {
  it('formats every column of a measure', () => {
    expect(columns.map((column) => formatCell(column, index))).toEqual([
      '116.0°', '102.0°', '62.0°', '90.0°', '77.6 %', '1',
      '116.0°', '0.0°', '102.0°', '0.0°', '90.0°', '0.0°', '108.1°', '-7.9°',
    ])
    expect(columns.map((column) => formatCell(column, broken)).every((cell) => cell === '—')).toBe(true)
  })

  it('sorts either way, rows without the figure last, ties by name', () => {
    const [overlap] = columns.filter((column) => column.id === 'highestOverlap')
    if (overlap === undefined) throw new Error('no column')
    expect(sortRows([quest, beyond, index], overlap, true).map((row) => row.name)).toEqual(['Index', 'Beyond', 'Quest'])
    expect(sortRows([quest, index, beyond], overlap, false).map((row) => row.name)).toEqual(['Beyond', 'Index', 'Quest'])
    expect(sortRows([broken, quest], overlap, true).map((row) => row.name)).toEqual(['Broken', 'Quest'])
    expect(sortRows([index, { ...index, name: 'Another' }], overlap, true).map((row) => row.name)).toEqual(['Another', 'Index'])
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
