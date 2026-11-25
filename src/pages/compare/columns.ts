/**
 * The Compare table's columns: one tool's figures per headset. Each tool has its own set, because
 * each starts its angles from its own point: VR Headset Picker's figures are per eye, and only the
 * tools that carry the rendered field of view of the measurers' own headsets have rendered columns.
 * FOV Atlas, VR Headset Picker and TestHMD also get the model's averaged rendered field of view
 * (`renderedAverage.ts`) as a reference, in each tool's own terms; WIMFOV has its own standard.
 */

import { formatDegrees } from '../../lib/degrees.ts'
import type { Figures, Summary } from '../../lib/fovStats.ts'
import { eyePairFigures, headlineWidthOf, type EyePair } from '../../lib/measureRanking.ts'
import { renderedMean, type RenderedAverage, type RenderedValueName } from '../../lib/renderedAverage.ts'
import type { Tool } from '../../lib/submission.ts'
import type { FigureName } from '../../lib/submissionStore.ts'

export interface CompareRow {
  /** The headset id, or `kept` for a kept measure. */
  readonly key: string
  readonly headset: string
  readonly name: string
  /** Null when the headset's figures couldn't be loaded. */
  readonly figures: Figures | null
  /** All of the headset's measures with this tool, filters aside. */
  readonly total: number
  /** The model's averaged rendered field of view; null or left out when it has none. */
  readonly averaged?: RenderedAverage | null
}

export const compareColumnIds = [
  'highestHorizontal',
  'highestVertical',
  'highestWidth',
  'highestHeight',
  'diagonal',
  'highestOverlap',
  'overlapShare',
  'count',
  'meanHorizontal',
  'sigmaHorizontal',
  'meanVertical',
  'sigmaVertical',
  'meanOverlap',
  'sigmaOverlap',
  'meanWidth',
  'meanHeight',
  'renderedHorizontal',
  'renderedGap',
  'renderedWidth',
  'renderedHeight',
  'widthGap',
  'heightGap',
  'linkOverlap',
  'averagedHorizontal',
  'averagedGap',
  'averagedWidth',
  'averagedHeight',
  'averagedWidthGap',
  'averagedHeightGap',
] as const
export type CompareColumnId = (typeof compareColumnIds)[number]

export interface Column {
  readonly id: CompareColumnId
  readonly label: string
  readonly title: string
  readonly unit: '°' | '%' | ''
  /** What the column sorts by. */
  readonly value: (row: CompareRow) => number | undefined
  /** The cell's text, when it shows more than `value`. */
  readonly display?: (row: CompareRow) => string
  /** The left and right eye's figures of a column showing both in one cell. */
  readonly pair?: readonly [Column['value'], Column['value']]
}

const summaryOf = (row: CompareRow, figure: FigureName): Summary | undefined =>
  new Map(Object.entries(row.figures?.summaries ?? {})).get(figure)

type Statistic = (summary: Summary) => number
const highest: Statistic = (summary) => summary.highest
const mean: Statistic = (summary) => summary.mean
const sigma: Statistic = (summary) => summary.sigma

const summaryValue =
  (figure: FigureName, statistic: Statistic) =>
  (row: CompareRow): number | undefined => {
    const summary = summaryOf(row, figure)
    return summary === undefined ? undefined : statistic(summary)
  }

/** The smallest gap between a measure and what its own headset draws: the highest "past rendered" turned around. */
const smallestGap =
  (figure: FigureName) =>
  (row: CompareRow): number | undefined => {
    const closest = summaryOf(row, figure)?.highest
    return closest === undefined ? undefined : -closest
  }

/** A row's headline width (see `headlineFiguresOf`): its widest measure's, the one the radar draws as highest. */
export function headlineWidthOfRow(tool: Tool, row: CompareRow): number | undefined {
  const widest = row.figures?.pairs.get('width')
  return widest === undefined ? undefined : headlineWidthOf(tool, widest)
}

/** A gap between a measure and what its own headset draws: its "past rendered" turned around. */
const turnedAround =
  (value: Column['value']): Column['value'] =>
  (row) => {
    const past = value(row)
    return past === undefined ? undefined : -past
  }

const degreeColumn = (id: CompareColumnId, label: string, title: string, value: Column['value']): Column => ({
  id,
  label,
  title,
  unit: '°',
  value,
})

const gapTitle = (figure: string): string =>
  `Smallest gap between a measure's ${figure} and what that measurer's own headset reports drawing`

/** Words for a pair column whose two figures come from one measure. */
const fromOneMeasure = (which: string): string => `both from one measure, the one with ${which}`

const averageSource = 'on average, from FOV Atlas measures of the model; not part of the measured figures'
const averagedValue =
  (name: RenderedValueName) =>
  (row: CompareRow): number | undefined =>
    renderedMean(row.averaged, name)
