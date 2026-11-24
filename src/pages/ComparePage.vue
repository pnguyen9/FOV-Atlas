<script setup lang="ts">
/**
 * Compare: one measuring tool at a time, then the headsets measured with it, as a table or on a
 * radar. The figures come from each headset's aggregate, filtered by the soft filters; a kept
 * measure can be set beside them when it is of the same tool.
 */
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { columnsFor, type CompareRow } from './compare/columns.ts'
import CompareTable from './compare/CompareTable.vue'
import { compareState, seriesSlotCount, slotOf, togglePick, withPick } from './compare/compareState.ts'
import KeptMeasureCard from './compare/KeptMeasureCard.vue'
import FilterPanel from '../components/FilterPanel.vue'
import { headsetName } from '../components/measureLabels.ts'
import RadarOptions from '../components/radar/RadarOptions.vue'
import RadarPanel from '../components/radar/RadarPanel.vue'
import { aggregateSeries, keptSeries, type RadarSeries } from '../components/radar/radarSeries.ts'
import SegmentedControl from '../components/SegmentedControl.vue'
import { combineCells, figuresOfCombined, figuresOfMeasure, type Combined } from '../lib/fovStats.ts'
import { routeHref, type CompareView } from '../lib/hashRoute.ts'
import { headsetsOf, loadAggregate, loadIndex, type Loaded } from '../lib/siteData.ts'
import { toolNameOf, tools, type Tool } from '../lib/submission.ts'
import type { Aggregate, DataIndex } from '../lib/submissionStore.ts'

const props = withDefaults(defineProps<{ readonly measure?: string | null; readonly view?: CompareView }>(), {
  measure: null,
  view: 'table',
})

const index = ref<Loaded<DataIndex> | null>(null)
onMounted(async () => {
  index.value = await loadIndex()
})

const toolOptions = tools.map((tool) => ({ value: tool, label: toolNameOf(tool) }))
const viewOptions = [
  { value: 'table', label: 'Table' },
  { value: 'radar', label: 'Radar' },
] as const

/** The view lives in the address, so a reload or a shared link opens the same one. */
function showView(view: CompareView): void {
  window.location.hash = routeHref({ page: 'compare', view, measure: null })
}

const publishedAnything = computed(
  () => index.value?.ok === true && Object.values(index.value.value.headsets).some((byHeadset) => Object.keys(byHeadset).length > 0),
)

/** The tool whose aggregates are loaded, which lags the chosen tool while they load. */
const loadedTool = ref<Tool | null>(null)
const aggregates = shallowRef(new Map<string, Loaded<Aggregate>>())

async function loadTool(tool: Tool, dataIndex: DataIndex): Promise<void> {
  const headsets = [...headsetsOf(dataIndex, tool).keys()]
  const loaded = await Promise.all(headsets.map(async (headset) => [headset, await loadAggregate(tool, headset)] as const))
  if (compareState.tool !== tool) return
  aggregates.value = new Map(loaded)
  loadedTool.value = tool
  compareState.picks = compareState.picks.filter((pick) => headsets.includes(pick.key))
  pickWidestWhenEmpty()
}

watch(
  [() => compareState.tool, index],
  async ([tool, loadedIndex]) => {
    if (tool !== null && loadedIndex?.ok === true && tool !== loadedTool.value) await loadTool(tool, loadedIndex.value)
  },
  { immediate: true },
)

const ready = computed(() => compareState.tool !== null && loadedTool.value === compareState.tool)

const combined = computed(() => {
  const byHeadset = new Map<string, Combined | null>()
  for (const [headset, loaded] of aggregates.value) {
    byHeadset.set(headset, loaded.ok ? combineCells(loaded.value, compareState.filters) : null)
  }
  return byHeadset
})

const rows = computed<CompareRow[]>(() =>
  [...combined.value].map(([headset, headsetCombined]) => {
    const loaded = aggregates.value.get(headset)
    return {
      key: headset,
      headset,
      name: headsetName({ headset }),
      figures: headsetCombined === null ? null : figuresOfCombined(headsetCombined),
      total: loaded?.ok === true ? loaded.value.count : 0,
    }
  }),
)

const keptSameTool = computed(() =>
  compareState.kept !== null && compareState.kept.tool === compareState.tool ? compareState.kept : null,
)

const keptRow = computed<CompareRow | null>(() => {
  const kept = keptSameTool.value
  if (kept === null) return null
  return {
    key: 'kept',
    headset: kept.headset,
    name: headsetName(kept),
    figures: figuresOfMeasure(kept),
    total: 1,
  }
})

const filterCounts = computed(() => {
  const tool = compareState.tool
  if (tool === null || !ready.value) return null
  return {
    matching: rows.value.reduce((total, row) => total + (row.figures?.count ?? 0), 0),
    total: rows.value.reduce((total, row) => total + row.total, 0),
    toolName: toolNameOf(tool),
  }
})

/**
 * Opening the radar with nothing ticked shows the two widest headsets, by the tool's first
 * column, so it never starts blank. While another tool's figures load, the rows still belong to
 * the previous tool, so it waits.
 */
function pickWidestWhenEmpty(): void {
  const tool = compareState.tool
  const widestColumn = tool === null ? undefined : columnsFor(tool)[0]
  if (props.view !== 'radar' || !ready.value || compareState.picks.length > 0 || widestColumn === undefined) return
  const widest = rows.value
    .flatMap((row) => {
      const value = widestColumn.value(row)
      return value === undefined || row.figures?.count === 0 ? [] : [{ headset: row.headset, value }]
    })
    .sort((first, second) => second.value - first.value)
    .slice(0, 2)
  compareState.picks = widest.reduce((picks, { headset }) => withPick(picks, headset), compareState.picks)
}

