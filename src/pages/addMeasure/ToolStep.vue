<script setup lang="ts">
import { importTools, type ImportTool } from '../../lib/measureDraft.ts'
import { toolNameOf } from '../../lib/submission.ts'
import { useDraft } from './draftContext.ts'

const draft = useDraft()

const descriptions: Readonly<Record<ImportTool, string>> = {
  vrhp: 'A share link from its results page.',
  wimfov: 'The read-only link of a result, or the points it lists.',
  testhmd: 'The horizontal and vertical angles it showed.',
}
const toolLinks: Readonly<Record<ImportTool, string>> = {
  vrhp: 'https://vrheadsetpicker.com/',
  wimfov: 'https://boll.itch.io/wimfov',
  testhmd: 'https://knob2001.itch.io/testhmd',
}
</script>

<template>
  <fieldset class="step-fieldset">
    <legend><h2>Which tool did you measure with?</h2></legend>
    <p class="muted">
      Numbers from one tool are only ever shown next to numbers from the same tool: each tool is its own standard.
    </p>
    <div class="option-grid">
      <label
        v-for="tool in importTools"
        :key="tool"
        class="option-card"
        :class="{ selected: draft.tool === tool }"
      >
        <input
          v-model="draft.tool"
          type="radio"
          name="tool"
          :value="tool"
        >
        <b>{{ toolNameOf(tool) }}</b>
        <span class="small muted">{{ descriptions[tool] }}</span>
      </label>
    </div>
    <p class="small muted">
      Haven't measured yet? Each tool explains how on its own site:
      <template
        v-for="(tool, toolIndex) in importTools"
        :key="tool"
      >
        <a
          :href="toolLinks[tool]"
          target="_blank"
          rel="noopener noreferrer"
        >{{ toolNameOf(tool) }}</a>{{ toolIndex < importTools.length - 1 ? ', ' : '.' }}
      </template>
    </p>
  </fieldset>
</template>