/** The model's average minus the measured figure: above zero while the measure stays inside it. */
const averagedGap =
  (name: RenderedValueName, measured: Column['value']) =>
  (row: CompareRow): number | undefined => {
    const average = renderedMean(row.averaged, name)
    const value = measured(row)
    return average === undefined || value === undefined ? undefined : average - value
  }

/**
 * Both eyes' figure in one cell, left then right, which keeps per-eye tables narrow. It sorts by
 * the mean of the two, or by the one present.
 */
function eyePairColumn(id: CompareColumnId, label: string, title: string, left: Column['value'], right: Column['value']): Column {
  return {
    id,
    label: `${label} L / R`,
    title: `${title}; left eye / right eye, sorted by the mean of both`,
    unit: '°',
    value: (row) => {
      const present = [left(row), right(row)].filter((value) => value !== undefined)
      return present.length === 0 ? undefined : present.reduce((total, value) => total + value, 0) / present.length
    },
    display: (row) => {
      const [leftValue, rightValue] = [left(row), right(row)]
      return leftValue === undefined && rightValue === undefined ? '—' : `${formatDegrees(leftValue)} / ${formatDegrees(rightValue)}`
    },
    pair: [left, right],
  }
}

/**
 * A pair column whose two figures both come from one measure, the one leading the pair's ranking
 * (see `measureRanking.ts`). `cellOf` turns each eye's figure into what the cell shows.
 */
function measurePairColumn(
  id: CompareColumnId,
  label: string,
  title: string,
  pair: EyePair,
  cellOf: (figure: Column['value'], eye: 'left' | 'right') => Column['value'] = (figure) => figure,
): Column {
  const [left, right] = eyePairFigures(pair)
  const figureOf =
    (name: FigureName): Column['value'] =>
    (row) =>
      row.figures?.pairs.get(pair)?.get(name)
  return eyePairColumn(id, label, title, cellOf(figureOf(left), 'left'), cellOf(figureOf(right), 'right'))
}

const allColumns: readonly Column[] = [
  degreeColumn(
    'highestHorizontal',
    'Highest horizontal',
    'Widest measure from the left edge of the left eye to the right edge of the right eye',
    summaryValue('horizontal', highest),
  ),
  degreeColumn('highestVertical', 'Highest vertical', 'Tallest measure, top to bottom, of the taller eye', summaryValue('vertical', highest)),
  measurePairColumn('highestWidth', 'Highest width', `Each eye’s width, left edge to right edge, ${fromOneMeasure('the widest single eye')}`, 'width'),
  measurePairColumn('highestHeight', 'Highest height', `Each eye’s height, top to bottom, ${fromOneMeasure('the tallest single eye')}`, 'height'),
  degreeColumn('diagonal', 'Diagonal (outer)', 'Highest angle toward an outer corner, away from the nose, of either eye', (row) => row.figures?.diagonal),
  degreeColumn('highestOverlap', 'Overlap °', 'Highest width both eyes see at once', summaryValue('overlap', highest)),
  {
    id: 'overlapShare',
    label: 'Overlap %',
    title: 'Mean overlap as a share of the mean horizontal',
    unit: '%',
    value: (row) => row.figures?.overlapShare,
  },
  { id: 'count', label: 'Measures', title: 'Measures matching the filters', unit: '', value: (row) => row.figures?.count },
  degreeColumn('meanHorizontal', 'Mean horizontal', 'Mean horizontal', summaryValue('horizontal', mean)),
  degreeColumn('sigmaHorizontal', 'σ horizontal', 'Spread (standard deviation) of the horizontal measures', summaryValue('horizontal', sigma)),
  degreeColumn('meanVertical', 'Mean vertical', 'Mean vertical', summaryValue('vertical', mean)),
  degreeColumn('sigmaVertical', 'σ vertical', 'Spread (standard deviation) of the vertical measures', summaryValue('vertical', sigma)),
  degreeColumn('meanOverlap', 'Mean overlap', 'Mean overlap', summaryValue('overlap', mean)),
  degreeColumn('sigmaOverlap', 'σ overlap', 'Spread (standard deviation) of the overlap measures', summaryValue('overlap', sigma)),
  eyePairColumn('meanWidth', 'Mean width', 'Mean width of each eye', summaryValue('leftWidth', mean), summaryValue('rightWidth', mean)),
  eyePairColumn('meanHeight', 'Mean height', 'Mean height of each eye', summaryValue('leftHeight', mean), summaryValue('rightHeight', mean)),
  degreeColumn(
    'renderedHorizontal',
    'Rendered horizontal',
    'What the measurers’ own headsets report drawing from edge to edge, both eyes together (the highest of them)',
    summaryValue('renderedHorizontal', highest),
  ),
  degreeColumn('renderedGap', 'Gap to rendered', gapTitle('horizontal'), smallestGap('horizontalPastRendered')),
  measurePairColumn(
    'renderedWidth',
    'Rendered width',
    `Width of each eye’s picture, as the link reports it, ${fromOneMeasure('the widest picture of a single eye')}`,
    'renderedWidth',
  ),
  measurePairColumn(
    'renderedHeight',
    'Rendered height',
    `Height of each eye’s picture, as the link reports it, ${fromOneMeasure('the tallest picture of a single eye')}`,
    'renderedHeight',
  ),
  measurePairColumn('widthGap', 'Width gap', `${gapTitle('width')}, ${fromOneMeasure('the smallest gap of a single eye')}`, 'widthPastRendered', turnedAround),
  measurePairColumn('heightGap', 'Height gap', `${gapTitle('height')}, ${fromOneMeasure('the smallest gap of a single eye')}`, 'heightPastRendered', turnedAround),
  degreeColumn(
    'linkOverlap',
    'Rendered overlap (link)',
    'Width both eyes’ pictures share, exactly as the link reports it (the highest of the measures)',
    summaryValue('renderedOverlap', highest),
  ),
  degreeColumn(
    'averagedHorizontal',
    'Rendered horizontal (model average)',
    `Both eyes together, edge to edge, as headsets of this model report drawing it ${averageSource}`,
    averagedValue('horizontal'),
  ),
  degreeColumn(
    'averagedGap',
    'Gap to model average',
    'How far the widest horizontal measure stays inside the model’s averaged rendered horizontal',
    averagedGap('horizontal', summaryValue('horizontal', highest)),
  ),
  eyePairColumn(
    'averagedWidth',
    'Rendered width (model average)',
    `Width of each eye’s picture as headsets of this model report drawing it ${averageSource}`,
    averagedValue('leftWidth'),
    averagedValue('rightWidth'),
  ),
  eyePairColumn(
    'averagedHeight',
    'Rendered height (model average)',
    `Height of each eye’s picture as headsets of this model report drawing it ${averageSource}`,
    averagedValue('leftHeight'),
    averagedValue('rightHeight'),
  ),
  measurePairColumn(
    'averagedWidthGap',
    'Width gap to model average',
    'How far each eye of the measure in “Highest width” stays inside the model’s averaged rendered width',
    'width',
    (figure, eye) => averagedGap(eye === 'left' ? 'leftWidth' : 'rightWidth', figure),
  ),
  measurePairColumn(
    'averagedHeightGap',
    'Height gap to model average',
    'How far each eye of the measure in “Highest height” stays inside the model’s averaged rendered height',
    'height',
    (figure, eye) => averagedGap(eye === 'left' ? 'leftHeight' : 'rightHeight', figure),
  ),
]

