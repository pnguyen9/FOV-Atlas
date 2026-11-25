<script setup lang="ts">
import { provide, reactive } from 'vue'
import { emptyDraft, steps, type StepIndex } from '../lib/measureDraft.ts'
import StepWizard from './addMeasure/StepWizard.vue'
import { draftKey } from './addMeasure/draftContext.ts'

const draft = reactive(emptyDraft())
provide(draftKey, draft)
const allSteps = steps.map((_, stepIndex) => stepIndex as StepIndex)
</script>

<template>
  <div>
    <h1>Add a measure</h1>
    <p class="muted">
      Measured with VR Headset Picker, WIMFOV or TestHMD? Bring the result here in a few steps.
    </p>
    <div class="note">
      Sending a measure needs a free GitHub account: measures are published as GitHub issues, which is also how they
      are removed later, with a <code>/withdraw</code> comment on the issue.
      <a
        href="https://github.com/signup"
        target="_blank"
        rel="noopener noreferrer"
      >Create an account</a>
      before starting if you don't have one. No GitHub account? You can still measure, keep the result and compare with
      it: the last step offers to keep it without publishing.
    </div>
    <StepWizard :step-indices="allSteps" />
  </div>
</template>

