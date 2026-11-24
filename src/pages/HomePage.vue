<script setup lang="ts">
import { routeHref } from '../lib/hashRoute.ts'

const destinations = [
  {
    href: routeHref({ page: 'compare', view: 'table', measure: null }),
    icon: '▦',
    title: 'Compare headsets',
    text: 'Pick a measuring tool, then see what people measured in each headset.',
  },
  {
    href: routeHref({ page: 'compare', view: 'radar', measure: null }),
    icon: '◎',
    title: 'Overlay shapes',
    text: 'See several headsets’ field of view on one radar.',
  },
  {
    href: routeHref({ page: 'submit' }),
    icon: '＋',
    title: 'Add a measure',
    text: 'Measured with VR Headset Picker, WIMFOV or TestHMD? Bring the result here.',
  },
  {
    href: routeHref({ page: 'method', section: null }),
    icon: '?',
    title: 'How it works',
    text: 'What the numbers mean, in a couple of minutes.',
  },
] as const
</script>

<template>
  <div>
    <div class="hero">
      <h1>How much do people really see in each VR headset?</h1>
      <p class="muted">
        The field of view people actually see in VR headsets, measured by the people wearing them, with how the
        headset fits their face and how it is set up.
      </p>
    </div>
    <div class="destinations">
      <a
        v-for="destination in destinations"
        :key="destination.href"
        class="destination"
        :href="destination.href"
      >
        <span
          class="icon"
          aria-hidden="true"
        >{{ destination.icon }}</span>
        <b>{{ destination.title }}</b>
        <span class="muted">{{ destination.text }}</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.hero {
  max-width: 760px;
  margin: 30px auto 0;
  text-align: center;
}
.hero h1 {
  font-size: clamp(26px, 5vw, 34px);
}
.hero p {
  font-size: 17px;
}
.destinations {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-top: 28px;
}
.destination {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  color: var(--text);
  text-decoration: none;
}
.destination:hover,
.destination:focus-visible {
  border-color: var(--accent);
}
.destination b {
  font-size: 18px;
}
.icon {
  font-size: 26px;
  color: var(--accent);
}
</style>
