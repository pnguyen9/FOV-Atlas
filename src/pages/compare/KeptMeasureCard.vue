<script setup lang="ts">
/**
 * "Compare with this measure": a kept measure (see `measureFile.ts`) opened from a link, pasted
 * text or a saved file. It is read in this browser only, never sent anywhere, and shown only next
 * to measures of its own tool, never counted in their figures.
 */
import { computed, ref, watch } from 'vue'
import { compareState, keepMeasure } from './compareState.ts'
import { keptMeasureProblem, type KeptMeasureError } from './keptMeasureWords.ts'
import { headsetName } from '../../components/measureLabels.ts'
import { routeHref } from '../../lib/hashRoute.ts'
import { maximumMeasureTextLength, parseMeasureInput, parseMeasureParameter, type MeasureFileResult } from '../../lib/measureFile.ts'
import { toolNameOf } from '../../lib/submission.ts'

const props = defineProps<{
  /** The `measure` value of the address, when the page was opened from a kept measure's link. */
  readonly fromLink: string | null
}>()

const pasted = ref('')
const problem = ref<KeptMeasureError | null>(null)

function open(result: MeasureFileResult): void {
  if (result.ok) {
    keepMeasure(result.submission)
    problem.value = null
    pasted.value = ''
  } else {
    problem.value = result.error
  }
}

// Coming back to the page keeps the measure as it was left, its radar tick included.
watch(
  () => props.fromLink,
  (measure) => {
    if (measure === null || (measure === compareState.keptFromLink && compareState.kept !== null)) return
    const result = parseMeasureParameter(measure)
    open(result)
    if (result.ok) compareState.keptFromLink = measure
  },
  { immediate: true },
)

function openPasted(): void {
  open(parseMeasureInput(pasted.value))
}

async function openFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file === undefined) return
  // A file of any size can be picked; reading only small ones keeps a huge one from stalling the page.
  if (file.size > maximumMeasureTextLength) {
    problem.value = 'file-too-large'
    return
  }
  try {
    open(parseMeasureInput(await file.text()))
  } catch {
    problem.value = 'file-unreadable'
  }
}

const kept = computed(() => compareState.kept)
const sameTool = computed(() => kept.value !== null && kept.value.tool === compareState.tool)

function remove(): void {
  compareState.kept = null
  compareState.keptFromLink = null
  if (props.fromLink !== null) window.location.hash = routeHref({ page: 'compare', view: 'table', measure: null })
}

function showItsTool(): void {
  if (kept.value !== null) compareState.tool = kept.value.tool
}
</script>

<template>
  <section
    class="card kept-card"
    aria-labelledby="kept-heading"
  >
    <h2 id="kept-heading">
      Compare with this measure
    </h2>
    <template v-if="kept !== null">
      <p>
        <span class="swatch series-kept" />Kept measure: <strong>{{ headsetName(kept) }}</strong>, measured with
        {{ toolNameOf(kept.tool) }}<span class="tag">not published</span>
      </p>
      <p
        v-if="sameTool"
        class="small muted"
      >
        Shown next to the {{ toolNameOf(kept.tool) }} measures, dashed, and never counted in their figures.
      </p>
      <p
        v-else
        class="small"
      >
        It shows only next to {{ toolNameOf(kept.tool) }} measures: each tool is its own standard.
        <button
          type="button"
          class="button ghost small-button"
          @click="showItsTool"
        >
          Show {{ toolNameOf(kept.tool) }} measures
        </button>
      </p>
      <button
        type="button"
        class="button ghost"
        @click="remove"
      >
        Remove it
      </button>
    </template>
    <template v-else>
      <p class="small muted">
        Paste a FOV Atlas measure link or a saved measure's text, or open its .json file. It is read here, in your
        browser, and never sent or published.
      </p>
      <label
        class="field-label"
        for="kept-input"
      >Link or text</label>
      <textarea
        id="kept-input"
        v-model="pasted"
        rows="3"
        :maxlength="maximumMeasureTextLength * 2"
        spellcheck="false"
      />
      <div class="kept-actions">
        <button
          type="button"
          class="button"
          :disabled="pasted.trim() === ''"
          @click="openPasted"
        >
          Compare
        </button>
        <label class="button ghost file-button">
          Open a file…
          <input
            type="file"
            accept=".json,application/json"
            @change="openFile"
          >
        </label>
      </div>
    </template>
    <p
      v-if="problem !== null"
      class="problem small"
      role="alert"
    >
      This measure can't be opened. {{ keptMeasureProblem(problem) }}
    </p>
  </section>
</template>

<style scoped>
.kept-card p {
  margin: 0 0 10px;
}
.kept-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.file-button {
  position: relative;
}
.file-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.small-button {
  margin-left: 6px;
  padding: 2px 10px;
}
</style>
