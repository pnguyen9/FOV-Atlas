/**
 * The Compare table's columns: one tool's figures per headset. Each tool has its own set, because
 * each starts its angles from its own point: VR Headset Picker's figures are per eye, and only the
 * tools that carry the rendered field of view of the measurers' own headsets have rendered columns.
 */

import type { Figures, Summary } from '../../lib/fovStats.ts'
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
}

export const compareColumnIds = [
  'highestHorizontal',
  'highestVertical',
  'highestLeftWidth',
  'highestRightWidth',
  'highestLeftHeight',
  'highestRightHeight',
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
  'meanLeftWidth',
  'meanRightWidth',
  'meanLeftHeight',
  'meanRightHeight',
  'renderedHorizontal',
  'renderedGap',
  'renderedLeftWidth',
  'renderedRightWidth',
  'renderedLeftHeight',
  'renderedRightHeight',
  'leftWidthGap',
  'rightWidthGap',
  'leftHeightGap',
  'rightHeightGap',
  'linkHorizontal',
  'linkOverlap',
] as const
export type CompareColumnId = (typeof compareColumnIds)[number]

export interface Column {
  readonly id: CompareColumnId
  readonly label: string
  readonly title: string
  readonly unit: '°' | '%' | ''
  readonly value: (row: CompareRow) => number | undefined
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

const degreeColumn = (id: CompareColumnId, label: string, title: string, value: Column['value']): Column => ({
  id,
  label,
  title,
  unit: '°',
  value,
})

const gapTitle = (figure: string): string =>
  `Smallest gap between a measure's ${figure} and what that measurer's own headset reports drawing`

const allColumns: readonly Column[] = [
  degreeColumn(
    'highestHorizontal',
    'Highest horizontal',
    'Widest measure from the left edge of the left eye to the right edge of the right eye',
    summaryValue('horizontal', highest),
  ),
  degreeColumn('highestVertical', 'Highest vertical', 'Tallest measure, top to bottom, of the taller eye', summaryValue('vertical', highest)),
  degreeColumn('highestLeftWidth', 'Highest width, left eye', 'Widest measure of the left eye alone, left edge to right edge', summaryValue('leftWidth', highest)),
  degreeColumn('highestRightWidth', 'Highest width, right eye', 'Widest measure of the right eye alone, left edge to right edge', summaryValue('rightWidth', highest)),
  degreeColumn('highestLeftHeight', 'Highest height, left eye', 'Tallest measure of the left eye alone, top to bottom', summaryValue('leftHeight', highest)),
  degreeColumn('highestRightHeight', 'Highest height, right eye', 'Tallest measure of the right eye alone, top to bottom', summaryValue('rightHeight', highest)),
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
  degreeColumn('meanLeftWidth', 'Mean width, left eye', 'Mean width of the left eye', summaryValue('leftWidth', mean)),
  degreeColumn('meanRightWidth', 'Mean width, right eye', 'Mean width of the right eye', summaryValue('rightWidth', mean)),
  degreeColumn('meanLeftHeight', 'Mean height, left eye', 'Mean height of the left eye', summaryValue('leftHeight', mean)),
  degreeColumn('meanRightHeight', 'Mean height, right eye', 'Mean height of the right eye', summaryValue('rightHeight', mean)),
  degreeColumn(
    'renderedHorizontal',
    'Rendered horizontal',
    'What the measurers’ own headsets report drawing from edge to edge, both eyes together (the highest of them)',
    summaryValue('renderedHorizontal', highest),
  ),
  degreeColumn('renderedGap', 'Gap to rendered', gapTitle('horizontal'), smallestGap('horizontalPastRendered')),
  degreeColumn(
    'renderedLeftWidth',
    'Rendered width, left eye',
    'Width of the left eye’s picture, as the link reports it (the highest of the measures)',
    summaryValue('renderedLeftWidth', highest),
  ),
  degreeColumn(
    'renderedRightWidth',
    'Rendered width, right eye',
    'Width of the right eye’s picture, as the link reports it (the highest of the measures)',
    summaryValue('renderedRightWidth', highest),
  ),
  degreeColumn(
    'renderedLeftHeight',
    'Rendered height, left eye',
    'Height of the left eye’s picture, as the link reports it (the highest of the measures)',
    summaryValue('renderedLeftHeight', highest),
  ),
  degreeColumn(
    'renderedRightHeight',
    'Rendered height, right eye',
    'Height of the right eye’s picture, as the link reports it (the highest of the measures)',
    summaryValue('renderedRightHeight', highest),
  ),
  degreeColumn('leftWidthGap', 'Width gap, left eye', gapTitle('left eye width'), smallestGap('leftWidthPastRendered')),
  degreeColumn('rightWidthGap', 'Width gap, right eye', gapTitle('right eye width'), smallestGap('rightWidthPastRendered')),
  degreeColumn('leftHeightGap', 'Height gap, left eye', gapTitle('left eye height'), smallestGap('leftHeightPastRendered')),
  degreeColumn('rightHeightGap', 'Height gap, right eye', gapTitle('right eye height'), smallestGap('rightHeightPastRendered')),
  degreeColumn(
    'linkHorizontal',
    'Rendered horizontal (link)',
    'Both eyes together, edge to edge, exactly as the link reports the headset draws it (the highest of the measures)',
    summaryValue('renderedHorizontal', highest),
  ),
  degreeColumn(
    'linkOverlap',
    'Rendered overlap (link)',
    'Width both eyes’ pictures share, exactly as the link reports it (the highest of the measures)',
    summaryValue('renderedOverlap', highest),
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
      available: [...bothEyeColumns, 'renderedHorizontal', 'renderedGap'],
      shown: ['highestHorizontal', 'highestVertical', 'diagonal', 'highestOverlap', 'count', 'renderedHorizontal', 'renderedGap'],
    },
  ],
  [
    'vrhp',
    {
      available: [
        'highestLeftWidth',
        'highestRightWidth',
        'highestLeftHeight',
        'highestRightHeight',
        'diagonal',
        'count',
        'meanLeftWidth',
        'meanRightWidth',
        'meanLeftHeight',
        'meanRightHeight',
        'renderedLeftWidth',
        'renderedRightWidth',
        'renderedLeftHeight',
        'renderedRightHeight',
        'leftWidthGap',
        'rightWidthGap',
        'leftHeightGap',
        'rightHeightGap',
        'linkHorizontal',
        'linkOverlap',
      ],
      shown: ['highestLeftWidth', 'highestRightWidth', 'highestLeftHeight', 'highestRightHeight', 'diagonal', 'count', 'leftWidthGap', 'rightWidthGap'],
    },
  ],
  ['wimfov', { available: bothEyeColumns, shown: ['highestHorizontal', 'highestVertical', 'diagonal', 'highestOverlap', 'overlapShare', 'count'] }],
  [
    'testhmd',
    {
      available: ['highestHorizontal', 'highestVertical', 'count', 'meanHorizontal', 'sigmaHorizontal', 'meanVertical', 'sigmaVertical'],
      shown: ['highestHorizontal', 'highestVertical', 'count'],
    },
  ],
])

