import type { StoredEntry } from '../../lib/submissionStore.ts'

/** A published measure and the issue it was sent in. */
export interface ListedEntry {
  readonly issue: number
  readonly entry: StoredEntry
}
