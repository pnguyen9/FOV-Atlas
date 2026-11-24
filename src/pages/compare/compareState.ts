/**
 * What the visitor chose on Compare and on the headset pages: the tool, the filters, the
 * headsets ticked, the radar settings and a kept measure. It lives for the visit, so going to a
 * headset page and back finds everything as it was left. Pages read it through `compareState`
 * each time, since a reset replaces its nested objects.
 */

import { reactive } from 'vue'
import type { EyeMode, FilterChoices, Statistic } from '../../lib/fovStats.ts'
import type { SceneName } from '../../lib/scene.ts'
import { tools, type Submission, type Tool } from '../../lib/submission.ts'
import { defaultColumnsFor, type CompareColumnId } from './columns.ts'

/** Colours a chart can tell apart; a further series would have to repeat one. */
export const seriesSlotCount = 8

/** A ticked series and the colour slot it keeps until unticked, whatever else is ticked. */
export interface SeriesPick {
  readonly key: string
  readonly slot: number
}

/** Ticks `key` into the lowest free slot from `firstSlot`; unchanged when every slot is taken. */
export function withPick(picks: readonly SeriesPick[], key: string, firstSlot = 1): SeriesPick[] {
  const taken = new Set(picks.map((pick) => pick.slot))
  const slot = Array.from({ length: seriesSlotCount - firstSlot + 1 }, (_, offset) => firstSlot + offset).find(
    (candidate) => !taken.has(candidate),
  )
  return slot === undefined ? [...picks] : [...picks, { key, slot }]
}

export function togglePick(picks: readonly SeriesPick[], key: string, firstSlot = 1): SeriesPick[] {
  return picks.some((pick) => pick.key === key) ? picks.filter((pick) => pick.key !== key) : withPick(picks, key, firstSlot)
}

export const slotOf = (picks: readonly SeriesPick[], key: string): number | undefined => picks.find((pick) => pick.key === key)?.slot

interface CompareState {
  tool: Tool | null
  /** Headsets ticked on Compare. */
  picks: SeriesPick[]
  filters: FilterChoices
  /** Each tool has its own columns. */
  columns: Record<Tool, CompareColumnId[]>
  /** Falls back to the first shown column when the tool lacks this one. */
  sort: { column: CompareColumnId; descending: boolean }
  radar: {
    eye: EyeMode
    statistic: Statistic
    showRendered: boolean
    view: 'shape' | 'see'
    scene: SceneName
    /** The series whose shape is the window in "what you see". */
    through: string | null
    enlarged: boolean
  }
  /** A measure opened to compare with; it stays in this browser and in no figure. */
  kept: Submission | null
  keptOnRadar: boolean
  /** The address's `measure` value the kept measure was opened from, so a return to the page doesn't open it again. */
  keptFromLink: string | null
}

function initialState(): CompareState {
  return {
    tool: null,
    picks: [],
    filters: { eyeDepth: [], noseBridge: [], tuning: [], gaze: [] },
    columns: Object.fromEntries(tools.map((tool) => [tool, defaultColumnsFor(tool)])) as Record<Tool, CompareColumnId[]>,
    sort: { column: 'highestHorizontal', descending: true },
    radar: { eye: 'union', statistic: 'highest', showRendered: true, view: 'shape', scene: 'room', through: null, enlarged: false },
    kept: null,
    keptOnRadar: true,
    keptFromLink: null,
  }
}

export const compareState = reactive<CompareState>(initialState())

export function resetCompareState(): void {
  Object.assign(compareState, initialState())
}

/** Opens a kept measure; with no tool picked yet, its tool is picked so it shows at once. */
export function keepMeasure(submission: Submission): void {
  compareState.kept = submission
  compareState.keptOnRadar = true
  compareState.tool ??= submission.tool
}