watch(() => props.view, pickWidestWhenEmpty)

const radarSeries = computed<RadarSeries[]>(() => {
  const { statistic } = compareState.radar
  const series = compareState.picks.map((pick) => {
    const name = headsetName({ headset: pick.key })
    return aggregateSeries({
      key: pick.key,
      name,
      colour: pick.slot,
      combined: combined.value.get(pick.key) ?? null,
      statistic,
      seeText: `the ${statistic} shape measured on the ${name}`,
    })
  })
  const kept = keptSameTool.value
  return kept !== null && compareState.keptOnRadar ? [...series, keptSeries(kept)] : series
})

const headsetChoices = computed(() =>
  rows.value
    .map((row) => ({ headset: row.headset, name: row.name, slot: slotOf(compareState.picks, row.headset) }))
    .sort((first, second) => first.name.localeCompare(second.name)),
)
const pickedNames = computed(() => compareState.picks.map((pick) => headsetName({ headset: pick.key })).join(', '))
const full = computed(() => compareState.picks.length >= seriesSlotCount)

/** With nothing published, the only thing to show is a kept measure. */
const showsResults = computed(() => publishedAnything.value || compareState.kept !== null)

function togglePicked(headset: string): void {
  compareState.picks = togglePick(compareState.picks, headset)
}
</script>

<template>
  <div>
    <h1>Compare headsets</h1>
    <p class="muted">
      {{
        view === 'radar'
          ? 'Several headsets on one radar. The further from the centre, the more you see in that direction.'
          : 'One row per headset model. Tick headsets to show them on the radar; click a row for everything measured on it.'
      }}
    </p>
    <div class="toolbar">
      <div class="control-group">
        <div class="field-label">
          Measuring tool
        </div>
        <SegmentedControl
          :model-value="compareState.tool ?? ''"
          label="Measuring tool"
          :options="toolOptions"
          @update:model-value="(tool) => (compareState.tool = tool as Tool)"
        />
      </div>
      <div class="control-group">
        <div class="field-label">
          Show as
        </div>
        <SegmentedControl
          :model-value="view"
          label="Show as"
          :options="viewOptions"
          @update:model-value="showView"
        />
      </div>
    </div>
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
    <p
      v-else-if="!publishedAnything"
      class="note"
    >
      No measures are published yet. <a href="#submit">Add the first one</a>.
    </p>
    <div
      v-if="index?.ok === true"
      class="side-layout"
    >
      <div>
        <section
          v-if="view === 'radar' && compareState.tool !== null && showsResults"
          class="card"
          aria-label="Radar options"
        >
          <div class="control-group">
            <div class="field-label">
              Headsets
            </div>
            <div
              v-if="headsetChoices.length > 0"
              class="chips"
              role="group"
              aria-label="Headsets on the radar"
            >
              <button
                v-for="choice in headsetChoices"
                :key="choice.headset"
                type="button"
                class="chip"
                :class="{ on: choice.slot !== undefined }"
                :aria-pressed="choice.slot !== undefined"
                :disabled="full && choice.slot === undefined"
                @click="togglePicked(choice.headset)"
              >
                <span
                  class="swatch"
                  :class="choice.slot === undefined ? undefined : `series-${choice.slot}`"
                />{{ choice.name }}
              </button>
            </div>
            <p
              v-else
              class="small muted"
            >
              No headset has {{ toolNameOf(compareState.tool) }} measures yet.
            </p>
          </div>
          <RadarOptions :tool="compareState.tool" />
        </section>
        <FilterPanel
          v-if="publishedAnything"
          :counts="filterCounts"
        />
        <KeptMeasureCard :from-link="props.measure" />
      </div>
      <div v-if="showsResults">
        <div
          v-if="compareState.tool === null"
          class="card empty"
        >
          <strong>Pick a measuring tool first</strong>
          Each tool is its own standard, so this page only ever shows one at a time.
          <div class="tool-buttons">
            <button
              v-for="option in toolOptions"
              :key="option.value"
              type="button"
              class="button"
              @click="compareState.tool = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <a href="#method">Why can't I see them together?</a>
        </div>
        <p
          v-else-if="!ready"
          class="muted"
        >
          Loading the {{ toolNameOf(compareState.tool) }} measures…
        </p>
        <template v-else-if="view === 'table'">
          <CompareTable
            :tool="compareState.tool"
            :rows="rows"
            :kept-row="keptRow"
          />
          <p
            v-if="rows.length === 0 && publishedAnything"
            class="small muted"
          >
            No {{ toolNameOf(compareState.tool) }} measures are published yet.
          </p>
          <div
            v-if="compareState.picks.length > 0"
            class="pick-bar"
          >
            <span class="names"><strong>{{ compareState.picks.length }}</strong> selected: {{ pickedNames }}</span>
            <button
              type="button"
              class="button"
              @click="showView('radar')"
            >
              Show on radar
            </button>
            <button
              type="button"
              class="button ghost"
              @click="compareState.picks = []"
            >
              Clear
            </button>
          </div>
        </template>
        <RadarPanel
          v-else
          :series="radarSeries"
          :tool="compareState.tool"
          empty-text="Nothing to draw: pick headsets on the left, or tick them in the table."
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 18px 0;
}
</style>
