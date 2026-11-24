<script setup lang="ts">
/** The model's averaged rendered field of view: mean, spread and count per value, and how much units differ. */
import { computed } from 'vue'
import { formatDegrees } from '../../components/measureLabels.ts'
import {
  renderedSummaries,
  renderedValueLabelOf,
  unitDifference,
  unitDifferenceWords,
  type RenderedAverage,
} from '../../lib/renderedAverage.ts'
import type { Loaded } from '../../lib/siteData.ts'

const props = defineProps<{
  /** Null while loading; a loaded null when the model has no average. */
  readonly average: Loaded<RenderedAverage | null> | null
}>()

const loadedAverage = computed(() => (props.average?.ok === true ? props.average.value : null))

const rows = computed(() =>
  loadedAverage.value === null
    ? []
    : renderedSummaries(loadedAverage.value).map(({ name, summary }) => ({
        name,
        label: renderedValueLabelOf(name),
        meanAndSpread: `${formatDegrees(summary.mean)} ± ${formatDegrees(summary.sigma)}`,
        count: summary.count,
        range: summary.min === summary.max ? formatDegrees(summary.min) : `${formatDegrees(summary.min)} to ${formatDegrees(summary.max)}`,
      })),
)

const warning = computed(() => {
  const difference = loadedAverage.value === null ? null : unitDifference(loadedAverage.value)
  return difference === null ? null : unitDifferenceWords(difference)
})
</script>

<template>
  <section
    class="rendered-average"
    aria-labelledby="rendered-average-heading"
  >
    <h2 id="rendered-average-heading">
      Averaged rendered field of view
    </h2>
    <p
      v-if="average === null"
      class="muted"
    >
      Loading…
    </p>
    <p
      v-else-if="!average.ok"
      class="problem"
    >
      The averaged rendered field of view couldn't be loaded. Try again in a moment.
    </p>
    <p
      v-else-if="loadedAverage === null"
      class="muted"
    >
      No FOV Atlas measure of this model has recorded what the headset draws yet, so there is nothing to compare
      measures with here. Measures with driver tuning don't count, because tuning changes what is drawn.
    </p>
    <template v-else>
      <p class="small muted">
        What headsets of this model report they draw, averaged over {{ loadedAverage.count }}
        {{ loadedAverage.count === 1 ? 'FOV Atlas measure' : 'FOV Atlas measures' }} without driver tuning. It comes
        from the headsets themselves, not from what anyone saw, so FOV Atlas, VR Headset Picker and TestHMD measures are
        set against it. Each value is the mean ± its spread (standard deviation).
      </p>
      <p
        v-if="warning !== null"
        class="note unit-warning"
      >
        {{ warning }}: the headsets measured don't all report drawing the same picture.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th
                class="text-cell"
                scope="col"
              >
                Value
              </th>
              <th scope="col">
                Mean ± σ
              </th>
              <th scope="col">
                Measures
              </th>
              <th scope="col">
                Lowest to highest
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.name"
            >
              <td class="text-cell">
                {{ row.label }}
              </td>
              <td>{{ row.meanAndSpread }}</td>
              <td>{{ row.count }}</td>
              <td>{{ row.range }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">
        Edges are angles from straight ahead. Widths and heights are across each eye's own picture.
      </p>
    </template>
  </section>
</template>

<style scoped>
.rendered-average {
  margin-top: 24px;
}
</style>
