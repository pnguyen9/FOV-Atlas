<script setup lang="ts">
defineProps<{ framed: boolean }>()
</script>

<template>
  <main>
    <h1>FOV Atlas</h1>
    <p v-if="framed">
      FOV Atlas only runs in its own tab. Open it directly at its own address.
    </p>
    <p v-else>
      The field of view people actually see in VR headsets, measured by the people wearing them.
    </p>
  </main>
</template>
