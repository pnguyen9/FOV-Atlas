<script setup lang="ts">
/** The ways to keep a measure without publishing it: a link, its text, or a .json file (see `measureFile.ts`). */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { encodeMeasureText, measureLink } from '../../lib/measureFile.ts'
import type { KeptSubmission } from '../../lib/submission.ts'

const { submission } = defineProps<{ submission: KeptSubmission }>()

const keptText = computed(() => encodeMeasureText(submission))
const keptLink = computed(() => measureLink(submission, window.location.href))
const fileName = computed(() => `fov-atlas-${submission.headset === '' ? 'measure' : submission.headset}-${submission.tool}.json`)

/** The file behind "Save as a file", replaced whenever the measure changes. */
const fileUrl = ref('')
function releaseFile(): void {
  if (fileUrl.value !== '') URL.revokeObjectURL(fileUrl.value)
  fileUrl.value = ''
}
watch(
  keptText,
  (text) => {
    releaseFile()
    fileUrl.value = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  },
  { immediate: true },
)
onBeforeUnmount(releaseFile)

type CopyState = { readonly kind: 'idle' } | { readonly kind: 'copied'; readonly what: string } | { readonly kind: 'manual'; readonly text: string }
const copyState = ref<CopyState>({ kind: 'idle' })

/** The clipboard can be refused (an insecure page, a denied permission): the text is then shown to copy by hand. */
async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copyState.value = { kind: 'copied', what }
  } catch {
    copyState.value = { kind: 'manual', text }
  }
}
</script>

<template>
  <div>
    <div class="keep-buttons">
      <button
        type="button"
        class="button ghost"
        @click="copy(keptLink, 'link')"
      >
        Copy as a link
      </button>
      <button
        type="button"
        class="button ghost"
        @click="copy(keptText, 'text')"
      >
        Copy as text
      </button>
      <a
        class="button ghost"
        :href="fileUrl"
        :download="fileName"
      >Save as a file</a>
    </div>
    <p
      v-if="copyState.kind === 'copied'"
      class="small success"
      role="status"
    >
      The {{ copyState.what }} is copied.
    </p>
    <template v-else-if="copyState.kind === 'manual'">
      <p
        class="small"
        role="status"
      >
        This browser didn't allow copying. Select the text below and copy it.
      </p>
      <textarea
        class="manual-copy"
        readonly
        rows="4"
        :value="copyState.text"
      />
    </template>
  </div>
</template>

<style scoped>
.keep-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.manual-copy {
  margin-top: 4px;
}
</style>
