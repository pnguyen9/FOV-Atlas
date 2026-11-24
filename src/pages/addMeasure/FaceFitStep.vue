<script setup lang="ts">
import FaceFitDrawing from '../../components/FaceFitDrawing.vue'
import { eyeDepthOptions, noseBridgeOptions } from '../../components/faceFit.ts'
import { useDraft } from './draftContext.ts'

const draft = useDraft()
</script>

<template>
  <div>
    <h2>How does the headset sit on your face?</h2>
    <p class="muted">
      How close the eyes get to the lenses depends on the face, so this is what people filter on most, to find
      measures from people whose headset probably fits them the same way. Look at yourself from the side.
    </p>
    <fieldset class="step-fieldset">
      <legend><h3>Eyes vs brow</h3></legend>
      <div class="option-grid">
        <label
          v-for="option in eyeDepthOptions"
          :key="option.value"
          class="option-card centered"
          :class="{ selected: draft.eyeDepth === option.value }"
        >
          <input
            v-model="draft.eyeDepth"
            type="radio"
            name="eye-depth"
            :value="option.value"
          >
          <FaceFitDrawing
            feature="eye-depth"
            :value="option.value"
          />
          <b>{{ option.label }}</b>
          <span class="small muted">{{ option.hint }}</span>
        </label>
      </div>
    </fieldset>
    <fieldset class="step-fieldset">
      <legend><h3>Nose bridge</h3></legend>
      <div class="option-grid">
        <label
          v-for="option in noseBridgeOptions"
          :key="option.value"
          class="option-card centered"
          :class="{ selected: draft.noseBridge === option.value }"
        >
          <input
            v-model="draft.noseBridge"
            type="radio"
            name="nose-bridge"
            :value="option.value"
          >
          <FaceFitDrawing
            feature="nose-bridge"
            :value="option.value"
          />
          <b>{{ option.label }}</b>
          <span class="small muted">{{ option.hint }}</span>
        </label>
      </div>
    </fieldset>
  </div>
</template>
