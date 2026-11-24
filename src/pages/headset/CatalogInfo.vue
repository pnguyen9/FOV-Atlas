<script setup lang="ts">
/** The model as the catalog lists it. */
import type { Headset } from '../../data/headsets.ts'

defineProps<{ readonly headset: Headset }>()
</script>

<template>
  <section
    class="card"
    aria-labelledby="catalog-heading"
  >
    <h2 id="catalog-heading">
      About this model
    </h2>
    <dl class="catalog">
      <div>
        <dt>Brand</dt>
        <dd>{{ headset.brand }}</dd>
      </div>
      <div>
        <dt>Model</dt>
        <dd>{{ headset.name }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0;
}
.catalog dt {
  font-size: 12px;
  color: var(--muted);
}
.catalog dd {
  margin: 0;
  font-weight: 600;
}
</style>
