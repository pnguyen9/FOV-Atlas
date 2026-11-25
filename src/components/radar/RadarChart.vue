<script setup lang="ts">
/**
 * The radar: each shape's distance from the centre is the angle from straight ahead, the same in
 * every direction. With a scene, the window shape is cut out of it: clear inside, dimmed outside.
 */
import { computed, useId } from 'vue'
import { formatDegrees } from '../../lib/degrees.ts'
import { largestAngle } from '../../lib/fovStats.ts'
import {
  plotRadius,
  radarHalfSize,
  radialScale,
  reachOf,
  outlinePath,
  ringsOf,
  screenPoint,
  shapePath,
  shapePoints,
  shapeSpans,
  spokesOf,
  turnOf,
} from '../../lib/radarGeometry.ts'
import { photoLimitDegrees, sceneOf, sceneShapes, type SceneName } from '../../lib/scene.ts'
import type { EyeMeasure } from '../../lib/submission.ts'
import type { ChartCurve, ChartOutline } from './radarSeries.ts'

const props = defineProps<{
  readonly curves: readonly ChartCurve[]
  readonly outlines: readonly ChartOutline[]
  readonly scene: SceneName | null
  /** The shape the scene is seen through; the scene is drawn only with one. */
  readonly window: EyeMeasure | null
  /** What both eyes see at once, marked over the scene. */
  readonly bothEyes: EyeMeasure | null
}>()

const clipId = useId()
const skyId = useId()

const reach = computed(() => {
  const outlineDegrees = props.outlines.flatMap(({ outlines }) => outlines.flatMap((points) => points.map(({ degrees }) => degrees)))
  const oneEye = props.curves.flatMap((curve) => curve.oneEye)
  return reachOf(Math.max(largestAngle(props.curves.map((curve) => curve.shape), oneEye), ...outlineDegrees))
})
const scale = computed(() => radialScale(reach.value))
const rings = computed(() => ringsOf(reach.value, scale.value))
const spokes = spokesOf()

/** How far outside its dot the eye letter of a one-eye angle sits. */
const oneEyeLabelGap = 11

const drawnCurves = computed(() =>
  props.curves.map((curve) => ({
    ...curve,
    path: shapePath(curve.shape, scale.value),
    spans: shapeSpans(curve.shape, scale.value),
    points: shapePoints(curve.shape, scale.value),
    oneEyeDots: curve.oneEye.map(({ eye, direction, degrees }) => ({
      key: `${eye}-${direction}`,
      dot: screenPoint(turnOf(direction), scale.value(degrees)),
      label: screenPoint(turnOf(direction), scale.value(degrees) + oneEyeLabelGap),
      letter: eye === 'left' ? 'L' : 'R',
      title: `${curve.label}, ${direction}: ${formatDegrees(degrees)}, ${eye} eye only`,
    })),
  })),
)
const drawnOutlines = computed(() =>
  props.outlines.map((outline) => ({ ...outline, paths: outline.outlines.map((points) => outlinePath(points, scale.value)) })),
)

const sceneView = computed(() => {
  if (props.scene === null || props.window === null) return null
  const scene = sceneOf(props.scene)
  const outside = `M${String(-plotRadius)},${String(-plotRadius)}h${String(2 * plotRadius)}v${String(2 * plotRadius)}h${String(-2 * plotRadius)}Z`
  return {
    photo: scene.photo === null ? null : { href: `${import.meta.env.BASE_URL}${scene.photo}`, radius: scale.value(photoLimitDegrees) },
    sky: scene.sky,
    ground: scene.ground,
    shapes: sceneShapes(props.scene, reach.value, scale.value),
    dimmer: `${outside} ${shapePath(props.window, scale.value)}`,
    bothEyes: props.bothEyes === null ? [] : shapeSpans(props.bothEyes, scale.value),
  }
})

const viewBox = `${String(-radarHalfSize)} ${String(-radarHalfSize)} ${String(2 * radarHalfSize)} ${String(2 * radarHalfSize)}`
</script>

