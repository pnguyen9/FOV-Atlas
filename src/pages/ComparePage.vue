<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { catalogHeadset, otherHeadset } from '../lib/headsets.ts'
import { parseMeasureParameter } from '../lib/measureFile.ts'
import { loadIndex, type Loaded } from '../lib/siteData.ts'
import { toolNames, tools } from '../lib/submission.ts'
import type { DataIndex } from '../lib/submissionStore.ts'

const props = withDefaults(defineProps<{ readonly measure?: string | null }>(), { measure: null })

const index = ref<Loaded<DataIndex> | null>(null)

/** A kept measure opened from a link; comparing with it comes with the full Compare page. */
const keptMeasure = computed(() => (props.measure === null ? null : parseMeasureParameter(props.measure)))
const keptLabel = computed(() => {
  if (keptMeasure.value?.ok !== true) return ''
  const { submission } = keptMeasure.value
  const headset = submission.headset === otherHeadset ? submission.otherHeadsetName : catalogHeadset(submission.headset)?.name
  return `${headset ?? submission.headset}, measured with ${toolNames[submission.tool]}`
})

onMounted(async () => {
  index.value = await loadIndex()
})

/** Measures per tool, kept apart: each tool is its own standard. */
const toolCounts = computed(() => {
  if (index.value?.ok !== true) return []
  const byTool = new Map(Object.entries(index.value.value.headsets))
  return tools.flatMap((tool) => {
    const summaries = Object.values(byTool.get(tool) ?? {})
    if (summaries.length === 0) return []
    const measures = summaries.reduce((total, summary) => total + summary.count, 0)
    return [{ tool, measures, headsets: summaries.length }]
  })
})
</script>

<template>
  <div>
    <h1>Compare headsets</h1>
    <p class="note">
      This page is still being built: it will rank headsets side by side, one measuring tool at a time.
    </p>
    <template v-if="keptMeasure !== null">
      <p
        v-if="keptMeasure.ok"
        class="success"
      >
        Kept measure opened: {{ keptLabel }}. It will be shown next to measures of the same tool only.
      </p>
      <p
        v-else
        class="problem"
      >
        The kept measure in this link can't be read ({{ keptMeasure.error }}).
      </p>
    </template>
    <p
      v-if="index === null"
      class="muted"
    >
      Loading the measures…
    </p>
    <p
      v-else-if="!index.ok"
      class="problem"
    >
      The measures couldn't be loaded. Try again in a moment.
    </p>
    <p v-else-if="toolCounts.length === 0">
      No measures are published yet. <a href="#submit">Add the first one</a>.
    </p>
    <ul v-else>
      <li
        v-for="count in toolCounts"
        :key="count.tool"
      >
        {{ toolNames[count.tool] }}: {{ count.measures }} {{ count.measures === 1 ? 'measure' : 'measures' }} on
        {{ count.headsets }} {{ count.headsets === 1 ? 'headset' : 'headsets' }}
      </li>
    </ul>
  </div>
</template>
