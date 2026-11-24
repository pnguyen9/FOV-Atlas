<script setup lang="ts">
/** How the radar draws its shapes: which eye, which statistic, and the rendered outline when the tool has one. */
import SegmentedControl from '../SegmentedControl.vue'
import { compareState } from '../../pages/compare/compareState.ts'
import { drawsRenderedOutline } from '../../lib/ceiling.ts'
import { measuresBothEyesAtOnce, type EyeMode, type Statistic } from '../../lib/fovStats.ts'
import { toolNameOf, type Tool } from '../../lib/submission.ts'

defineProps<{ readonly tool: Tool }>()

const eyeOptions: readonly { value: EyeMode; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'union', label: 'Union' },
  { value: 'overlap', label: 'Overlap' },
]
const statisticOptions: readonly { value: Statistic; label: string }[] = [
  { value: 'highest', label: 'Highest' },
  { value: 'mean', label: 'Mean' },
]
const renderedOptions: readonly { value: 'show' | 'hide'; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
]
</script>

<template>
  <div class="control-group">
    <div class="field-label">
      Eye
    </div>
    <p
      v-if="measuresBothEyesAtOnce(tool)"
      class="small muted"
    >
      {{ toolNameOf(tool) }} measures both eyes together.
    </p>
    <SegmentedControl
      v-else
      v-model="compareState.radar.eye"
      label="Eye"
      :options="eyeOptions"
    />
    <p class="small muted hint">
      Union: what either eye sees. Overlap: what both eyes see at once.
    </p>
  </div>
  <div class="control-group">
    <div class="field-label">
      Statistic
    </div>
    <SegmentedControl
      v-model="compareState.radar.statistic"
      label="Statistic"
      :options="statisticOptions"
    />
  </div>
  <div
    v-if="drawsRenderedOutline(tool)"
    class="control-group"
  >
    <div class="field-label">
      Rendered field of view
    </div>
    <SegmentedControl
      :model-value="compareState.radar.showRendered ? 'show' : 'hide'"
      label="Rendered field of view"
      :options="renderedOptions"
      @update:model-value="(choice) => (compareState.radar.showRendered = choice === 'show')"
    />
    <p class="small muted hint">
      A dotted outline around each eye's picture, where the measurers' own headsets report they stop drawing: nobody
      sees past it.
    </p>
  </div>
</template>
