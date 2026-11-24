<script setup lang="ts">
/**
 * The radar card shared by Compare and the headset pages: the chart, its legend, and the "What
 * you see" view, where a generic scene is drawn in the chart's own projection and seen through one
 * series' shape.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import RadarChart from './RadarChart.vue'
import SegmentedControl from '../SegmentedControl.vue'
import { colourClass, type ChartCeiling, type ChartCurve, type RadarSeries } from './radarSeries.ts'
import { compareState } from '../../pages/compare/compareState.ts'
import { combineEyes, eyeModeFor, measuresBothEyesAtOnce, type EyeMode } from '../../lib/fovStats.ts'
import { sceneNames, sceneOf, type SceneName } from '../../lib/scene.ts'
import type { EyeMeasures, Tool } from '../../lib/submission.ts'

const props = defineProps<{
  readonly series: readonly RadarSeries[]
  readonly tool: Tool
  /** Shown when there is nothing to draw. */
  readonly emptyText: string
}>()

const eyeMode = computed(() => eyeModeFor(props.tool, compareState.radar.eye))

const withShapes = computed(() =>
  props.series.flatMap((item) => (item.measures === null ? [] : [{ ...item, measures: item.measures }])),
)
const seeing = computed(() => compareState.radar.view === 'see' && withShapes.value.length > 0)
const through = computed(() => withShapes.value.find((item) => item.key === compareState.radar.through) ?? withShapes.value[0])

const curves = computed<ChartCurve[]>(() =>
  withShapes.value.map((item) => ({
    key: item.key,
    colourClass: colourClass(item.colour),
    label: item.label,
    shape: combineEyes(item.measures, eyeMode.value),
    filled: !seeing.value,
    dashed: item.colour === 'kept',
    emphasised: seeing.value && item.key === through.value?.key,
  })),
)
const ceilings = computed<ChartCeiling[]>(() =>
  compareState.radar.showCeiling
    ? props.series.flatMap((item) =>
        item.ceiling === undefined
          ? []
          : [{ key: item.key, colourClass: colourClass(item.colour), edges: combineEyes(item.ceiling.edges, eyeMode.value) }],
      )
    : [],
)

function bothEyesOf(measures: EyeMeasures): EyeMeasures['left'] | null {
  return eyeMode.value === 'union' && !measuresBothEyesAtOnce(props.tool) ? combineEyes(measures, 'overlap') : null
}

const sceneProps = computed(() => {
  const shown = through.value
  if (!seeing.value || shown === undefined) return { scene: null, window: null, bothEyes: null }
  return { scene: compareState.radar.scene, window: combineEyes(shown.measures, eyeMode.value), bothEyes: bothEyesOf(shown.measures) }
})

const eyeWords: Readonly<Record<EyeMode, string>> = {
  union: 'both eyes together',
  overlap: 'only what both eyes see',
  left: 'left eye',
  right: 'right eye',
}

const viewOptions = [
  { value: 'shape', label: 'Shape' },
  { value: 'see', label: 'What you see' },
] as const
const sceneOptions = sceneNames.map((name: SceneName) => ({ value: name, label: sceneOf(name).name }))
const throughOptions = computed(() => withShapes.value.map((item) => ({ value: item.key, label: item.name })))

const ceilingNotes = computed(() =>
  compareState.radar.showCeiling ? props.series.map((item) => ({ key: item.key, colour: colourClass(item.colour), text: item.ceilingNote })) : [],
)

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') compareState.radar.enlarged = false
}
onMounted(() => {
  window.addEventListener('keydown', closeOnEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', closeOnEscape)
  compareState.radar.enlarged = false
})
</script>

<template>
  <section
    class="card radar-panel"
    :class="{ enlarged: compareState.radar.enlarged }"
    aria-label="Radar"
  >
    <div class="view-bar">
      <SegmentedControl
        v-model="compareState.radar.view"
        label="Show the radar as"
        :options="viewOptions"
      />
      <SegmentedControl
        v-if="compareState.radar.view === 'see'"
        v-model="compareState.radar.scene"
        label="Scene"
        :options="sceneOptions"
      />
      <button
        type="button"
        class="button ghost"
        :title="compareState.radar.enlarged ? 'Back to the page (Esc)' : 'Fill the window'"
        @click="compareState.radar.enlarged = !compareState.radar.enlarged"
      >
        {{ compareState.radar.enlarged ? '✕ Close' : '⤢ Enlarge' }}
      </button>
    </div>
    <div
      v-if="seeing && throughOptions.length > 1"
      class="control-group"
    >
      <div class="field-label">
        Looking through
      </div>
      <SegmentedControl
        :model-value="through?.key ?? ''"
        label="Looking through"
        :options="throughOptions"
        @update:model-value="(key) => (compareState.radar.through = key)"
      />
    </div>
    <template v-if="curves.length > 0 || ceilings.length > 0">
      <RadarChart
        :curves="curves"
        :ceilings="ceilings"
        v-bind="sceneProps"
      />
      <ul class="legend">
        <li
          v-for="curve in curves"
          :key="curve.key"
          :class="curve.colourClass"
        >
          <span
            class="legend-line"
            :class="{ dashed: curve.dashed }"
            aria-hidden="true"
          />{{ curve.label }}
        </li>
        <li v-if="sceneProps.bothEyes !== null">
          <span
            class="legend-line both-eyes"
            aria-hidden="true"
          />Seen by both eyes at once (3D)
        </li>
      </ul>
      <div
        v-if="ceilingNotes.length > 0"
        class="small muted ceiling-notes"
      >
        <p>Rendered ceiling, marked across each edge:</p>
        <ul>
          <li
            v-for="note in ceilingNotes"
            :key="note.key"
            :class="note.colour"
          >
            <span
              class="legend-tick"
              aria-hidden="true"
            />{{ note.text }}
          </li>
        </ul>
      </div>
      <p
        v-if="seeing && through !== undefined"
        class="small muted"
      >
        You're looking straight ahead. Clear: inside {{ through.seeText }} ({{ eyeWords[eyeMode] }}). Dimmed: there, but
        outside it. Each ring is 10° further from straight ahead, so straight edges bend as in a fisheye photo. The scenes
        are generic sketches.
      </p>
    </template>
    <div
      v-else
      class="empty"
    >
      {{ emptyText }}
    </div>
  </section>
</template>

<style scoped>
.view-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 12px;
}
.radar-panel.enlarged {
  position: fixed;
  inset: 10px;
  z-index: 20;
  overflow: auto;
  box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.55);
}
.radar-panel.enlarged :deep(.radar-chart) {
  max-width: none;
  width: min(100%, calc(100vh - 220px));
}
.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 16px;
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  font-size: 13px;
}
.legend-line {
  display: inline-block;
  width: 24px;
  margin-right: 6px;
  vertical-align: middle;
  border-top: 2.5px solid var(--series);
}
.legend-line.dashed {
  border-top-style: dashed;
}
.legend-line.both-eyes {
  border-top: 2px dashed #f5c542;
}
.ceiling-notes p {
  margin: 12px 0 4px;
}
.ceiling-notes ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.legend-tick {
  display: inline-block;
  width: 3px;
  height: 12px;
  margin-right: 8px;
  vertical-align: middle;
  border-radius: 2px;
  background: var(--series);
}
</style>
