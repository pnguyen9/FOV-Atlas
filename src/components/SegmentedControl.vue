<script setup lang="ts" generic="Value extends string">
/** A row of buttons of which exactly one is on. */
defineProps<{
  readonly label: string
  readonly options: readonly { readonly value: Value; readonly label: string }[]
}>()
const model = defineModel<Value>({ required: true })
</script>

<template>
  <div
    class="segmented"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="{ on: model === option.value }"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
