<script setup lang="ts">
/**
 * One headset model: its figures per tool (one tool at a time), the radar of everyone who matches
 * the filters next to measures ticked in the list, every published measure, the model's averaged
 * rendered field of view, and its catalog entry.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { formatCell, headlineColumnsFor, type CompareRow } from './compare/columns.ts'
import { compareState, seriesSlotCount, togglePick, type SeriesPick } from './compare/compareState.ts'
import CatalogInfo from './headset/CatalogInfo.vue'
import DirectionStats from './headset/DirectionStats.vue'
import RenderedAverageSection from './headset/RenderedAverageSection.vue'
import SubmissionList from './headset/SubmissionList.vue'
import { useDataIndex } from './dataIndex.ts'
import DataIndexState from '../components/DataIndexState.vue'
import FilterPanel from '../components/FilterPanel.vue'
import RadarOptions from '../components/radar/RadarOptions.vue'
import RadarPanel from '../components/radar/RadarPanel.vue'
import { aggregateSeries, keptSeries, measureSeries, statisticWords, type RadarSeries } from '../components/radar/radarSeries.ts'
import SegmentedControl from '../components/SegmentedControl.vue'
import { combineCells, figuresOfCombined, submissionMatches } from '../lib/fovStats.ts'
import { catalogHeadset } from '../lib/headsets.ts'
import { routeHref } from '../lib/hashRoute.ts'
import type { RenderedAverage } from '../lib/renderedAverage.ts'
import { loadAggregate, loadedValue, loadPage, loadRenderedAverage, type Loaded } from '../lib/siteData.ts'
import { showsRenderedAverage, toolNameOf, tools, type Tool } from '../lib/submission.ts'
import { headsetsOf, listedEntriesOf, type Aggregate, type ListedEntry } from '../lib/submissionStore.ts'

const props = defineProps<{ readonly headset: string }>()

/** "Everyone" takes the first colour; ticked measures take the next ones. */
const firstMeasureSlot = 2

const catalog = computed(() => catalogHeadset(props.headset))

const index = useDataIndex()

const availableTools = computed(() => {
  const dataIndex = loadedValue(index.value)
  return dataIndex === null ? [] : tools.filter((tool) => headsetsOf(dataIndex, tool).has(props.headset))
})
const chosenTool = ref<Tool | null>(null)
const tool = computed<Tool | null>(() => {
  const available = availableTools.value
  if (chosenTool.value !== null && available.includes(chosenTool.value)) return chosenTool.value
  if (compareState.tool !== null && available.includes(compareState.tool)) return compareState.tool
  return available[0] ?? null
})
const toolOptions = computed(() => availableTools.value.map((available) => ({ value: available, label: toolNameOf(available) })))

/** Shown for the tools that show it, and while the model has no measure at all. */
const showsAverage = computed(() => tool.value === null || showsRenderedAverage(tool.value))

/** Null while loading or when the model has none; the section tells which. */
const average = shallowRef<Loaded<RenderedAverage | null> | null>(null)

watch(
  [index, () => props.headset, showsAverage],
  async ([loadedIndex, headset, shown]) => {
    average.value = null
    const dataIndex = loadedValue(loadedIndex)
    if (dataIndex === null || !shown) return
    const loaded = await loadRenderedAverage(dataIndex, headset)
    if (headset === props.headset && showsAverage.value) average.value = loaded
  },
  { immediate: true },
)
const modelAverage = computed(() => loadedValue(average.value))

const aggregate = shallowRef<Loaded<Aggregate> | null>(null)
const entries = shallowRef<ListedEntry[]>([])
/** The next older page to load, or -1 once every page is loaded. */
const nextPage = ref(-1)
const pageFailed = ref(false)
const loadingPage = ref(false)
const picks = ref<SeriesPick[]>([])
/** Ignores answers to requests made for another headset or tool. */
let generation = 0

