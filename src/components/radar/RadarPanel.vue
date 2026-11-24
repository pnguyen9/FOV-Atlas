<script setup lang="ts">
/**
 * The radar card shared by Compare and the headset pages: the chart, its legend, and the "What
 * you see" view, where a generic scene is drawn in the chart's own projection and seen through one
 * series' shape.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import RadarChart from './RadarChart.vue'
import SegmentedControl from '../SegmentedControl.vue'
import { colourClass, type ChartCurve, type ChartOutline, type RadarSeries } from './radarSeries.ts'
import { compareState } from '../../pages/compare/compareState.ts'
import { drawsRenderedOutline, pictureOutline } from '../../lib/ceiling.ts'
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

const showsMeans = computed(() => compareState.radar.alsoMean && compareState.radar.statistic === 'highest' && !seeing.value)

const curves = computed<ChartCurve[]>(() =>
  withShapes.value.flatMap((item) => {
    const main: ChartCurve = {
      key: item.key,
      colourClass: colourClass(item.colour),
      label: item.label,
      shape: combineEyes(item.measures, eyeMode.value),
      filled: !seeing.value,
      dashed: item.colour === 'kept',
      emphasised: seeing.value && item.key === through.value?.key,
      mean: false,
    }
    if (!showsMeans.value || item.meanMeasures === null) return [main]
    const meanCurve: ChartCurve = {
      ...main,
      key: `${item.key}:mean`,
      label: `${item.name} · mean`,
      shape: combineEyes(item.meanMeasures, eyeMode.value),
      filled: false,
      mean: true,
    }
    return [main, meanCurve]
  }),
)
const showsOutlines = computed(() => drawsRenderedOutline(props.tool) && compareState.radar.showRendered)
/** Union and overlap show both eyes' pictures: their union and overlap are then plain to see. */
const eyesShown = computed<readonly ('left' | 'right')[]>(() => {
  if (eyeMode.value === 'left' || eyeMode.value === 'right') return [eyeMode.value]
  return ['left', 'right']
})
/** An outline is drawn only next to a shape: a group with no matching measure has none. */
const outlined = computed(() => (showsOutlines.value ? props.series.filter((item) => item.measures !== null) : []))
const outlines = computed<ChartOutline[]>(() =>
  showsOutlines.value
    ? outlined.value.flatMap(({ key, colour, rendered }) => {
        if (rendered === undefined) return []
        const pictures = eyesShown.value.flatMap((eye) => {
          const points = pictureOutline(eye === 'left' ? rendered.left : rendered.right, rendered.canting, eye)
          return points === null ? [] : [points]
        })
        return pictures.length === 0 ? [] : [{ key, colourClass: colourClass(colour), outlines: pictures }]
      })
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

const renderedNotes = computed(() =>
  outlined.value.map((item) => ({ key: item.key, colour: colourClass(item.colour), text: item.renderedNote, warning: item.renderedWarning })),
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
    <template v-if="curves.length > 0 || outlines.length > 0">
      <RadarChart
        :curves="curves"
        :outlines="outlines"
        v-bind="sceneProps"
      />
      <ul class="legend">
        <li
          v-for="curve in curves"
          :key="curve.key"
          :class="curve.colourClass"
        >
          <svg
            v-if="curve.mean"
            class="legend-mean"
            viewBox="0 0 24 4"
            aria-hidden="true"
          ><line
            x1="0"
            y1="2"
            x2="24"
            y2="2"
          /></svg><span
            v-else
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
      <p
        v-if="showsMeans"
        class="small muted line-key"
      >
        Solid: the highest of each direction. Dash-dot: the mean of what people measured.<template v-if="renderedNotes.length > 0">
          Dotted: what the headsets report drawing.
        </template>
      </p>
      <div
        v-if="renderedNotes.length > 0"
        class="small muted rendered-notes"
      >
        <p>Rendered field of view, dotted around each eye's picture:</p>
        <ul>
          <li
            v-for="note in renderedNotes"
            :key="note.key"
            :class="note.colour"
          >
            <span
              class="legend-line dotted"
              aria-hidden="true"
            />{{ note.text }}<span
              v-if="note.warning !== null"
              class="unit-warning"
            >. {{ note.warning }}.</span>
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
.legend-mean {
  display: inline-block;
  width: 24px;
  height: 4px;
  margin-right: 6px;
  vertical-align: middle;
  overflow: visible;
}
.legend-mean line {
  stroke: var(--series);
  stroke-width: 2;
  stroke-dasharray: 6 2.5 1.5 2.5;
}
.line-key {
  text-align: center;
  margin: 6px 0 0;
}
.legend-line.dashed {
  border-top-style: dashed;
}
.legend-line.both-eyes {
  border-top: 2px dashed #f5c542;
}
.legend-line.dotted {
  border-top: 2px dotted var(--series);
}
.unit-warning {
  color: var(--warning, #b86e00);
}
.rendered-notes p {
  margin: 12px 0 4px;
}
.rendered-notes ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
