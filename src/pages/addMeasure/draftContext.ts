/** The form's draft, shared by the "Add a measure" page with each of its steps. */

import { inject, type InjectionKey } from 'vue'
import type { MeasureDraft } from '../../lib/measureDraft.ts'

export const draftKey: InjectionKey<MeasureDraft> = Symbol('measure draft')

export function useDraft(): MeasureDraft {
  const draft = inject(draftKey)
  if (draft === undefined) throw new Error('A form step needs the draft of the "Add a measure" page')
  return draft
}
