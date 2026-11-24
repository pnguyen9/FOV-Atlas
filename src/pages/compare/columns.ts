/**
 * The Compare table's columns: one tool's figures per headset. Each tool has its own set, because
 * each starts its angles from its own point: VR Headset Picker's figures are per eye, and only the
 * tools that carry the rendered field of view of the measurers' own headsets have rendered columns.
 * FOV Atlas, VR Headset Picker and TestHMD also get the model's averaged rendered field of view
 * (`renderedAverage.ts`) as a reference, in each tool's own terms; WIMFOV has its own standard.
 */

import type { Figures, Summary } from '../../lib/fovStats.ts'
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

const formatValue = (value: number | undefined): string => (value === undefined ? '—' : `${value.toFixed(1)}°`)

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
      return leftValue === undefined && rightValue === undefined ? '—' : `${formatValue(leftValue)} / ${formatValue(rightValue)}`
    },
  }
}

const allColumns: readonly Column[] = [
  degreeColumn(
    'highestHorizontal',
    'Highest horizontal',
    'Widest measure from the left edge of the left eye to the right edge of the right eye',
    summaryValue('horizontal', highest),
  ),
  degreeColumn('highestVertical', 'Highest vertical', 'Tallest measure, top to bottom, of the taller eye', summaryValue('vertical', highest)),
  eyePairColumn('highestWidth', 'Highest width', 'Widest measure of each eye alone, left edge to right edge', summaryValue('leftWidth', highest), summaryValue('rightWidth', highest)),
  eyePairColumn('highestHeight', 'Highest height', 'Tallest measure of each eye alone, top to bottom', summaryValue('leftHeight', highest), summaryValue('rightHeight', highest)),
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
  eyePairColumn(
    'renderedWidth',
    'Rendered width',
    'Width of each eye’s picture, as the link reports it (the highest of the measures)',
    summaryValue('renderedLeftWidth', highest),
    summaryValue('renderedRightWidth', highest),
  ),
  eyePairColumn(
    'renderedHeight',
    'Rendered height',
    'Height of each eye’s picture, as the link reports it (the highest of the measures)',
    summaryValue('renderedLeftHeight', highest),
    summaryValue('renderedRightHeight', highest),
  ),
  eyePairColumn('widthGap', 'Width gap', gapTitle('width'), smallestGap('leftWidthPastRendered'), smallestGap('rightWidthPastRendered')),
  eyePairColumn('heightGap', 'Height gap', gapTitle('height'), smallestGap('leftHeightPastRendered'), smallestGap('rightHeightPastRendered')),
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
  eyePairColumn(
    'averagedWidthGap',
    'Width gap to model average',
    'How far the widest measure of each eye stays inside the model’s averaged rendered width',
    averagedGap('leftWidth', summaryValue('leftWidth', highest)),
    averagedGap('rightWidth', summaryValue('rightWidth', highest)),
  ),
  eyePairColumn(
    'averagedHeightGap',
    'Height gap to model average',
    'How far the tallest measure of each eye stays inside the model’s averaged rendered height',
    averagedGap('leftHeight', summaryValue('leftHeight', highest)),
    averagedGap('rightHeight', summaryValue('rightHeight', highest)),
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

const columnsById = new Map(allColumns.map((column) => [column.id, column]))
const columnsOf = (tool: Tool, ids: readonly CompareColumnId[]): Column[] =>
  ids.flatMap((id) => {
    const column = columnsById.get(id)
    const words = toolWords.get(tool)?.get(id)
    if (column === undefined) return []
    return [words === undefined ? column : { ...column, ...words }]
  })

/** Every column the tool's figures can fill, in table order. */
export const columnsFor = (tool: Tool): Column[] => columnsOf(tool, toolColumns.get(tool)?.available ?? [])

const headlineIds: ReadonlyMap<Tool, readonly CompareColumnId[]> = new Map([
  ['atlas', ['highestHorizontal', 'meanHorizontal', 'renderedHorizontal', 'renderedGap']],
  ['vrhp', ['highestWidth', 'widthGap', 'highestHeight', 'heightGap']],
  ['wimfov', ['highestHorizontal', 'meanHorizontal', 'highestVertical']],
  ['testhmd', ['highestHorizontal', 'meanHorizontal', 'highestVertical', 'averagedHorizontal']],
])

/** The few figures a headset page leads with for the tool. */
export const headlineColumnsFor = (tool: Tool): Column[] => columnsOf(tool, headlineIds.get(tool) ?? [])

/** The columns shown for the tool until the visitor picks others. */
export const defaultColumnsFor = (tool: Tool): CompareColumnId[] => [...(toolColumns.get(tool)?.shown ?? [])]

export function formatCell(column: Column, row: CompareRow): string {
  if (column.display !== undefined) return column.display(row)
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