async function loadOlder(): Promise<void> {
  const currentTool = tool.value
  if (currentTool === null || nextPage.value < 0) return
  const started = generation
  loadingPage.value = true
  const loaded = await loadPage(currentTool, props.headset, nextPage.value)
  if (started !== generation) return
  loadingPage.value = false
  if (!loaded.ok) {
    pageFailed.value = true
    return
  }
  pageFailed.value = false
  entries.value = [...entries.value, ...listedEntriesOf(loaded.value)].sort((first, second) => second.issue - first.issue)
  nextPage.value -= 1
}

watch(
  [tool, () => props.headset],
  async ([currentTool, headset]) => {
    generation += 1
    const started = generation
    aggregate.value = null
    entries.value = []
    picks.value = []
    pageFailed.value = false
    loadingPage.value = false
    nextPage.value = -1
    const dataIndex = loadedValue(index.value)
    if (currentTool === null || dataIndex === null) return
    const summary = headsetsOf(dataIndex, currentTool).get(headset)
    nextPage.value = (summary?.pages ?? 0) - 1
    const [loadedAggregate] = await Promise.all([loadAggregate(currentTool, headset), loadOlder()])
    if (started === generation) aggregate.value = loadedAggregate
  },
  { immediate: true },
)

const combined = computed(() => {
  const loaded = loadedValue(aggregate.value)
  return loaded === null ? null : combineCells(loaded, compareState.filters)
})
const figures = computed(() => (combined.value === null ? null : figuresOfCombined(combined.value)))
const totalCount = computed(() => loadedValue(aggregate.value)?.count ?? 0)

const filterCounts = computed(() =>
  tool.value === null || combined.value === null
    ? null
    : { matching: combined.value.count, total: totalCount.value, toolName: toolNameOf(tool.value) },
)

const shownEntries = computed(() => entries.value.filter(({ entry }) => submissionMatches(entry.submission, compareState.filters)))
const slots = computed(() => new Map(picks.value.map((pick) => [Number(pick.key), pick.slot])))
const full = computed(() => picks.value.length > seriesSlotCount - firstMeasureSlot)

function togglePicked(issue: number): void {
  picks.value = togglePick(picks.value, String(issue), firstMeasureSlot)
}

// A ticked measure the filters hide has no row left to untick it, so it leaves the radar too.
watch(shownEntries, (shown) => {
  const shownKeys = new Set(shown.map(({ issue }) => String(issue)))
  if (picks.value.some((pick) => !shownKeys.has(pick.key))) picks.value = picks.value.filter((pick) => shownKeys.has(pick.key))
})

const radarSeries = computed<RadarSeries[]>(() => {
  const { statistic } = compareState.radar
  const currentTool = tool.value
  if (currentTool === null) return []
  const series: RadarSeries[] = [
    aggregateSeries({
      key: 'everyone',
      name: 'Everyone',
      colour: 1,
      combined: combined.value,
      statistic,
      seeText: `the ${statisticWords(statistic, currentTool)} of everyone who matches the filters`,
      tool: currentTool,
      average: average.value,
    }),
  ]
  for (const pick of picks.value) {
    const listed = entries.value.find(({ issue }) => String(issue) === pick.key)
    if (listed === undefined) continue
    const { submission, author } = listed.entry
    series.push(
      measureSeries({
        key: pick.key,
        label: `${author} · issue #${pick.key}`,
        name: `${author} #${pick.key}`,
        colour: pick.slot,
        seeText: `the measure ${author} sent in issue #${pick.key}`,
        submission,
      }),
    )
  }
  const kept = compareState.kept
  if (kept !== null && compareState.keptOnRadar && kept.tool === tool.value && kept.headset === props.headset) {
    series.push(keptSeries(kept))
  }
  return series
})

const headlines = computed(() => {
  if (tool.value === null || figures.value === null) return []
  const row: CompareRow = {
    key: props.headset,
    headset: props.headset,
    name: '',
    figures: figures.value,
    total: totalCount.value,
    averaged: modelAverage.value,
  }
  return headlineColumnsFor(tool.value).map((column) => ({ id: column.id, label: column.label, title: column.title, value: formatCell(column, row) }))
})

