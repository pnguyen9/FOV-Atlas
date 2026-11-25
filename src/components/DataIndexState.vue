<script setup lang="ts">
/** What a page listing measures says while the published index loads, or when it couldn't be loaded. */
import type { Loaded } from '../lib/siteData.ts'
import type { DataIndex } from '../lib/submissionStore.ts'

defineProps<{ readonly index: Loaded<DataIndex> | null }>()
</script>

<template>
  <p
    v-if="index === null"
    class="muted"
  >
    Loading the measures…
  </p>
  <p
    v-else-if="!index.ok"
    class="problem"
  >
    The measures couldn't be loaded. Try again in a moment.
  </p>
</template>