const columnsById = new Map(allColumns.map((column) => [column.id, column]))
const columnsOf = (ids: readonly CompareColumnId[]): Column[] =>
  ids.flatMap((id) => {
    const column = columnsById.get(id)
    return column === undefined ? [] : [column]
  })

/** Every column the tool's figures can fill, in table order. */
export const columnsFor = (tool: Tool): Column[] => columnsOf(toolColumns.get(tool)?.available ?? [])

const headlineIds: ReadonlyMap<Tool, readonly CompareColumnId[]> = new Map([
  ['atlas', ['highestHorizontal', 'meanHorizontal', 'renderedHorizontal', 'renderedGap']],
  ['vrhp', ['highestLeftWidth', 'highestRightWidth', 'leftWidthGap', 'rightWidthGap']],
  ['wimfov', ['highestHorizontal', 'meanHorizontal', 'highestVertical']],
  ['testhmd', ['highestHorizontal', 'meanHorizontal', 'highestVertical']],
])

/** The few figures a headset page leads with for the tool. */
export const headlineColumnsFor = (tool: Tool): Column[] => columnsOf(headlineIds.get(tool) ?? [])

/** The columns shown for the tool until the visitor picks others. */
export const defaultColumnsFor = (tool: Tool): CompareColumnId[] => [...(toolColumns.get(tool)?.shown ?? [])]

export function formatCell(column: Column, row: CompareRow): string {
  const value = column.value(row)
  if (value === undefined) return '—'
  return column.unit === '' ? String(value) : `${value.toFixed(1)}${column.unit === '%' ? ' %' : '°'}`
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
