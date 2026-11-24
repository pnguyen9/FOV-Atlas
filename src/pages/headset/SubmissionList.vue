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
import { tuningOf } from '../../lib/submissionStore.ts'
import type { ListedEntry } from './listedEntry.ts'

const props = defineProps<{
  readonly entries: readonly ListedEntry[]
  /** The colour slot of each ticked measure, by issue. */
  readonly slots: ReadonlyMap<number, number>
  readonly full: boolean
}>()
const emit = defineEmits<{ toggle: [issue: number] }>()

const rows = computed(() =>
  props.entries.map(({ issue, entry }) => ({
    issue,
    entry,
    figures: figuresOfMeasure(entry.submission.measures),
    eyeDepth: eyeDepthOptions.find((option) => option.value === entry.submission.face.eyeDepth),
    noseBridge: noseBridgeOptions.find((option) => option.value === entry.submission.face.noseBridge),
  })),
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
          <th scope="col">
            Horiz.
          </th>
          <th scope="col">
            Vert.
          </th>
          <th scope="col">
            Overlap
          </th>
          <th
            class="text-cell"
            scope="col"
          >
            Rendered ceiling
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
          <td>{{ formatDegrees(figures.horizontal?.highest) }}</td>
          <td>{{ formatDegrees(figures.vertical?.highest) }}</td>
          <td>{{ formatDegrees(figures.overlap?.highest) }}</td>
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
