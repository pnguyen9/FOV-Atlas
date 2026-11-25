<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { furthestStep, stepReady, steps, vrhpPrefill, type StepIndex } from '../../lib/measureDraft.ts'
import FaceFitStep from './FaceFitStep.vue'
import HeadsetStep from './HeadsetStep.vue'
import ReviewStep from './ReviewStep.vue'
import SetupStep from './SetupStep.vue'
import ToolStep from './ToolStep.vue'
import ValuesStep from './ValuesStep.vue'
import { useDraft } from './draftContext.ts'

/** The steps shown, in order: all of them to add a measure, fewer to finish one whose tool and values are known. */
const { stepIndices } = defineProps<{ stepIndices: readonly StepIndex[] }>()

const draft = useDraft()
const stepComponents = [ToolStep, ValuesStep, HeadsetStep, FaceFitStep, SetupStep, ReviewStep] as const
const current = ref<StepIndex>(stepIndices[0] ?? 0)
const position = computed(() => stepIndices.indexOf(current.value))
const furthest = computed(() => furthestStep(draft))
const currentReady = computed(() => stepReady(draft, current.value))
const panel = useTemplateRef<HTMLElement>('panel')

async function goTo(step: StepIndex | undefined): Promise<void> {
  if (step === undefined || step > furthest.value) return
  if (current.value === 1 && step > 1) Object.assign(draft, vrhpPrefill(draft))
  current.value = step
  // Keyboard and screen reader users land on the new step, not on the button they pressed.
  await nextTick()
  panel.value?.focus()
}
</script>

<template>
  <div class="wizard">
    <nav
      class="card step-list"
      aria-label="Steps"
    >
      <ol>
        <li
          v-for="(stepIndex, order) in stepIndices"
          :key="stepIndex"
        >
          <button
            type="button"
            :class="{ current: stepIndex === current, done: order < position }"
            :aria-current="stepIndex === current ? 'step' : undefined"
            :disabled="stepIndex > furthest"
            @click="goTo(stepIndex)"
          >
            {{ order + 1 }}. {{ steps[stepIndex] }}
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
          :disabled="position === 0"
          @click="goTo(stepIndices[position - 1])"
        >
          Back
        </button>
        <button
          v-if="position < stepIndices.length - 1"
          type="button"
          class="button"
          :disabled="!currentReady"
          @click="goTo(stepIndices[position + 1])"
        >
          Next
        </button>
      </div>
    </section>
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
