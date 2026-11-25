<script setup lang="ts">
/**
 * Each published measure of the headset with the chosen tool, newest first. "Sent by" is the
 * public GitHub name the measure came from and links to its issue: the site has no accounts, so
 * people find their own measures by name.
 */
import { computed } from 'vue'
import { eyeDepthOptions, faceFitOptionOf, noseBridgeOptions, type FaceFitOption } from '../../components/faceFit.ts'
import { gazeLabelOf, tuningLabelOf } from '../../components/measureLabels.ts'
import { ceilingWords, cornerMaskWords } from '../../lib/ceiling.ts'
import { figuresOfMeasure } from '../../lib/fovStats.ts'
import { issueUrl } from '../../lib/issueForm.ts'
import type { EyeDepth, NoseBridge, Tool } from '../../lib/submission.ts'
import { tuningOf, type StoredEntry } from '../../lib/submissionStore.ts'
import { cellParts, measureListColumnsFor, type CompareRow } from '../compare/columns.ts'
import type { ListedEntry } from './listedEntry.ts'

const props = defineProps<{
  readonly tool: Tool
  readonly entries: readonly ListedEntry[]
  /** The colour slot of each ticked measure, by issue. */
  readonly slots: ReadonlyMap<number, number>
  readonly full: boolean
}>()
const emit = defineEmits<{ toggle: [issue: number] }>()

const columns = computed(() => measureListColumnsFor(props.tool))

interface EntryCells {
  /** Per figure column, its parts; each but the last ends with the separator, so a narrow cell wraps only between them. */
  readonly figures: readonly (readonly string[])[]
  readonly eyeDepth: FaceFitOption<EyeDepth> | undefined
  readonly noseBridge: FaceFitOption<NoseBridge> | undefined
}

/** A stored entry never changes, so its cells are worked out once, when it is first listed. */
const cellsByEntry = new WeakMap<StoredEntry, EntryCells>()

function cellsOf(entry: StoredEntry): EntryCells {
  const known = cellsByEntry.get(entry)
  if (known !== undefined) return known
  const { submission } = entry
  const row: CompareRow = { key: submission.headset, headset: submission.headset, name: '', figures: figuresOfMeasure(submission), total: 1 }
  const cells: EntryCells = {
    figures: measureListColumnsFor(submission.tool).map((column) => {
      const parts = cellParts(column, row)
      return parts.map((text, partIndex) => (partIndex < parts.length - 1 ? `${text} /` : text))
    }),
    eyeDepth: faceFitOptionOf(eyeDepthOptions, submission.face.eyeDepth),
    noseBridge: faceFitOptionOf(noseBridgeOptions, submission.face.noseBridge),
  }
  cellsByEntry.set(entry, cells)
  return cells
}

const rows = computed(() => props.entries.map(({ issue, entry }) => ({ issue, entry, ...cellsOf(entry) })))
</script>

<template>
  <div class="table-wrap">
    <table class="data-table measures-table">
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
            Sent by
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Eyes vs brow
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Nose bridge
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Tuning
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Gaze
          </th>
          <th scope="col">
            IPD
          </th>
          <th
            v-for="column in columns"
            :key="column.id"
            scope="col"
            :title="column.title"
          >
            {{ column.label }}
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Rendered
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Facial interface
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="{ issue, entry, figures, eyeDepth, noseBridge } in rows"
          :key="issue"
          class="clickable"
          :class="{ picked: slots.has(issue) }"
          @click="emit('toggle', issue)"
        >
          <td
            class="pick"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="slots.has(issue)"
              :disabled="full && !slots.has(issue)"
              :aria-label="`Show the measure sent by ${entry.author} in issue ${issue} on the radar`"
              @change="emit('toggle', issue)"
            >
          </td>
          <td class="text-cell">
            <span
              class="swatch"
              :class="slots.has(issue) ? `series-${slots.get(issue)}` : undefined"
            /><a
              :href="issueUrl(issue)"
              rel="noopener noreferrer"
              :title="`GitHub issue #${issue}`"
              @click.stop
            >{{ entry.author }}</a>
          </td>
          <td
            class="text-cell"
            :title="eyeDepth?.hint"
          >
            {{ eyeDepth?.label }}
          </td>
          <td
            class="text-cell"
            :title="noseBridge?.hint"
          >
            {{ noseBridge?.label }}
          </td>
          <td
            class="text-cell"
            :title="entry.submission.tuning.details || undefined"
          >
            {{ tuningLabelOf(tuningOf(entry.submission)) }}
          </td>
          <td class="text-cell">
            {{ gazeLabelOf(entry.submission.gaze) }}
          </td>
          <td>{{ entry.submission.ipd === null ? '—' : `${entry.submission.ipd} mm` }}</td>
          <td
            v-for="(figure, figureIndex) in figures"
            :key="figureIndex"
            :class="{ 'eye-pair': figure.length > 1 }"
          >
            <span
              v-for="(value, valueIndex) in figure"
              :key="valueIndex"
              class="figure-value"
            >{{ value }}</span>
          </td>
          <td class="text-cell">
            {{ ceilingWords(entry.submission) }}<span class="tag">{{ cornerMaskWords(entry.submission) }}</span>
          </td>
          <td
            class="text-cell interface"
            :title="entry.submission.note || undefined"
          >
            {{ entry.submission.facialInterface || '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Wrapping headers and words, and closer columns, keep the table within the page's main column. */
.measures-table th,
.measures-table td {
  padding-inline: 7px;
}
.measures-table th,
.measures-table .text-cell,
.measures-table .eye-pair {
  white-space: normal;
}
.figure-value {
  display: inline-block;
}
.figure-value + .figure-value {
  margin-left: 0.25em;
}
.interface {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
tr.picked {
  background: var(--accent-soft);
}
</style>