interface ToolColumns {
  readonly available: readonly CompareColumnId[]
  readonly shown: readonly CompareColumnId[]
}

const bothEyeColumns: readonly CompareColumnId[] = [
  'highestHorizontal',
  'highestVertical',
  'diagonal',
  'highestOverlap',
  'overlapShare',
  'count',
  'meanHorizontal',
  'sigmaHorizontal',
  'meanVertical',
  'sigmaVertical',
  'meanOverlap',
  'sigmaOverlap',
]

const toolColumns: ReadonlyMap<Tool, ToolColumns> = new Map([
  [
    'atlas',
    {
      available: [...bothEyeColumns, 'renderedHorizontal', 'renderedGap', 'averagedHorizontal', 'averagedGap'],
      shown: ['highestHorizontal', 'highestVertical', 'diagonal', 'highestOverlap', 'count', 'renderedHorizontal', 'renderedGap'],
    },
  ],
  [
    'vrhp',
    {
      available: [
        'highestWidth',
        'highestHeight',
        'diagonal',
        'count',
        'meanWidth',
        'meanHeight',
        'renderedWidth',
        'renderedHeight',
        'widthGap',
        'heightGap',
        'renderedHorizontal',
        'linkOverlap',
        'averagedWidth',
        'averagedHeight',
        'averagedWidthGap',
        'averagedHeightGap',
      ],
      shown: ['highestWidth', 'highestHeight', 'diagonal', 'count', 'widthGap'],
    },
  ],
  ['wimfov', { available: bothEyeColumns, shown: ['highestHorizontal', 'highestVertical', 'diagonal', 'highestOverlap', 'overlapShare', 'count'] }],
  [
    'testhmd',
    {
      available: [
        'highestHorizontal',
        'highestVertical',
        'count',
        'meanHorizontal',
        'sigmaHorizontal',
        'meanVertical',
        'sigmaVertical',
        'averagedHorizontal',
        'averagedGap',
      ],
      shown: ['highestHorizontal', 'highestVertical', 'count', 'averagedHorizontal'],
    },
  ],
])

