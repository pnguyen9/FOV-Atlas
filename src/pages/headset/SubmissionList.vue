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
  /** One figure, or the left and right eye's, shown in one cell as left / right. */
  readonly figures: readonly FigureName[]
  /** Gaps are stored as measured minus rendered and shown the other way round. */
  readonly gap?: boolean
}

const bothEyes: readonly FigureColumn[] = [
  { label: 'Horiz.', title: 'Horizontal, both eyes', figures: ['horizontal'] },
  { label: 'Vert.', title: 'Vertical, the taller eye', figures: ['vertical'] },
  { label: 'Overlap', title: 'Width both eyes see at once', figures: ['overlap'] },
]
const figureColumns: ReadonlyMap<Tool, readonly FigureColumn[]> = new Map([
  [
    'atlas',
    [...bothEyes, { label: 'Gap', title: 'Rendered horizontal of this headset minus the horizontal measured', figures: ['horizontalPastRendered'], gap: true }],
  ],
  ['wimfov', bothEyes],
  ['testhmd', bothEyes.slice(0, 2)],
  [
    'vrhp',
    [
      { label: 'Width L / R', title: 'Width of the left eye / the right eye', figures: ['leftWidth', 'rightWidth'] },
      { label: 'Height L / R', title: 'Height of the left eye / the right eye', figures: ['leftHeight', 'rightHeight'] },
      {
        label: 'Gap L / R',
        title: 'Width of each eye’s picture, as the link reports it, minus the width measured; left eye / right eye',
        figures: ['leftWidthPastRendered', 'rightWidthPastRendered'],
        gap: true,
      },
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
      // Each value but the last ends with the separator, so a narrow cell wraps only between them.
      figures: columns.value.map(({ figures, gap }) =>
        figures.map((figure, figureIndex) => {
          const value = summaries.get(figure)?.mean
          const text = formatDegrees(gap === true && value !== undefined ? -value : value)
          return figureIndex < figures.length - 1 ? `${text} /` : text
        }),
      ),
      eyeDepth: eyeDepthOptions.find((option) => option.value === entry.submission.face.eyeDepth),
      noseBridge: noseBridgeOptions.find((option) => option.value === entry.submission.face.noseBridge),
    }
  }),
)
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
            :key="column.label"
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
