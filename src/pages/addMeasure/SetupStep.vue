<script setup lang="ts">
import { computed } from 'vue'
import { setupProblems } from '../../lib/measureDraft.ts'
import { gazes, textLimits, type Gaze } from '../../lib/submission.ts'
import { useDraft } from './draftContext.ts'

const draft = useDraft()
const problems = computed(() => setupProblems(draft))

const gazeLabels: Readonly<Record<Gaze, string>> = {
  fixed: 'Stared at the centre the whole time',
  free: 'Looked toward the marker',
}
</script>

<template>
  <div>
    <h2>Setup</h2>
    <fieldset class="step-fieldset">
      <legend class="field-label">
        Tuning
      </legend>
      <p class="small muted">
        Driver tuning changes how much the headset draws, never how it fits the face. Tick what applies, even when
        unsure it made a difference.
      </p>
      <div class="choice-row">
        <label><input
          v-model="draft.physicallyModded"
          type="checkbox"
        > Physically modded</label>
        <label><input
          v-model="draft.driverTuned"
          type="checkbox"
        > Driver tuned</label>
      </div>
    </fieldset>
    <label class="field">
      <span class="field-label">Tuning details (optional)</span>
      <input
        v-model="draft.tuningDetails"
        type="text"
        :maxlength="textLimits.tuningDetails"
        autocomplete="off"
        placeholder="e.g. field of view set to Large in the headset's software"
      >
    </label>
    <p
      v-if="problems.tuningDetails"
      class="problem"
      role="status"
    >
      {{ problems.tuningDetails }}
    </p>

    <fieldset class="step-fieldset">
      <legend class="field-label">
        Gaze while measuring
      </legend>
      <div class="choice-row">
        <label
          v-for="gaze in gazes"
          :key="gaze"
        >
          <input
            v-model="draft.gaze"
            type="radio"
            name="gaze"
            :value="gaze"
          > {{ gazeLabels[gaze] }}
        </label>
      </div>
    </fieldset>

    <label class="field">
      <span class="field-label">Lens IPD in mm (optional)</span>
      <input
        v-model="draft.ipd"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        placeholder="63.5"
        class="short"
      >
    </label>
    <p
      v-if="problems.ipd"
      class="problem"
      role="status"
    >
      {{ problems.ipd }}
    </p>

    <label class="field">
      <span class="field-label">Facial interface and cushion (optional)</span>
      <input
        v-model="draft.facialInterface"
        type="text"
        :maxlength="textLimits.facialInterface"
        autocomplete="off"
        placeholder="e.g. stock interface, 3 mm thinner cushion"
      >
    </label>
    <p
      v-if="problems.facialInterface"
      class="problem"
      role="status"
    >
      {{ problems.facialInterface }}
    </p>

    <label class="field">
      <span class="field-label">Note (optional)</span>
      <textarea
        v-model="draft.note"
        rows="3"
        :maxlength="textLimits.note"
      />
    </label>
    <p
      v-if="problems.note"
      class="problem"
      role="status"
    >
      {{ problems.note }}
    </p>
  </div>
</template>