/** A column's words for a tool whose figure comes from elsewhere. */
const toolWords: ReadonlyMap<Tool, ReadonlyMap<CompareColumnId, Pick<Column, 'label' | 'title'>>> = new Map([
  [
    'vrhp',
    new Map([
      [
        'renderedHorizontal',
        {
          label: 'Rendered horizontal (link)',
          title: 'Both eyes together, edge to edge, exactly as the link reports the headset draws it (the highest of the measures)',
        },
      ],
    ]),
  ],
])

type ColumnWords = ReadonlyMap<CompareColumnId, Pick<Column, 'label' | 'title'>>

const columnsById = new Map(allColumns.map((column) => [column.id, column]))
const columnsOf = (ids: readonly CompareColumnId[], words: ColumnWords | undefined): Column[] =>
  ids.flatMap((id) => {
    const column = columnsById.get(id)
    const own = words?.get(id)
    if (column === undefined) return []
    return [own === undefined ? column : { ...column, ...own }]
  })

/** Every column the tool's figures can fill, in table order. */
export const columnsFor = (tool: Tool): Column[] => columnsOf(toolColumns.get(tool)?.available ?? [], toolWords.get(tool))

const headlineIds: ReadonlyMap<Tool, readonly CompareColumnId[]> = new Map([
  ['atlas', ['highestHorizontal', 'meanHorizontal', 'renderedHorizontal', 'renderedGap']],
  ['vrhp', ['highestWidth', 'widthGap', 'highestHeight', 'heightGap']],
  ['wimfov', ['highestHorizontal', 'meanHorizontal', 'highestVertical']],
  ['testhmd', ['highestHorizontal', 'meanHorizontal', 'highestVertical', 'averagedHorizontal']],
])

/** The few figures a headset page leads with for the tool. */
export const headlineColumnsFor = (tool: Tool): Column[] => columnsOf(headlineIds.get(tool) ?? [], toolWords.get(tool))

const measureListIds: ReadonlyMap<Tool, readonly CompareColumnId[]> = new Map([
  ['atlas', ['highestHorizontal', 'highestVertical', 'highestOverlap', 'renderedGap']],
  ['vrhp', ['highestWidth', 'highestHeight', 'widthGap']],
  ['wimfov', ['highestHorizontal', 'highestVertical', 'highestOverlap']],
  ['testhmd', ['highestHorizontal', 'highestVertical']],
])

/** Short words for a headset page's list, where each row is a single measure. */
const measureListWords: ColumnWords = new Map([
  ['highestHorizontal', { label: 'Horiz.', title: 'Horizontal, both eyes' }],
  ['highestVertical', { label: 'Vert.', title: 'Vertical, the taller eye' }],
  ['highestOverlap', { label: 'Overlap', title: 'Width both eyes see at once' }],
  ['renderedGap', { label: 'Gap', title: 'Rendered horizontal of this headset minus the horizontal measured' }],
  ['highestWidth', { label: 'Width L / R', title: 'Width of the left eye / the right eye' }],
  ['highestHeight', { label: 'Height L / R', title: 'Height of the left eye / the right eye' }],
  [
    'widthGap',
    {
      label: 'Gap L / R',
      title: 'Width of each eye’s picture, as the link reports it, minus the width measured; left eye / right eye',
    },
  ],
])

/** The figures a headset page lists for each single measure of the tool. */
export const measureListColumnsFor = (tool: Tool): Column[] => columnsOf(measureListIds.get(tool) ?? [], measureListWords)

/** The columns shown for the tool until the visitor picks others. */
export const defaultColumnsFor = (tool: Tool): CompareColumnId[] => [...(toolColumns.get(tool)?.shown ?? [])]

export function formatCell(column: Column, row: CompareRow): string {
  if (column.display !== undefined) return column.display(row)
  const value = column.value(row)
  if (value === undefined) return '—'
  return column.unit === '' ? String(value) : formatDegrees(value, column.unit === '%' ? ' %' : '°')
}

/** A cell's text in parts: the left and right eye's figures apart for a column showing both, else the one text. */
export function cellParts(column: Column, row: CompareRow): string[] {
  if (column.pair === undefined) return [formatCell(column, row)]
  const [left, right] = column.pair
  return [formatDegrees(left(row)), formatDegrees(right(row))]
}

/** Rows ordered by a column; rows without that figure go last either way. */
export function sortRows(rows: readonly CompareRow[], column: Column, descending: boolean): CompareRow[] {
  return [...rows].sort((first, second) => {
    const firstValue = column.value(first)
    const secondValue = column.value(second)
    if (firstValue === undefined || secondValue === undefined) {
      return Number(firstValue === undefined) - Number(secondValue === undefined) || first.name.localeCompare(second.name)
    }
    return (descending ? secondValue - firstValue : firstValue - secondValue) || first.name.localeCompare(second.name)
  })
}
