<script setup lang="ts">
import { computed, nextTick, provide, reactive, ref, useTemplateRef } from 'vue'
import { emptyDraft, furthestStep, lastStep, stepReady, steps, vrhpPrefill, type StepIndex } from '../lib/measureDraft.ts'
import FaceFitStep from './addMeasure/FaceFitStep.vue'
import HeadsetStep from './addMeasure/HeadsetStep.vue'
import ReviewStep from './addMeasure/ReviewStep.vue'
import SetupStep from './addMeasure/SetupStep.vue'
import ToolStep from './addMeasure/ToolStep.vue'
import ValuesStep from './addMeasure/ValuesStep.vue'
import { draftKey } from './addMeasure/draftContext.ts'

const draft = reactive(emptyDraft())
provide(draftKey, draft)

const stepComponents = [ToolStep, ValuesStep, HeadsetStep, FaceFitStep, SetupStep, ReviewStep] as const
const current = ref<StepIndex>(0)
const furthest = computed(() => furthestStep(draft))
const currentReady = computed(() => stepReady(draft, current.value))
const panel = useTemplateRef<HTMLElement>('panel')

async function goTo(step: number): Promise<void> {
  if (step < 0 || step > furthest.value) return
  if (current.value === 1 && step > 1) Object.assign(draft, vrhpPrefill(draft))
  current.value = step as StepIndex
  // Keyboard and screen reader users land on the new step, not on the button they pressed.
  await nextTick()
  panel.value?.focus()
}
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
    <div class="wizard">
      <nav
        class="card step-list"
        aria-label="Steps"
      >
        <ol>
          <li
            v-for="(label, stepIndex) in steps"
            :key="label"
          >
            <button
              type="button"
              :class="{ current: stepIndex === current, done: stepIndex < current }"
              :aria-current="stepIndex === current ? 'step' : undefined"
              :disabled="stepIndex > furthest"
              @click="goTo(stepIndex)"
            >
              {{ stepIndex + 1 }}. {{ label }}
            </button>
          </li>
        </ol>
      </nav>
      <section
        ref="panel"
        class="card"
        tabindex="-1"
        :aria-label="steps[current]"
      >
        <component :is="stepComponents[current]" />
        <div class="step-buttons">
          <button
            type="button"
            class="button ghost"
            :disabled="current === 0"
            @click="goTo(current - 1)"
          >
            Back
          </button>
          <button
            v-if="current < lastStep"
            type="button"
            class="button"
            :disabled="!currentReady"
            @click="goTo(current + 1)"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wizard {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}
@media (max-width: 820px) {
  .wizard {
    grid-template-columns: minmax(0, 1fr);
  }
}
.step-list ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
@media (max-width: 820px) {
  .step-list ol {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
.step-list button {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}
.step-list button.done {
  color: var(--text);
}
.step-list button.current {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.step-list button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
section:focus {
  outline: none;
}
.step-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}
</style>
