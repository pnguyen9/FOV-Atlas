<script setup lang="ts">
import { computed } from 'vue'
import { brands, modelsOf, otherHeadset } from '../../lib/headsets.ts'
import { headsetMessage } from '../../lib/measureDraft.ts'
import { textLimits } from '../../lib/submission.ts'
import { useDraft } from './draftContext.ts'

const draft = useDraft()

const models = computed(() => (draft.brand === '' || draft.brand === otherHeadset ? [] : modelsOf(draft.brand)))
const message = computed(() => headsetMessage(draft))
const prefilled = computed(() => draft.tool === 'vrhp' && draft.prefilledFrom !== '' && draft.headset !== '')

function selectBrand(brand: string): void {
  draft.brand = brand
  draft.otherHeadsetName = ''
  if (brand === otherHeadset) {
    draft.headset = otherHeadset
    return
  }
  // A brand with a single model needs no second choice.
  const brandModels = modelsOf(brand)
  draft.headset = brandModels.length === 1 ? (brandModels[0]?.id ?? '') : ''
}

function onBrandChange(event: Event): void {
  selectBrand((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div>
    <h2>Which headset?</h2>
    <p class="muted">
      Pick it here even when the tool named it: a tool's own name for the headset can be wrong (WIMFOV reports a
      Pimax Dream Air as “Pimax Crystal”).
    </p>
    <p
      v-if="prefilled"
      class="small success"
    >
      Preselected from the VR Headset Picker link. Check that it is right.
    </p>
    <div class="inline-fields">
      <label class="field">
        <span class="field-label">Brand</span>
        <select
          :value="draft.brand"
          @change="onBrandChange"
        >
          <option
            value=""
            disabled
          >Choose a brand</option>
          <option
            v-for="brand in brands"
            :key="brand"
            :value="brand"
          >{{ brand }}</option>
          <option :value="otherHeadset">Other (not listed)</option>
        </select>
      </label>
      <label
        v-if="models.length > 0"
        class="field"
      >
        <span class="field-label">Model</span>
        <select v-model="draft.headset">
          <option
            value=""
            disabled
          >Choose a model</option>
          <option
            v-for="model in models"
            :key="model.id"
            :value="model.id"
          >{{ model.name }}</option>
        </select>
      </label>
    </div>
    <template v-if="draft.brand === otherHeadset">
      <label class="field">
        <span class="field-label">Brand and model</span>
        <input
          v-model="draft.otherHeadsetName"
          type="text"
          :maxlength="textLimits.otherHeadsetName"
          autocomplete="off"
          placeholder="e.g. Somnium VR1"
        >
      </label>
      <p class="small muted">
        A maintainer checks the name and adds the model to the list before the measure is published.
      </p>
    </template>
    <p
      v-if="message !== null"
      class="problem"
      role="status"
    >
      {{ message }}
    </p>
  </div>
</template>
