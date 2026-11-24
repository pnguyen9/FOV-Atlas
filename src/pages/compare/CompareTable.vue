<script setup lang="ts">
/**
 * One row per headset model for the chosen tool. Ticking a row puts the headset on the radar;
 * clicking it opens the headset's page. A kept measure, when it is of the same tool, sits on top,
 * outside the sorting.
 */
import { computed } from 'vue'
import { columns, formatCell, sortRows, type CompareRow } from './columns.ts'
import { compareState, seriesSlotCount, slotOf, togglePick, type CompareColumnId } from './compareState.ts'
import { routeHref } from '../../lib/hashRoute.ts'
import { borrowedReferenceLabel } from '../../lib/headsets.ts'

const props = defineProps<{
  readonly rows: readonly CompareRow[]
  readonly keptRow: CompareRow | null
}>()

const shownColumns = computed(() => columns.filter((column) => compareState.columns.includes(column.id)))
const sortColumn = computed(() => columns.find((column) => column.id === compareState.sort.column) ?? columns[0])
const sortedRows = computed(() =>
  sortColumn.value === undefined ? [...props.rows] : sortRows(props.rows, sortColumn.value, compareState.sort.descending),
)

function sortBy(id: CompareColumnId): void {
  compareState.sort =
    compareState.sort.column === id ? { column: id, descending: !compareState.sort.descending } : { column: id, descending: true }
}

function toggleColumn(id: CompareColumnId): void {
  const shown = compareState.columns
  if (shown.includes(id)) {
    if (shown.length > 1) compareState.columns = shown.filter((column) => column !== id)
  } else {
    compareState.columns = columns.map((column) => column.id).filter((column) => column === id || shown.includes(column))
  }
}

/** Models whose rendered figures are borrowed from another model, said under the table when shown. */
const borrowedNotes = computed(() => {
  const showsRendered = compareState.columns.some((column) => column === 'renderedHorizontal' || column === 'renderedGap')
  if (!showsRendered) return []
  return [...(props.keptRow === null ? [] : [props.keptRow]), ...props.rows].flatMap((row) => {
    const label = borrowedReferenceLabel(row.headset)
    return label === undefined ? [] : [`${row.name}: rendered figures ${label}.`]
  })
})

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
  if (compareState.sort.column !== id) return ''
  return compareState.sort.descending ? ' ▾' : ' ▴'
}
const ariaSort = (id: CompareColumnId): 'ascending' | 'descending' | undefined => {
  if (compareState.sort.column !== id) return undefined
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
      :class="{ on: compareState.columns.includes(column.id) }"
      :aria-pressed="compareState.columns.includes(column.id)"
      :title="column.title"
      @click="toggleColumn(column.id)"
    >
      {{ column.label }}
    </button>
  </div>
  <p class="small muted">
    Rendered figures come from the hmdq HMD Geometry Database by Richard Musil (CC BY-SA 4.0), for models it records in a
    single configuration.
  </p>
  <ul
    v-if="borrowedNotes.length > 0"
    class="small muted borrowed-notes"
  >
    <li
      v-for="note in borrowedNotes"
      :key="note"
    >
      {{ note }}
    </li>
  </ul>
</template>
