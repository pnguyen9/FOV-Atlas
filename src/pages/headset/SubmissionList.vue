<script setup lang="ts">
/**
 * Each published measure of the headset with the chosen tool, newest first. "Sent by" is the
 * public GitHub name the measure came from and links to its issue: the site has no accounts, so
 * people find their own measures by name.
 */
import { computed } from 'vue'
import { eyeDepthOptions, noseBridgeOptions } from '../../components/faceFit.ts'
import { formatDegrees, gazeLabelOf, tuningLabelOf } from '../../components/measureLabels.ts'
import { ceilingWords, cornerMaskWords } from '../../lib/ceiling.ts'
import { figuresOfMeasure } from '../../lib/fovStats.ts'
import { issueUrl } from '../../lib/issueForm.ts'
import type { Tool } from '../../lib/submission.ts'
import { tuningOf, type FigureName } from '../../lib/submissionStore.ts'
import type { ListedEntry } from './listedEntry.ts'

interface FigureColumn {
  readonly label: string
  readonly title: string
  readonly figure: FigureName
  /** Gaps are stored as measured minus rendered and shown the other way round. */
  readonly gap?: boolean
}

const bothEyes: readonly FigureColumn[] = [
  { label: 'Horiz.', title: 'Horizontal, both eyes', figure: 'horizontal' },
  { label: 'Vert.', title: 'Vertical, the taller eye', figure: 'vertical' },
  { label: 'Overlap', title: 'Width both eyes see at once', figure: 'overlap' },
]
const figureColumns: ReadonlyMap<Tool, readonly FigureColumn[]> = new Map([
  [
    'atlas',
    [...bothEyes, { label: 'Gap', title: 'Rendered horizontal of this headset minus the horizontal measured', figure: 'horizontalPastRendered', gap: true }],
  ],
  ['wimfov', bothEyes],
  ['testhmd', bothEyes.slice(0, 2)],
  [
    'vrhp',
    [
      { label: 'Width L', title: 'Width of the left eye', figure: 'leftWidth' },
      { label: 'Width R', title: 'Width of the right eye', figure: 'rightWidth' },
      { label: 'Height L', title: 'Height of the left eye', figure: 'leftHeight' },
      { label: 'Height R', title: 'Height of the right eye', figure: 'rightHeight' },
      { label: 'Gap L', title: 'Width of the left eye’s picture, as the link reports it, minus the width measured', figure: 'leftWidthPastRendered', gap: true },
      { label: 'Gap R', title: 'Width of the right eye’s picture, as the link reports it, minus the width measured', figure: 'rightWidthPastRendered', gap: true },
    ],
  ],
])

const props = defineProps<{
  readonly tool: Tool
  readonly entries: readonly ListedEntry[]
  /** The colour slot of each ticked measure, by issue. */
  readonly slots: ReadonlyMap<number, number>
  readonly full: boolean
}>()
const emit = defineEmits<{ toggle: [issue: number] }>()

const columns = computed(() => figureColumns.get(props.tool) ?? [])

const rows = computed(() =>
  props.entries.map(({ issue, entry }) => {
    const summaries = new Map(Object.entries(figuresOfMeasure(entry.submission).summaries))
    return {
      issue,
      entry,
      figures: columns.value.map(({ figure, gap }) => {
        const value = summaries.get(figure)?.mean
        return formatDegrees(gap === true && value !== undefined ? -value : value)
      }),
      eyeDepth: eyeDepthOptions.find((option) => option.value === entry.submission.face.eyeDepth),
      noseBridge: noseBridgeOptions.find((option) => option.value === entry.submission.face.noseBridge),
    }
  }),
)
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
            :key="column.figure"
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
          >
            {{ figure }}
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
.interface {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
tr.picked {
  background: var(--accent-soft);
}
</style>
