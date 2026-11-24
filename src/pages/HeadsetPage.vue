<script setup lang="ts">
import { computed } from 'vue'
import { catalogHeadset } from '../lib/headsets.ts'

const props = defineProps<{ readonly headset: string }>()
const name = computed(() => catalogHeadset(props.headset)?.name)
</script>

<template>
  <div>
    <h1>{{ name ?? 'Unknown headset' }}</h1>
    <p v-if="name === undefined">
      No headset in the list has this address.
    </p>
    <p class="note">
      This page is still being built: it will show every measure of the headset, one tool at a time.
    </p>
    <p><a href="#compare">Back to Compare</a></p>
  </div>
</template>
