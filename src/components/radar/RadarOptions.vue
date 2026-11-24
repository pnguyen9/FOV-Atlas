<script setup lang="ts">
/** How the radar draws its shapes: which eye, which statistic, and the rendered ceiling. */
import SegmentedControl from '../SegmentedControl.vue'
import { compareState } from '../../pages/compare/compareState.ts'
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
const ceilingOptions: readonly { value: 'show' | 'hide'; label: string }[] = [
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
  <div class="control-group">
    <div class="field-label">
      Rendered ceiling
    </div>
    <SegmentedControl
      :model-value="compareState.radar.showCeiling ? 'show' : 'hide'"
      label="Rendered ceiling"
      :options="ceilingOptions"
      @update:model-value="(choice) => (compareState.radar.showCeiling = choice === 'show')"
    />
    <p class="small muted hint">
      Marks where the headset stops drawing its picture on each edge: nobody sees past them.
    </p>
  </div>
</template>