<template>
  <svg
    class="radar-chart"
    :class="{ 'on-scene': sceneView !== null }"
    :viewBox="viewBox"
    role="img"
    aria-label="Field of view radar: the further from the centre, the more is seen in that direction"
  >
    <template v-if="sceneView !== null">
      <defs>
        <clipPath :id="clipId">
          <circle :r="plotRadius" />
        </clipPath>
        <linearGradient
          :id="skyId"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            :stop-color="sceneView.sky[0]"
          />
          <stop
            offset="1"
            :stop-color="sceneView.sky[1]"
          />
        </linearGradient>
      </defs>
      <g
        class="scene"
        :clip-path="`url(#${clipId})`"
      >
        <rect
          :x="-plotRadius"
          :y="-plotRadius"
          :width="2 * plotRadius"
          :height="plotRadius"
          :fill="`url(#${skyId})`"
        />
        <rect
          :x="-plotRadius"
          y="0"
          :width="2 * plotRadius"
          :height="plotRadius"
          :fill="sceneView.ground"
        />
        <image
          v-if="sceneView.photo !== null"
          :href="sceneView.photo.href"
          :x="-sceneView.photo.radius"
          :y="-sceneView.photo.radius"
          :width="2 * sceneView.photo.radius"
          :height="2 * sceneView.photo.radius"
          preserveAspectRatio="none"
        />
        <path
          v-for="(shape, shapeIndex) in sceneView.shapes"
          :key="shapeIndex"
          :d="shape.path"
          :fill="shape.fill"
          :stroke="shape.stroke"
          :stroke-width="shape.strokeWidth"
          :stroke-opacity="shape.strokeOpacity"
        />
        <path
          class="dimmer"
          :d="sceneView.dimmer"
          fill-rule="evenodd"
        />
      </g>
    </template>
    <g class="grid">
      <circle
        v-for="ring in rings"
        :key="ring.degrees"
        class="ring"
        :class="{ major: ring.major }"
        :r="ring.radius"
      />
      <line
        v-for="spoke in spokes"
        :key="spoke.direction"
        class="spoke"
        x1="0"
        y1="0"
        :x2="spoke.end.screenX"
        :y2="spoke.end.screenY"
      />
      <template
        v-for="ring in rings"
        :key="`label-${ring.degrees}`"
      >
        <text
          v-if="ring.major"
          class="ring-label"
          x="3"
          :y="-ring.radius - 3"
        >{{ ring.degrees }}°</text>
      </template>
      <text
        v-for="spoke in spokes"
        :key="`label-${spoke.direction}`"
        class="spoke-label"
        :x="spoke.label.screenX"
        :y="spoke.label.screenY"
      >{{ spoke.direction }}</text>
    </g>
    <g
      v-for="outline in drawnOutlines"
      :key="`rendered-${outline.key}`"
      class="rendered"
      :class="outline.colourClass"
    >
      <path
        v-for="(path, pathIndex) in outline.paths"
        :key="pathIndex"
        :d="path"
      />
    </g>
    <g
      v-for="curve in drawnCurves"
      :key="curve.key"
      class="curve"
      :class="[curve.colourClass, { filled: curve.filled, dashed: curve.dashed, emphasised: curve.emphasised, mean: curve.mean }]"
    >
      <path
        class="area"
        :d="curve.path"
      />
      <path
        v-for="(span, spanIndex) in curve.spans"
        :key="spanIndex"
        class="edge"
        :class="{ unmeasured: !span.measured }"
        :d="span.path"
      />
      <circle
        v-for="point in curve.points"
        :key="point.direction"
        :cx="point.screenX"
        :cy="point.screenY"
        r="4"
      >
        <title>{{ curve.label }}, {{ point.direction }}: {{ formatDegrees(point.degrees) }}</title>
      </circle>
      <g
        v-for="oneEyeDot in curve.oneEyeDots"
        :key="oneEyeDot.key"
        class="one-eye"
      >
        <title>{{ oneEyeDot.title }}</title>
        <circle
          :cx="oneEyeDot.dot.screenX"
          :cy="oneEyeDot.dot.screenY"
          r="4.5"
        />
        <text
          :x="oneEyeDot.label.screenX"
          :y="oneEyeDot.label.screenY"
        >{{ oneEyeDot.letter }}</text>
      </g>
    </g>
    <template v-if="sceneView !== null">
      <path
        v-for="(span, spanIndex) in sceneView.bothEyes"
        :key="`both-eyes-${spanIndex}`"
        class="both-eyes"
        :class="{ unmeasured: !span.measured }"
        :d="span.path"
      />
    </template>
    <circle
      class="centre"
      r="2.5"
    />
  </svg>
</template>

<style scoped>
.radar-chart {
  display: block;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  overflow: visible;
}
.ring,
.spoke {
  fill: none;
  stroke: var(--grid);
  stroke-width: 0.6;
}
.ring.major {
  stroke-width: 1.1;
}
.on-scene .ring,
.on-scene .spoke {
  stroke: rgb(255 255 255 / 0.28);
}
.ring-label {
  font-size: 10px;
  fill: var(--muted);
}
.on-scene .ring-label {
  fill: rgb(255 255 255 / 0.8);
}
.spoke-label {
  font-size: 12px;
  fill: var(--muted);
  text-anchor: middle;
  dominant-baseline: middle;
}
.dimmer {
  fill: #000;
  fill-opacity: 0.8;
}
.curve .area {
  fill: none;
  stroke: none;
}
.curve.filled .area {
  fill: var(--series);
  fill-opacity: 0.1;
}
.curve .edge {
  fill: none;
  stroke: var(--series);
  stroke-width: 2;
  stroke-linejoin: round;
}
.curve.dashed .edge {
  stroke-dasharray: 7 4;
  stroke-width: 2.4;
}
.curve.mean .edge {
  stroke-width: 1.5;
  stroke-dasharray: 9 3 2 3;
  opacity: 0.8;
}
.curve.mean circle {
  display: none;
}
.curve.emphasised .edge {
  stroke-width: 3;
}
.curve .edge.unmeasured {
  stroke-width: 1.6;
  stroke-dasharray: 4 4;
  opacity: 0.75;
}
/* A mean keeps its dash-dot where unmeasured, only fainter, so it never passes for the highest. */
.curve.mean .edge.unmeasured {
  stroke-width: 1.3;
  stroke-dasharray: 9 3 2 3;
  opacity: 0.5;
}
.curve circle {
  fill: var(--series);
  stroke: var(--surface);
  stroke-width: 2;
}
.curve .one-eye circle {
  fill: var(--surface);
  stroke: var(--series);
}
.one-eye text {
  font-size: 10px;
  font-weight: 600;
  fill: var(--series);
  stroke: var(--surface);
  stroke-width: 3;
  paint-order: stroke;
  text-anchor: middle;
  dominant-baseline: middle;
}
.rendered path {
  fill: none;
  stroke: var(--series);
  stroke-width: 1.6;
  stroke-dasharray: 1.5 4;
  stroke-linecap: round;
  opacity: 0.85;
}
.both-eyes {
  fill: none;
  stroke: #f5c542;
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
}
.both-eyes.unmeasured {
  stroke-dasharray: 1.5 6;
  opacity: 0.75;
}
.centre {
  fill: var(--text);
}
</style>
