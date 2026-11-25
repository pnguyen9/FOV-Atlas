<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, useTemplateRef, watch } from 'vue'
import { navigation, navigationPageOf, routeHref, useHashRoute } from './lib/hashRoute.ts'
import HomePage from './pages/HomePage.vue'
import HowItWorksPage from './pages/HowItWorksPage.vue'
import NotFoundPage from './pages/NotFoundPage.vue'

// The pages that measure, add or compare load when first opened, so the home page doesn't wait for them.
const AddMeasurePage = defineAsyncComponent(() => import('./pages/AddMeasurePage.vue'))
const ComparePage = defineAsyncComponent(() => import('./pages/ComparePage.vue'))
const HeadsetPage = defineAsyncComponent(() => import('./pages/HeadsetPage.vue'))
const MeasurePage = defineAsyncComponent(() => import('./pages/MeasurePage.vue'))

const route = useHashRoute(window)
const currentNavigation = computed(() => navigationPageOf(route.value))
const main = useTemplateRef<HTMLElement>('main')

const pages = {
  home: HomePage,
  measure: MeasurePage,
  compare: ComparePage,
  submit: AddMeasurePage,
  method: HowItWorksPage,
  headset: HeadsetPage,
  'not-found': NotFoundPage,
} as const
const page = computed(() => pages[route.value.page])
const pageProps = computed(() => {
  const current = route.value
  if (current.page === 'headset') return { headset: current.headset }
  if (current.page === 'compare') return { measure: current.measure, view: current.view }
  return current.page === 'method' ? { section: current.section } : {}
})

// A new page starts at its top, with focus on it, as after following a link to another page.
watch(route, async () => {
  window.scrollTo(0, 0)
  await nextTick()
  main.value?.focus({ preventScroll: true })
})
</script>

<template>
  <header class="site-header">
    <div class="bar">
      <a
        class="brand"
        :href="routeHref({ page: 'home' })"
      >FOV <span>Atlas</span></a>
      <nav aria-label="Main">
        <a
          v-for="entry in navigation"
          :key="entry.page"
          :href="routeHref(entry.route)"
          :class="{ current: entry.page === currentNavigation }"
          :aria-current="entry.page === currentNavigation ? 'page' : undefined"
        >{{ entry.label }}</a>
      </nav>
    </div>
  </header>
  <main
    ref="main"
    tabindex="-1"
  >
    <!-- Kept alive so a half-filled form, or a measure being finished, survives a look at another page. -->
    <KeepAlive :include="['AddMeasurePage', 'MeasurePage']">
      <component
        :is="page"
        v-bind="pageProps"
      />
    </KeepAlive>
  </main>
  <footer class="site-footer">
    <a :href="routeHref({ page: 'method', section: 'credits' })">Credits</a>
  </footer>
</template>

<style src="./styles.css"></style>
