<script setup lang="ts">
/** Mean, spread, highest and count per direction and eye, and for the tool's figures. */
import { computed } from 'vue'
import { formatDegrees } from '../../lib/degrees.ts'
import { summarize, type Summary } from '../../lib/fovStats.ts'
import { directions } from '../../lib/submission.ts'
import type { CellStats, FigureName } from '../../lib/submissionStore.ts'

const props = defineProps<{ readonly stats: CellStats }>()

/** The figures listed, in order; gaps to rendered and the pictures' turn are left to other views. */
const figureLabels: ReadonlyMap<FigureName, string> = new Map([
  ['horizontal', 'Horizontal'],
  ['vertical', 'Vertical'],
  ['overlap', 'Overlap'],
  ['leftWidth', 'Width, left eye'],
  ['rightWidth', 'Width, right eye'],
  ['leftHeight', 'Height, left eye'],
  ['rightHeight', 'Height, right eye'],
  ['renderedHorizontal', 'Rendered horizontal'],
  ['renderedOverlap', 'Rendered overlap'],
  ['renderedLeftWidth', 'Rendered width, left eye'],
  ['renderedRightWidth', 'Rendered width, right eye'],
  ['renderedLeftHeight', 'Rendered height, left eye'],
  ['renderedRightHeight', 'Rendered height, right eye'],
])

const directionRows = computed(() => {
  const leftStats = new Map(Object.entries(props.stats.left))
  const rightStats = new Map(Object.entries(props.stats.right))
  return directions.flatMap((direction) => {
    const left = leftStats.get(direction)
    const right = rightStats.get(direction)
    if (left === undefined && right === undefined) return []
    return [
      {
        direction,
        left: left === undefined ? undefined : summarize(left),
        right: right === undefined ? undefined : summarize(right),
      },
    ]
  })
})

const figureRows = computed(() => {
  const stats = new Map(Object.entries(props.stats.figures))
  return [...figureLabels].flatMap(([figure, label]) => {
    const stat = stats.get(figure)
    return stat === undefined ? [] : [{ figure, label, summary: summarize(stat) }]
  })
})

const cells = (summary: Summary | undefined): string[] =>
  summary === undefined
    ? ['—', '—', '—', '—']
    : [formatDegrees(summary.mean), formatDegrees(summary.sigma), formatDegrees(summary.highest), String(summary.count)]
</script>

<template>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th
            class="text-cell"
            scope="col"
          >
            Figure
          </th>
          <th scope="col">
            Mean
          </th>
          <th scope="col">
            σ
          </th>
          <th scope="col">
            Highest
          </th>
          <th scope="col">
            Measures
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in figureRows"
          :key="row.figure"
        >
          <th
            class="text-cell"
            scope="row"
          >
            {{ row.label }}
          </th>
          <td
            v-for="(cell, cellIndex) in cells(row.summary)"
            :key="cellIndex"
          >
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="table-wrap direction-table">
    <table class="data-table">
      <caption class="visually-hidden">
        Per direction and eye
      </caption>
      <thead>
        <tr>
          <th
            class="text-cell"
            scope="col"
            rowspan="2"
          >
            Direction
          </th>
          <th
            scope="colgroup"
            colspan="4"
          >
            Left eye
          </th>
          <th
            scope="colgroup"
            colspan="4"
          >
            Right eye
          </th>
        </tr>
        <tr>
          <template
            v-for="eye in ['left', 'right']"
            :key="eye"
          >
            <th scope="col">
              Mean
            </th>
            <th scope="col">
              σ
            </th>
            <th scope="col">
              Highest
            </th>
            <th scope="col">
              n
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in directionRows"
          :key="row.direction"
        >
          <th
            class="text-cell"
            scope="row"
          >
            {{ row.direction }}
          </th>
          <td
            v-for="(cell, cellIndex) in [...cells(row.left), ...cells(row.right)]"
            :key="cellIndex"
          >
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.direction-table {
  margin-top: 12px;
}
</style>
