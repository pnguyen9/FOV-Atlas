<script setup lang="ts">
/**
 * One row per headset model for the chosen tool. Ticking a row puts the headset on the radar;
 * clicking it opens the headset's page. A kept measure, when it is of the same tool, sits on top,
 * outside the sorting.
 */
import { computed } from 'vue'
import { columnsFor, formatCell, sortRows, type CompareColumnId, type CompareRow } from './columns.ts'
import { compareState, seriesSlotCount, slotOf, togglePick } from './compareState.ts'
import { routeHref } from '../../lib/hashRoute.ts'
import { drawsRenderedOutline } from '../../lib/ceiling.ts'
import type { Tool } from '../../lib/submission.ts'

const props = defineProps<{
  readonly tool: Tool
  readonly rows: readonly CompareRow[]
  readonly keptRow: CompareRow | null
}>()

const columns = computed(() => columnsFor(props.tool))
const shownIds = computed(() => compareState.columns[props.tool])
const shownColumns = computed(() => columns.value.filter((column) => shownIds.value.includes(column.id)))
const sortColumn = computed(
  () => shownColumns.value.find((column) => column.id === compareState.sort.column) ?? shownColumns.value[0],
)
const sortedRows = computed(() =>
  sortColumn.value === undefined ? [...props.rows] : sortRows(props.rows, sortColumn.value, compareState.sort.descending),
)

function sortBy(id: CompareColumnId): void {
  compareState.sort =
    sortColumn.value?.id === id ? { column: id, descending: !compareState.sort.descending } : { column: id, descending: true }
}

function toggleColumn(id: CompareColumnId): void {
  const shown = shownIds.value
  if (shown.includes(id)) {
    if (shown.length > 1) compareState.columns[props.tool] = shown.filter((column) => column !== id)
  } else {
    compareState.columns[props.tool] = columns.value.map((column) => column.id).filter((column) => column === id || shown.includes(column))
  }
}

const full = computed(() => compareState.picks.length >= seriesSlotCount)
const slotClass = (headset: string): string | undefined => {
  const slot = slotOf(compareState.picks, headset)
  return slot === undefined ? undefined : `series-${String(slot)}`
}
const picked = (headset: string): boolean => slotOf(compareState.picks, headset) !== undefined

function togglePicked(headset: string): void {
  compareState.picks = togglePick(compareState.picks, headset)
}

function openHeadset(headset: string): void {
  window.location.hash = routeHref({ page: 'headset', headset })
}

const sortMark = (id: CompareColumnId): string => {
  if (sortColumn.value?.id !== id) return ''
  return compareState.sort.descending ? ' ▾' : ' ▴'
}
const ariaSort = (id: CompareColumnId): 'ascending' | 'descending' | undefined => {
  if (sortColumn.value?.id !== id) return undefined
  return compareState.sort.descending ? 'descending' : 'ascending'
}
</script>

<template>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th
            class="pick"
            scope="col"
          >
            <span class="visually-hidden">On the radar</span>
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Headset
          </th>
          <th
            v-for="column in shownColumns"
            :key="column.id"
            scope="col"
            :title="column.title"
            :aria-sort="ariaSort(column.id)"
          >
            <button
              type="button"
              @click="sortBy(column.id)"
            >
              {{ column.label }}{{ sortMark(column.id) }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-if="keptRow !== null"
          class="kept-row"
        >
          <td class="pick">
            <input
              v-model="compareState.keptOnRadar"
              type="checkbox"
              aria-label="Show the kept measure on the radar"
            >
          </td>
          <td class="text-cell">
            <span class="swatch series-kept" />Kept measure · {{ keptRow.name }}<span class="tag">not published</span>
          </td>
          <td
            v-for="column in shownColumns"
            :key="column.id"
          >
            {{ formatCell(column, keptRow) }}
          </td>
        </tr>
        <tr
          v-for="row in sortedRows"
          :key="row.key"
          class="clickable"
          @click="openHeadset(row.headset)"
        >
          <td
            class="pick"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="picked(row.headset)"
              :disabled="full && !picked(row.headset)"
              :aria-label="`Show ${row.name} on the radar`"
              @change="togglePicked(row.headset)"
            >
          </td>
          <td class="text-cell">
            <span
              class="swatch"
              :class="slotClass(row.headset)"
            /><a
              :href="routeHref({ page: 'headset', headset: row.headset })"
              @click.stop
            >{{ row.name }}</a>
            <span
              v-if="row.figures === null"
              class="tag"
            >couldn't load</span>
            <span
              v-else-if="row.figures.count === 0"
              class="tag"
            >no match</span>
          </td>
          <td
            v-for="column in shownColumns"
            :key="column.id"
          >
            {{ formatCell(column, row) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p
    v-if="full"
    class="small muted"
  >
    The radar shows up to {{ seriesSlotCount }} headsets at once.
  </p>
  <h3>Columns</h3>
  <div
    class="chips"
    role="group"
    aria-label="Columns"
  >
    <button
      v-for="column in columns"
      :key="column.id"
      type="button"
      class="chip"
      :class="{ on: shownIds.includes(column.id) }"
      :aria-pressed="shownIds.includes(column.id)"
      :title="column.title"
      @click="toggleColumn(column.id)"
    >
      {{ column.label }}
    </button>
  </div>
  <p
    v-if="tool === 'vrhp'"
    class="small muted"
  >
    VR Headset Picker measures each eye from the centre of that eye's picture, so its widths and heights are per eye
    (L / R: left eye / right eye), each set against the same eye's picture as the link reports it. The rendered
    horizontal and overlap of both eyes are shown exactly as the link reports them.
  </p>
  <p
    v-else-if="tool === 'atlas'"
    class="small muted"
  >
    Rendered figures are what each measurer's own headset reported drawing while they measured.
  </p>
  <p
    v-if="drawsRenderedOutline(tool)"
    class="small muted"
  >
    “Model average” columns give what headsets of the model report drawing, averaged over its FOV Atlas measures: a
    reference that never counts in the measured figures.
  </p>
</template>
