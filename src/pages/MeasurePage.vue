<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, useTemplateRef, watch } from 'vue'
import { formatDegrees } from '../lib/degrees.ts'
import MeasurePreview from '../components/MeasurePreview.vue'
import { browserStorage, rememberAnswerMode, rememberedAnswerMode } from '../lib/answerModeMemory.ts'
import type { AnswerMode } from '../lib/answerTargets.ts'
import { browserMeasureEnvironment, browserXr } from '../lib/browserXr.ts'
import { routeHref } from '../lib/hashRoute.ts'
import { emptyDraft, finishDraft, keptFinishedMeasure, type StepIndex } from '../lib/measureDraft.ts'
import { directionsOf, estimatedMinutes, type AtlasMeasure, type DirectionChoice } from '../lib/measureSession.ts'
import {
  measureAvailability,
  runMeasure,
  type Availability,
  type MeasureFailure,
  type MeasureHandle,
  type MeasureOutcome,
  type MeasureUpdate,
} from '../lib/webxrMeasure.ts'
import KeepMeasureButtons from './addMeasure/KeepMeasureButtons.vue'
import StepWizard from './addMeasure/StepWizard.vue'
import { draftKey } from './addMeasure/draftContext.ts'

type Phase =
  | { readonly kind: 'ready' }
  | { readonly kind: 'measuring'; readonly update: MeasureUpdate | null }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'failed'; readonly reason: MeasureFailure }
  | { readonly kind: 'finishing'; readonly measure: AtlasMeasure }

const availability = ref<Availability | 'checking'>('checking')
const phase = ref<Phase>({ kind: 'ready' })
const choice = ref<DirectionChoice>('principal')
const storage = browserStorage()
const mode = ref<AnswerMode>(rememberedAnswerMode(storage))
watch(mode, (chosen) => {
  rememberAnswerMode(storage, chosen)
})
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let handle: MeasureHandle | null = null

const draft = reactive(emptyDraft())
provide(draftKey, draft)
const finishSteps: readonly StepIndex[] = [2, 3, 4, 5]
const keptNow = computed(() => keptFinishedMeasure(draft))

onMounted(async () => {
  availability.value = await measureAvailability(browserXr())
})
onBeforeUnmount(() => {
  handle?.stop()
})

function onFinished(outcome: MeasureOutcome): void {
  handle = null
  if (outcome.kind === 'measured') {
    Object.assign(draft, finishDraft(outcome.measure))
    phase.value = { kind: 'finishing', measure: outcome.measure }
  } else {
    phase.value = outcome
  }
}

async function start(): Promise<void> {
  const environment = canvas.value === null ? null : browserMeasureEnvironment(canvas.value)
  if (environment === null) {
    phase.value = { kind: 'failed', reason: 'renderer-unavailable' }
    return
  }
  phase.value = { kind: 'measuring', update: null }
  handle = await runMeasure(
    environment,
    { choice: choice.value, mode: mode.value },
    {
      progress: (update) => {
        if (phase.value.kind !== 'measuring') return
        phase.value = { kind: 'measuring', update }
        // Switching to head pointing from inside the headset is remembered like a choice made here.
        mode.value = update.mode
      },
      finished: onFinished,
    },
  )
}

function stop(): void {
  handle?.stop()
}

function discard(): void {
  Object.assign(draft, emptyDraft())
  phase.value = { kind: 'ready' }
}

const failureMessages: Readonly<Record<MeasureFailure, string>> = {
  'session-refused': "The headset didn't open. Check that it is connected and awake, then try again.",
  'renderer-unavailable': "This browser couldn't start drawing in the headset.",
  'views-missing': "The headset didn't report a picture for each eye, which the measure needs.",
  'projection-unreadable': 'The headset reported its pictures in a way this site cannot read yet.',
  'ceiling-out-of-range': 'The headset reported its pictures in a way this site cannot read yet.',
  'edges-unsettled':
    'In at least one direction the answers kept changing, so its edge could not be found. Start again, and answer only whether you see the line.',
}

const readyWords: ReadonlyMap<AnswerMode, string> = new Map([
  ['head', 'Put your headset on, look around a little, then look at the dot and hold still until its ring fills.'],
  ['controller', 'Put your headset on, look at the dot, then press the trigger.'],
  ['keyboard', 'Put your headset on, look at the dot, then press Enter.'],
])

const progressWords = computed(() => {
  if (phase.value.kind !== 'measuring' || phase.value.update === null) return 'Put your headset on.'
  const { stage, mode: inUse, done, total, eye } = phase.value.update
  if (stage === 'ready') return readyWords.get(inUse) ?? ''
  const eyeWords = eye === null ? '' : ` Now the ${eye} eye.`
  return `${String(done)} of ${String(total)} directions done.${eyeWords}`
})

