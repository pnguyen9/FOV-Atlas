/** The published index (see `submissionStore.ts`), loaded when a page that lists measures opens. */

import { onMounted, ref, type Ref } from 'vue'
import { loadIndex, type Loaded } from '../lib/siteData.ts'
import type { DataIndex } from '../lib/submissionStore.ts'

/** Null while loading. */
export function useDataIndex(): Readonly<Ref<Loaded<DataIndex> | null>> {
  const index = ref<Loaded<DataIndex> | null>(null)
  onMounted(async () => {
    index.value = await loadIndex()
  })
  return index
}
