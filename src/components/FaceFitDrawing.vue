<script setup lang="ts">
/**
 * A side profile facing right, for one face-fit answer. Eyes vs brow: the eye sits further back
 * behind the brow line the deeper it is set. Nose bridge: the bridge sticks out further the
 * higher it is.
 */
import { computed } from 'vue'
import type { EyeDepth, NoseBridge } from '../lib/submission.ts'

const props = defineProps<
  { readonly feature: 'eye-depth'; readonly value: EyeDepth } | { readonly feature: 'nose-bridge'; readonly value: NoseBridge }
>()

const eyeDepthX: Readonly<Record<EyeDepth, number>> = { 'deep-set': 72, 'in-between': 77, 'almost-flush': 82 }
const bridgePaths: Readonly<Record<NoseBridge, string>> = {
  low: 'M78 22 Q84 30 86 52 L80 56',
  'in-between': 'M79 21 Q89 31 90 52 L81 56',
  high: 'M80 20 Q94 32 94 52 L82 56',
}

const shape = computed(() => {
  if (props.feature === 'nose-bridge') return { profile: bridgePaths[props.value], eyeX: 70, eyeY: 30, browLine: false }
  const eyeX = eyeDepthX[props.value]
  return {
    profile: `M60 10 Q78 12 84 26 Q${String(eyeX - 2)} 32 ${String(eyeX)} 38 Q${String(eyeX + 4)} 44 86 50`,
    eyeX: eyeX - 4,
    eyeY: 37,
    browLine: true,
  }
})
</script>

<template>
  <svg
    class="face-fit-drawing"
    viewBox="40 8 70 58"
    aria-hidden="true"
    focusable="false"
  >
    <line
      v-if="shape.browLine"
      class="brow-line"
      x1="84"
      y1="26"
      x2="84"
      y2="52"
    />
    <path
      class="profile"
      :d="shape.profile"
    />
    <ellipse
      class="eye"
      :cx="shape.eyeX"
      :cy="shape.eyeY"
      rx="3"
      ry="4"
    />
  </svg>
</template>

<style scoped>
.face-fit-drawing {
  display: block;
  width: 100%;
  height: 70px;
}
.profile {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
}
.eye {
  fill: currentColor;
}
.brow-line {
  stroke: var(--muted);
  stroke-dasharray: 2 2;
}
</style>