const noPressWords = computed(() => {
  if (phase.value.kind !== 'measuring' || phase.value.update?.noPressArrived !== true) return null
  const what = phase.value.update.mode === 'keyboard' ? 'No key press' : 'No controller press'
  return `${what} has reached this page yet. In the headset, look at the arrow below the dot and hold until its ring fills to answer with your head instead.`
})

interface ModeOption {
  readonly value: AnswerMode
  readonly label: string
  readonly how: string
  /** About how long one answer takes, in seconds: a head hold takes longer than a press. */
  readonly secondsPerAnswer: number
}
const modeOptions: readonly ModeOption[] = [
  { value: 'head', label: 'Head', how: 'turn toward Yes or No and hold until the ring fills; the small arrow further down = back one answer', secondsPerAnswer: 3 },
  { value: 'controller', label: 'Controller', how: 'trigger, A or X = Yes; B or Y = No; grip = back one answer', secondsPerAnswer: 2.5 },
  { value: 'keyboard', label: 'Keyboard', how: 'Enter = Yes; Space = No; Backspace = back one answer', secondsPerAnswer: 2.5 },
]

const choiceOptions = computed(() => {
  const seconds = modeOptions.find((option) => option.value === mode.value)?.secondsPerAnswer ?? 3
  return (['principal', 'all'] as const).map((value) => ({
    value,
    label: `${String(directionsOf(value).length)} directions per eye (about ${String(estimatedMinutes(value, seconds))} minutes)`,
  }))
})

const renderedRows = computed(() => {
  if (phase.value.kind !== 'finishing' || phase.value.measure.ceiling.source !== 'measured') return []
  const { ceiling } = phase.value.measure
  return [
    { eye: 'Left', ear: ceiling.left.left, nose: ceiling.left.right, up: ceiling.left.up, down: ceiling.left.down },
    { eye: 'Right', ear: ceiling.right.right, nose: ceiling.right.left, up: ceiling.right.up, down: ceiling.right.down },
  ]
})
const maskDetected = computed(() => phase.value.kind === 'finishing' && phase.value.measure.cornerMask === 'on')
const leftOut = computed(() =>
  phase.value.kind === 'finishing'
    ? phase.value.measure.unsettled.map(({ eye, direction }) => `${eye} eye, ${direction.replaceAll('-', ' ')}`).join('; ')
    : '',
)
</script>

