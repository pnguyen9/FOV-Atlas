/** The Compare table's columns: one tool's figures per headset, and the model's rendered reference. */

import type { CompareColumnId } from './compareState.ts'
import type { HmdgdbConfiguration } from '../../data/hmdgdb.ts'
import type { Figures } from '../../lib/fovStats.ts'

export interface CompareRow {
  /** The headset id, or `kept` for a kept measure. */
  readonly key: string
  readonly headset: string
  readonly name: string
  /** Null when the headset's figures couldn't be loaded. */
  readonly figures: Figures | null
  /** All of the headset's measures with this tool, filters aside. */
  readonly total: number
  readonly reference: HmdgdbConfiguration | undefined
}

export interface Column {
  readonly id: CompareColumnId
  readonly label: string
  readonly title: string
  readonly unit: '°' | '%' | ''
  readonly value: (row: CompareRow) => number | undefined
}

const highestHorizontal = (row: CompareRow): number | undefined => row.figures?.horizontal?.highest

export const columns: readonly Column[] = [
  {
    id: 'highestHorizontal',
    label: 'Highest horizontal',
    title: 'Widest measure from the left edge of the left eye to the right edge of the right eye',
    unit: '°',
    value: highestHorizontal,
  },
  {
    id: 'highestVertical',
    label: 'Highest vertical',
    title: 'Tallest measure, top to bottom, of the taller eye',
    unit: '°',
    value: (row) => row.figures?.vertical?.highest,
  },
  {
    id: 'diagonal',
    label: 'Diagonal (outer)',
    title: 'Highest angle toward an outer corner, away from the nose, of either eye',
    unit: '°',
    value: (row) => row.figures?.diagonal,
  },
  {
    id: 'highestOverlap',
    label: 'Overlap °',
    title: 'Highest width both eyes see at once',
    unit: '°',
    value: (row) => row.figures?.overlap?.highest,
  },
  {
    id: 'overlapShare',
    label: 'Overlap %',
    title: 'Mean overlap as a share of the mean horizontal',
    unit: '%',
    value: (row) => row.figures?.overlapShare,
  },
  { id: 'count', label: 'Measures', title: 'Measures matching the filters', unit: '', value: (row) => row.figures?.count },
  { id: 'meanHorizontal', label: 'Mean horizontal', title: 'Mean horizontal', unit: '°', value: (row) => row.figures?.horizontal?.mean },
  {
    id: 'sigmaHorizontal',
    label: 'σ horizontal',
    title: 'Spread (standard deviation) of the horizontal measures',
    unit: '°',
    value: (row) => row.figures?.horizontal?.sigma,
  },
  { id: 'meanVertical', label: 'Mean vertical', title: 'Mean vertical', unit: '°', value: (row) => row.figures?.vertical?.mean },
  {
    id: 'sigmaVertical',
    label: 'σ vertical',
    title: 'Spread (standard deviation) of the vertical measures',
    unit: '°',
    value: (row) => row.figures?.vertical?.sigma,
  },
  { id: 'meanOverlap', label: 'Mean overlap', title: 'Mean overlap', unit: '°', value: (row) => row.figures?.overlap?.mean },
  {
    id: 'sigmaOverlap',
    label: 'σ overlap',
    title: 'Spread (standard deviation) of the overlap measures',
    unit: '°',
    value: (row) => row.figures?.overlap?.sigma,
  },
  {
    id: 'renderedHorizontal',
    label: 'Rendered horizontal',
    title: 'What the model draws from edge to edge, from the hmdq HMD Geometry Database',
    unit: '°',
    value: (row) => row.reference?.horizontal,
  },
  {
    id: 'renderedGap',
    label: 'Gap to rendered',
    title: 'Rendered horizontal minus the highest horizontal measured',
    unit: '°',
    value: (row) => {
      const highest = highestHorizontal(row)
      return row.reference === undefined || highest === undefined ? undefined : row.reference.horizontal - highest
    },
  },
]

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
