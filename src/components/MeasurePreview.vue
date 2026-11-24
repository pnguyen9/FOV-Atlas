<script setup lang="ts">
/**
 * The shape of one measure, both eyes drawn over each other as the wearer sees them, with the
 * binocular figures the site shows for a single measure. Angles are plotted at their distance
 * from the centre, straight ahead, up at the top and the wearer's left on the left.
 */
import { computed } from 'vue'
import { binocularOf } from '../lib/submissionStore.ts'
import { directions, type EyeMeasure, type EyeMeasures } from '../lib/submission.ts'

const props = defineProps<{ readonly measures: EyeMeasures }>()

const radius = 90
const ringStepDegrees = 30
const stepRadians = (2 * Math.PI) / directions.length

const scaleDegrees = computed(() => {
  const angles = [...Object.values(props.measures.left), ...Object.values(props.measures.right)]
  return Math.max(ringStepDegrees * 3, ...angles)
})

const rings = computed(() =>
  Array.from({ length: Math.floor(scaleDegrees.value / ringStepDegrees) }, (_, ringIndex) => ({
    degrees: (ringIndex + 1) * ringStepDegrees,
    radius: (((ringIndex + 1) * ringStepDegrees) / scaleDegrees.value) * radius,
  })),
)

/** Directions run from up toward the wearer's left, so counter-clockwise on screen. */
function outline(eye: EyeMeasure): string {
  const angles = new Map(Object.entries(eye))
  return directions
    .flatMap((direction, directionIndex) => {
      const degrees = angles.get(direction)
      if (degrees === undefined) return []
      const distance = (degrees / scaleDegrees.value) * radius
      const turn = directionIndex * stepRadians
      return [`${(-Math.sin(turn) * distance).toFixed(1)},${(-Math.cos(turn) * distance).toFixed(1)}`]
    })
    .join(' ')
}

const outlines = computed(() => ({ left: outline(props.measures.left), right: outline(props.measures.right) }))
const figures = computed(() => {
  const binocular = binocularOf(props.measures)
  return [
    { label: 'Horizontal', value: binocular.horizontal },
    { label: 'Vertical', value: binocular.vertical },
    { label: 'Overlap', value: binocular.overlap },
  ].filter((figure) => figure.value !== undefined)
})
</script>

<template>
  <figure class="measure-preview">
    <svg
      viewBox="-100 -100 200 200"
      role="img"
      aria-label="Shape of the measure, left eye and right eye"
    >
      <circle
        v-for="ring in rings"
        :key="ring.degrees"
        class="ring"
        :r="ring.radius"
      />
      <line
        class="axis"
        x1="-95"
        y1="0"
        x2="95"
        y2="0"
      />
      <line
        class="axis"
        x1="0"
        y1="-95"
        x2="0"
        y2="95"
      />
      <polygon
        class="eye left-eye"
        :points="outlines.left"
      />
      <polygon
        class="eye right-eye"
        :points="outlines.right"
      />
    </svg>
    <figcaption>
      <span class="legend left-eye">Left eye</span>
      <span class="legend right-eye">Right eye</span>
      <span class="muted small">Rings every {{ ringStepDegrees }}°</span>
    </figcaption>
    <dl class="figures">
      <div
        v-for="figure in figures"
        :key="figure.label"
      >
        <dt>{{ figure.label }}</dt>
        <dd>{{ figure.value }}°</dd>
      </div>
    </dl>
  </figure>
</template>

<style scoped>
.measure-preview {
  margin: 16px 0 0;
}
svg {
  display: block;
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
}
.ring {
  fill: none;
  stroke: var(--grid);
}
.axis {
  stroke: var(--grid);
  stroke-dasharray: 2 3;
}
.eye {
  fill-opacity: 0.15;
  stroke-width: 1.5;
}
polygon.left-eye {
  fill: var(--left-eye);
  stroke: var(--left-eye);
}
polygon.right-eye {
  fill: var(--right-eye);
  stroke: var(--right-eye);
  stroke-dasharray: 5 3;
}
figcaption {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 16px;
  margin-top: 8px;
  font-size: 13px;
}
.legend::before {
  content: '';
  display: inline-block;
  width: 18px;
  margin-right: 6px;
  vertical-align: middle;
  border-top: 2px solid;
}
.legend.left-eye::before {
  border-top-color: var(--left-eye);
}
.legend.right-eye::before {
  border-top-style: dashed;
  border-top-color: var(--right-eye);
}
.figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
  margin: 14px 0 0;
}
.figures div {
  background: var(--surface-2);
  border-radius: 10px;
  padding: 8px 12px;
}
dt {
  font-size: 12px;
  color: var(--muted);
}
dd {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
</style>