<template>
  <div>
    <canvas
      ref="canvas"
      hidden
    />
    <template v-if="phase.kind === 'finishing'">
      <h1>Finish your measure</h1>
      <p class="muted">
        Your FOV Atlas measure is done. A few questions, then you publish it, or keep it without publishing.
        <a
          class="button ghost"
          :href="routeHref({ page: 'submit' })"
          @click="discard"
        >Discard it</a>
      </p>
      <div class="note">
        Publishing needs a free GitHub account: that is also how you remove your measure later.
        <a
          href="https://github.com/signup"
          target="_blank"
          rel="noopener noreferrer"
        >Create one</a>
        if you don't have one.
      </div>
      <section
        v-if="keptNow !== null"
        class="card keep-now"
      >
        <h2>Keep it without publishing</h2>
        <p class="small muted">
          No GitHub account, or not ready to publish? Keep the measure to compare with it later, now or at any step
          below. The headset and face fit go in once you answer them and are left out until then. Nothing is sent
          anywhere: a link keeps the measure after the “#”, a part of the address browsers never send.
        </p>
        <KeepMeasureButtons :submission="keptNow" />
      </section>
      <p
        v-if="leftOut !== ''"
        class="note"
      >
        Left out of the measure, because the answers there kept changing: {{ leftOut }}. Those directions are optional.
      </p>
      <div class="results">
        <section class="card">
          <h2>What you saw</h2>
          <MeasurePreview :measures="phase.measure.measures" />
        </section>
        <section class="card">
          <h2>What your headset draws</h2>
          <p class="small muted">
            How far your headset draws the picture for each eye, from straight ahead, read from the browser while you
            measured. Nobody can see past it.
          </p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Eye</th>
                  <th>Toward the ear</th>
                  <th>Toward the nose</th>
                  <th>Up</th>
                  <th>Down</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in renderedRows"
                  :key="row.eye"
                >
                  <td>{{ row.eye }}</td>
                  <td>{{ formatDegrees(row.ear) }}</td>
                  <td>{{ formatDegrees(row.nose) }}</td>
                  <td>{{ formatDegrees(row.up) }}</td>
                  <td>{{ formatDegrees(row.down) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="small">
            Corner mask: <b>{{ maskDetected ? 'detected' : 'not reported' }}</b>
          </p>
          <p class="small muted">
            Some headsets leave the corners of each picture dark. When the browser says so, the measure records it.
            <template v-if="!maskDetected">
              “Not reported” means the browser didn't say: the corners may be drawn, or the browser may not tell.
            </template>
          </p>
        </section>
      </div>
      <StepWizard :step-indices="finishSteps" />
    </template>

    <template v-else>
      <h1>Measure my field of view</h1>
      <div class="columns">
        <section class="card">
          <h2>How it goes</h2>
          <ol>
            <li>Open this page in your headset's browser, or on a PC in Chrome or Edge with the headset running.</li>
            <li>Choose how you answer, then press <b>Start in the headset</b>.</li>
            <li>
              Put the headset on and look at the dot in the middle. With <b>Head</b>, look around a little, then hold
              still until the ring around the dot fills; otherwise press Yes (the trigger, or Enter). Nothing is asked
              before that.
            </li>
            <li>A short line appears somewhere toward the edge, across its direction, and stays still. Keep looking at the dot.</li>
            <li>
              Can you see the line? With <b>Head</b>, turn your head a little toward <b>Yes</b> (the tick) or
              <b>No</b> (the cross) and hold until the ring fills; the small arrow further down goes back one answer. With
              a <b>Controller</b> or the <b>Keyboard</b>, press Yes or No.
            </li>
            <li>The line jumps to a new spot after each answer, halving the gap each time, until it settles on the last spot you can still see.</li>
            <li>Every direction of the left eye, then of the right eye. The other eye's screen stays black meanwhile.</li>
          </ol>
          <p class="small muted">
            The page also reads how far your headset draws the picture for each eye, so your measure carries its own
            limit. Nothing is sent anywhere while you measure.
          </p>
        </section>
        <section class="card">
          <h2>Start</h2>
          <p
            v-if="availability === 'checking'"
            class="muted"
          >
            Checking whether this browser can reach a headset…
          </p>
          <template v-else-if="availability === 'no-webxr'">
            <p>This browser can't reach a VR headset, so the measure can't start here.</p>
            <p class="muted">
              Open this page in your headset's own browser (on a Quest, its Browser app), or on a PC in Chrome or Edge
              while SteamVR or your headset's software is running.
            </p>
          </template>
          <template v-else-if="availability === 'no-headset'">
            <p>This browser can work with VR headsets, but no headset answered.</p>
            <p class="muted">
              Connect your headset and start its software, then reload this page.
            </p>
          </template>
          <template v-else-if="phase.kind === 'measuring'">
            <p role="status">
              {{ progressWords }}
            </p>
            <p
              v-if="noPressWords !== null"
              class="problem"
              role="alert"
            >
              {{ noPressWords }}
            </p>
            <button
              type="button"
              class="button ghost"
              @click="stop"
            >
              Stop
            </button>
          </template>
          <template v-else>
            <fieldset class="step-fieldset">
              <legend class="field-label">
                How you answer
              </legend>
              <label
                v-for="option in modeOptions"
                :key="option.value"
                class="choice-line"
              >
                <input
                  v-model="mode"
                  type="radio"
                  name="answer-mode"
                  :value="option.value"
                >
                <b>{{ option.label }}</b>: {{ option.how }}
              </label>
            </fieldset>
            <fieldset class="step-fieldset">
              <legend class="field-label">
                How many directions
              </legend>
              <label
                v-for="option in choiceOptions"
                :key="option.value"
                class="choice-line"
              >
                <input
                  v-model="choice"
                  type="radio"
                  name="direction-choice"
                  :value="option.value"
                >
                {{ option.label }}
              </label>
            </fieldset>
            <p
              v-if="phase.kind === 'stopped'"
              class="problem"
              role="status"
            >
              The measure stopped before the end, so nothing was kept. Start again whenever you are ready.
            </p>
            <p
              v-else-if="phase.kind === 'failed'"
              class="problem"
              role="status"
            >
              {{ failureMessages[phase.reason] }}
            </p>
            <button
              type="button"
              class="button"
              @click="start"
            >
              Start in the headset
            </button>
          </template>
        </section>
      </div>
      <p class="small muted">
        Measured with another tool? <a :href="routeHref({ page: 'submit' })">Add a measure</a> brings its result here.
      </p>
    </template>
  </div>
</template>

<style scoped>
.columns,
.results {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
  margin: 16px 0;
}
@media (max-width: 820px) {
  .columns,
  .results {
    grid-template-columns: minmax(0, 1fr);
  }
}
.choice-line {
  display: block;
  margin: 4px 0;
}
.keep-now {
  margin: 16px 0;
}
</style>
