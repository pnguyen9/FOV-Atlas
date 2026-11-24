<script setup lang="ts">
import { computed } from 'vue'
import MeasurePreview from '../../components/MeasurePreview.vue'
import { valuesMessage, valuesOf } from '../../lib/measureDraft.ts'
import { useDraft } from './draftContext.ts'

const draft = useDraft()

const result = computed(() => valuesOf(draft))
const values = computed(() => (result.value.ok ? result.value.values : null))
const message = computed(() => (result.value.ok ? null : valuesMessage(result.value.problem)))

const vrhpRows = computed(() => {
  if (values.value?.kind !== 'vrhp') return []
  const { left, right } = values.value.measure
  return [
    { eye: 'Left eye', angles: left },
    { eye: 'Right eye', angles: right },
  ]
})
</script>

<template>
  <div>
    <template v-if="draft.tool === 'vrhp'">
      <h2>VR Headset Picker share link</h2>
      <p class="muted">
        On the results page of VR Headset Picker, copy the share link and paste it here.
      </p>
      <label class="field">
        <span class="field-label">Share link</span>
        <textarea
          v-model="draft.vrhpLink"
          rows="3"
          spellcheck="false"
          autocomplete="off"
          placeholder="https://vrheadsetpicker.com/measure-your-fov/results?results=…"
        />
      </label>
      <template v-if="values?.kind === 'vrhp'">
        <p class="success">
          Link read.
          <template v-if="values.measure.headsetName !== ''">
            It names the headset “{{ values.measure.headsetName }}”.
          </template>
        </p>
        <div class="table-wrap">
          <table>
            <caption class="small muted">
              Angles in degrees, as the link gives them
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Eye
                </th><th scope="col">
                  Toward the ear
                </th><th scope="col">
                  Toward the nose
                </th><th scope="col">
                  Up
                </th><th scope="col">
                  Down
                </th><th scope="col">
                  Outer diagonal
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in vrhpRows"
                :key="row.eye"
              >
                <th scope="row">
                  {{ row.eye }}
                </th>
                <td>{{ row.angles.temporal }}</td>
                <td>{{ row.angles.nasal }}</td>
                <td>{{ row.angles.up }}</td>
                <td>{{ row.angles.down }}</td>
                <td>{{ row.angles.diagonal }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <template v-else-if="draft.tool === 'wimfov'">
      <h2>WIMFOV result</h2>
      <fieldset class="choice-row">
        <legend class="field-label">
          What do you have?
        </legend>
        <label><input
          v-model="draft.wimfovInput"
          type="radio"
          name="wimfov-input"
          value="link"
        > The read-only link</label>
        <label><input
          v-model="draft.wimfovInput"
          type="radio"
          name="wimfov-input"
          value="points"
        > The points of the result</label>
      </fieldset>
      <template v-if="draft.wimfovInput === 'link'">
        <p class="muted">
          On your WIMFOV result page, copy the read-only link, the one ending in “?id=…”. Never paste the edit link:
          the GitHub issue is public, and anyone holding the edit link can change or delete the result.
        </p>
        <label class="field">
          <span class="field-label">Read-only link</span>
          <input
            v-model="draft.wimfovLink"
            type="url"
            spellcheck="false"
            autocomplete="off"
            placeholder="https://andreasaronsson.com/!apps/wimfov/?id=…"
          >
        </label>
        <p
          v-if="values?.kind === 'wimfov-link'"
          class="success"
        >
          Read-only link accepted. Your browser can't open WIMFOV's pages from here, so the values are read from
          WIMFOV when the GitHub issue is processed, and there is no preview.
        </p>
      </template>
      <template v-else>
        <p class="muted">
          Paste the “points” line of your WIMFOV result: two groups of 16 numbers separated by “|”. The whole line
          with “"points":” in front of it works too.
        </p>
        <label class="field">
          <span class="field-label">Points</span>
          <textarea
            v-model="draft.wimfovPoints"
            rows="3"
            spellcheck="false"
            autocomplete="off"
            placeholder="&quot;points&quot;:&quot;38,50,50,40,…|39,41,50,49,…&quot;"
          />
        </label>
        <MeasurePreview
          v-if="values?.kind === 'wimfov-points'"
          :measures="values.measures"
        />
      </template>
    </template>

    <template v-else-if="draft.tool === 'testhmd'">
      <h2>TestHMD angles</h2>
      <p class="muted">
        Type the two angles TestHMD showed. It moves a dot out to both sides at once, with both eyes open, so it gives
        one horizontal and one vertical angle, and no diagonals or overlap.
      </p>
      <div class="inline-fields">
        <label class="field">
          <span class="field-label">Horizontal (°)</span>
          <input
            v-model="draft.testHmdHorizontal"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="102.5"
          >
        </label>
        <label class="field">
          <span class="field-label">Vertical (°)</span>
          <input
            v-model="draft.testHmdVertical"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="96"
          >
        </label>
      </div>
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

<style scoped>
.table-wrap {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 14px;
}
caption {
  text-align: left;
  padding-bottom: 6px;
}
th,
td {
  padding: 6px 10px;
  text-align: right;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
th:first-child {
  text-align: left;
}
thead th {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}
</style>
