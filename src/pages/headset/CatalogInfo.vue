<script setup lang="ts">
/** The model as the catalog lists it, and what hmdq recorded it renders, credited CC BY-SA. */
import { computed } from 'vue'
import type { Headset } from '../../data/headsets.ts'
import { formatDegrees } from '../../components/measureLabels.ts'
import { borrowedReferenceLabel, configurationsOf, hasCornerMask, hmdgdbPageUrl, referenceConfigurationOf } from '../../lib/headsets.ts'

const props = defineProps<{ readonly headset: Headset }>()

const borrowed = computed(() => borrowedReferenceLabel(props.headset.id))

const configurations = computed(() => {
  const reference = referenceConfigurationOf(props.headset.id)
  return configurationsOf(props.headset.id).map((configuration) => ({
    configuration,
    url: hmdgdbPageUrl(configuration),
    isReference: configuration === reference,
    masked: hasCornerMask(configuration),
  }))
})
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
    <template v-if="configurations.length > 0">
      <h3>What it renders</h3>
      <p
        v-if="borrowed !== undefined"
        class="small borrowed"
      >
        hmdq has no record of this model: these figures are {{ borrowed }}.
      </p>
      <p class="small muted">
        Recorded with hmdq, both eyes together. hmdq defines the vertical and diagonal figures its own way, so they are
        listed for reference and not set against the measures. With a corner mask, the headset skips drawing corners the
        lens hides, and the diagonal is what the mask leaves.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th
                class="text-cell"
                scope="col"
              >
                Configuration
              </th>
              <th scope="col">
                Horizontal
              </th>
              <th scope="col">
                Vertical
              </th>
              <th scope="col">
                Diagonal
              </th>
              <th scope="col">
                Overlap
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in configurations"
              :key="item.configuration.page"
            >
              <td class="text-cell">
                <a
                  :href="item.url"
                  rel="noopener noreferrer"
                >{{ item.configuration.config }}</a>
                <span
                  v-if="item.isReference"
                  class="tag"
                >reference</span>
              </td>
              <td>{{ formatDegrees(item.configuration.horizontal) }}</td>
              <td>
                {{ formatDegrees(item.configuration.vertical) }}
                <span
                  v-if="!item.configuration.verticalReliable"
                  class="tag"
                >unreliable</span>
              </td>
              <td>
                {{ formatDegrees(item.configuration.diagonal) }}
                <span class="tag">{{ item.masked ? 'with corner mask' : 'full frame' }}</span>
              </td>
              <td>{{ formatDegrees(item.configuration.overlap) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">
        Source: <a
          href="https://risa2000.github.io/hmdgdb/"
          rel="noopener noreferrer"
        >hmdq / hmdgdb by Richard Musil</a>, shared under
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          rel="noopener noreferrer"
        >CC BY-SA 4.0</a>.
      </p>
    </template>
    <p
      v-else
      class="small muted"
    >
      The hmdq HMD Geometry Database has no record of this model, so there is no rendered reference for it.
    </p>
  </section>
</template>

<style scoped>
.catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0 0 8px;
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
