<script setup lang="ts">
import { computed } from 'vue'
import { eyeDepthOptions, noseBridgeOptions } from '../../components/faceFit.ts'
import { catalogHeadset, otherHeadset } from '../../lib/headsets.ts'
import { renderIssueBody } from '../../lib/issueForm.ts'
import { issueOf, keptMeasureOf, type IssueResult } from '../../lib/measureDraft.ts'
import { toolNameOf } from '../../lib/submission.ts'
import KeepMeasureButtons from './KeepMeasureButtons.vue'
import { useDraft } from './draftContext.ts'

const draft = useDraft()
const issue = computed(() => issueOf(draft))
const issueBody = computed(() => (issue.value.ok ? renderIssueBody(issue.value.fields) : ''))
const readsWimfovLater = computed(() => issue.value.ok && issue.value.fields['wimfov-link'] !== '')

const kept = computed(() => keptMeasureOf(draft))

const yesNo = (value: boolean): string => (value ? 'Yes' : 'No')

const summary = computed(() => {
  const headset = draft.headset === otherHeadset ? `${draft.otherHeadsetName} (not listed yet)` : catalogHeadset(draft.headset)?.name
  return [
    { label: 'Tool', value: draft.tool === null ? '' : toolNameOf(draft.tool) },
    { label: 'Headset', value: headset ?? '' },
    { label: 'Eyes vs brow', value: eyeDepthOptions.find((option) => option.value === draft.eyeDepth)?.label ?? '' },
    { label: 'Nose bridge', value: noseBridgeOptions.find((option) => option.value === draft.noseBridge)?.label ?? '' },
    { label: 'Physically modded', value: yesNo(draft.physicallyModded) },
    { label: 'Driver tuned', value: yesNo(draft.driverTuned) },
    { label: 'Tuning details', value: draft.tuningDetails.trim() },
    { label: 'Gaze', value: draft.gaze === 'fixed' ? 'Stared at the centre' : 'Looked toward the marker' },
    { label: 'Lens IPD', value: draft.ipd.trim() === '' ? '' : `${draft.ipd.trim()} mm` },
    { label: 'Facial interface and cushion', value: draft.facialInterface.trim() },
    { label: 'Note', value: draft.note.trim() },
  ].filter((row) => row.value !== '')
})

function problemText(result: IssueResult): string {
  if (result.ok) return ''
  if (result.error === 'url-too-long') return 'This measure is too long for a GitHub link. Shorten the note or the details.'
  if (result.error === 'incomplete') return 'A step above is not complete yet.'
  return `This measure doesn't pass the checks every submission goes through (${result.error}). Go back and check the values.`
}
</script>

<template>
  <div>
    <h2>Review and send</h2>
    <dl class="summary">
      <div
        v-for="row in summary"
        :key="row.label"
      >
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <template v-if="issue.ok">
      <p>
        The button opens a GitHub page with everything filled in: press “Create” there and it is sent.
        <template v-if="readsWimfovLater">
          The values are read from the WIMFOV link at that point.
        </template>
      </p>
      <ul class="small">
        <li>Everything on the issue is public, and the GitHub name it is posted under is shown next to the measure.</li>
        <li>To remove it later, comment <code>/withdraw</code> on the issue.</li>
        <li>The issue can be edited afterwards: every edit is checked again.</li>
      </ul>
      <p>
        <a
          class="button"
          :href="issue.url"
          target="_blank"
          rel="noopener noreferrer"
        >Open on GitHub ↗</a>
      </p>
      <details>
        <summary class="small muted">
          What the issue will contain
        </summary>
        <pre>{{ issueBody }}</pre>
      </details>
    </template>
    <p
      v-else
      class="problem"
      role="status"
    >
      {{ problemText(issue) }}
    </p>

    <h3>Keep it without publishing</h3>
    <template v-if="kept.ok">
      <p class="muted">
        No GitHub account, or not ready to publish? Keep the measure to compare with it later. Nothing is sent
        anywhere: a link keeps the measure after the “#”, a part of the address browsers never send.
      </p>
      <KeepMeasureButtons :submission="kept.submission" />
    </template>
    <p
      v-else-if="kept.error === 'wimfov-link'"
      class="muted"
    >
      A WIMFOV read-only link holds no values this page can read. To keep the measure, go back to Values and paste
      the points of the result.
    </p>
    <p
      v-else
      class="muted"
    >
      Complete the steps above to keep the measure.
    </p>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0 0 16px;
}
.summary div {
  display: contents;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
pre {
  background: var(--surface-2);
  border-radius: 8px;
  padding: 10px;
  overflow-x: auto;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
