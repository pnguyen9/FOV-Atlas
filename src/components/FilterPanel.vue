<script setup lang="ts">
/**
 * The soft filters: any ticked choice within a group, and every group. "Any" clears its group, and
 * ticking every choice of a group means the same as "Any".
 */
import { computed } from 'vue'
import { eyeDepthOptions, noseBridgeOptions } from './faceFit.ts'
import { gazeLabelOf, tuningLabelOf } from './measureLabels.ts'
import { compareState } from '../pages/compare/compareState.ts'
import type { FilterChoices } from '../lib/fovStats.ts'
import { tunings } from '../lib/submissionStore.ts'
import { gazes } from '../lib/submission.ts'

defineProps<{
  /** Measures passing the filters and all measures, or null before a tool is picked. */
  readonly counts: { readonly matching: number; readonly total: number; readonly toolName: string } | null
}>()

interface Group {
  readonly key: keyof FilterChoices
  readonly label: string
  readonly options: readonly { readonly value: string; readonly label: string; readonly hint?: string }[]
  readonly chosen: () => readonly string[]
  /** Takes values of the group's own options only, which the chips guarantee. */
  readonly choose: (values: readonly string[]) => void
}

const groups: readonly Group[] = [
  {
    key: 'eyeDepth',
    label: 'Eyes vs brow',
    options: eyeDepthOptions,
    chosen: () => compareState.filters.eyeDepth,
    choose: (values) => (compareState.filters.eyeDepth = values as FilterChoices['eyeDepth']),
  },
  {
    key: 'noseBridge',
    label: 'Nose bridge',
    options: noseBridgeOptions,
    chosen: () => compareState.filters.noseBridge,
    choose: (values) => (compareState.filters.noseBridge = values as FilterChoices['noseBridge']),
  },
  {
    key: 'tuning',
    label: 'Tuning',
    options: tunings.map((tuning) => ({ value: tuning, label: tuningLabelOf(tuning) })),
    chosen: () => compareState.filters.tuning,
    choose: (values) => (compareState.filters.tuning = values as FilterChoices['tuning']),
  },
  {
    key: 'gaze',
    label: 'Gaze',
    options: gazes.map((gaze) => ({ value: gaze, label: gazeLabelOf(gaze) })),
    chosen: () => compareState.filters.gaze,
    choose: (values) => (compareState.filters.gaze = values as FilterChoices['gaze']),
  },
]

function toggle(group: Group, value: string): void {
  const current = group.chosen()
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  group.choose(next.length === group.options.length ? [] : next)
}

const anyActive = computed(() => groups.some((group) => group.chosen().length > 0))

function clearAll(): void {
  for (const group of groups) group.choose([])
}
</script>

<template>
  <section
    class="card filter-panel"
    aria-label="Filters"
  >
    <h2>Filters</h2>
    <p class="small muted">
      Keep measures that match any ticked choice in each group, and every group.
    </p>
    <div
      v-for="group in groups"
      :key="group.key"
      class="control-group"
    >
      <div
        :id="`filter-${group.key}`"
        class="field-label"
      >
        {{ group.label }}
      </div>
      <div
        class="chips"
        role="group"
        :aria-labelledby="`filter-${group.key}`"
      >
        <button
          type="button"
          class="chip"
          :class="{ on: group.chosen().length === 0 }"
          :aria-pressed="group.chosen().length === 0"
          @click="group.choose([])"
        >
          Any
        </button>
        <button
          v-for="option in group.options"
          :key="option.value"
          type="button"
          class="chip"
          :class="{ on: group.chosen().includes(option.value) }"
          :aria-pressed="group.chosen().includes(option.value)"
          :title="option.hint"
          @click="toggle(group, option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    <p
      v-if="counts !== null"
      class="small match-count"
    >
      <strong>{{ counts.matching }}</strong> of {{ counts.total }} {{ counts.toolName }}
      {{ counts.total === 1 ? 'measure matches' : 'measures match' }}
    </p>
    <p
      v-else
      class="small muted"
    >
      Pick a tool to see how many measures match.
    </p>
    <button
      type="button"
      class="button ghost wide"
      :disabled="!anyActive"
      @click="clearAll"
    >
      Reset to “Any”
    </button>
  </section>
</template>