</script>

<template>
  <div>
    <p>
      <a :href="routeHref({ page: 'compare', view: 'table', measure: null })">← Compare</a>
    </p>
    <h1>{{ catalog?.name ?? 'Unknown headset' }}</h1>
    <p v-if="catalog === undefined">
      No headset in the list has this address.
    </p>
    <template v-else>
      <DataIndexState :index="index" />
      <p
        v-if="index?.ok === true && tool === null"
        class="note"
      >
        No measures of this headset are published yet. <a :href="routeHref({ page: 'submit' })">Add the first one</a>.
      </p>
      <template v-else-if="tool !== null">
        <div class="control-group">
          <div class="field-label">
            Measuring tool
          </div>
          <SegmentedControl
            :model-value="tool"
            label="Measuring tool"
            :options="toolOptions"
            @update:model-value="(picked) => (chosenTool = picked)"
          />
        </div>
        <p
          v-if="aggregate === null"
          class="muted"
        >
          Loading the {{ toolNameOf(tool) }} measures…
        </p>
        <p
          v-else-if="!aggregate.ok"
          class="problem"
        >
          The {{ toolNameOf(tool) }} figures couldn't be loaded. Try again in a moment.
        </p>
        <div
          v-if="figures !== null"
          class="kpis"
        >
          <div
            v-for="headline in headlines"
            :key="headline.id"
            class="kpi"
            :title="headline.title"
          >
            <div class="kpi-value">
              {{ headline.value }}
            </div>
            <div class="kpi-label">
              {{ headline.label }}
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-value">
              {{ figures.count }}<span class="small muted"> / {{ totalCount }}</span>
            </div>
            <div class="kpi-label">
              Measures (filtered / all)
            </div>
          </div>
        </div>
        <div
          v-if="aggregate !== null"
          class="side-layout"
        >
          <div>
            <section
              class="card"
              aria-label="Radar options"
            >
              <RadarOptions :tool="tool" />
            </section>
            <FilterPanel :counts="filterCounts" />
          </div>
          <div>
            <RadarPanel
              :series="radarSeries"
              :tool="tool"
              empty-text="Nothing to draw: no measure matches the filters."
            />
            <section aria-labelledby="figures-heading">
              <h2 id="figures-heading">
                {{ toolNameOf(tool) }} figures
              </h2>
              <DirectionStats
                v-if="combined !== null && combined.count > 0"
                :stats="combined.stats"
              />
              <p
                v-else-if="combined !== null"
                class="muted"
              >
                No measure matches the filters.
              </p>
            </section>
          </div>
        </div>
        <section
          v-if="aggregate !== null"
          aria-labelledby="submissions-heading"
        >
          <h2 id="submissions-heading">
            Individual measures
          </h2>
          <p class="small muted">
            Tick measures to put them on the radar above, next to everyone's. The name links to the GitHub issue the measure
            was sent in.
          </p>
          <SubmissionList
            v-if="shownEntries.length > 0"
            :tool="tool"
            :entries="shownEntries"
            :slots="slots"
            :full="full"
            @toggle="togglePicked"
          />
          <p
            v-else-if="!loadingPage && !pageFailed"
            class="muted"
          >
            No loaded measure matches the filters.
          </p>
          <p
            v-if="pageFailed"
            class="problem"
          >
            Some measures couldn't be loaded.
          </p>
          <button
            v-if="nextPage >= 0"
            type="button"
            class="button ghost load-older"
            :disabled="loadingPage"
            @click="loadOlder"
          >
            {{ pageFailed ? 'Try again' : 'Show older measures' }}
          </button>
        </section>
      </template>
      <RenderedAverageSection
        v-if="index?.ok === true && showsAverage"
        :average="average"
      />
      <CatalogInfo :headset="catalog" />
    </template>
  </div>
</template>

<style scoped>
.load-older {
  margin-top: 12px;
}
section + section {
  margin-top: 8px;
}
.side-layout + section {
  margin-top: 24px;
}
</style>
