/**
 * The answer mode last chosen in this browser, so a returning wearer finds it picked. Storage can
 * be missing or refuse access (private windows, blocked site data); the measure then simply
 * starts with head pointing and remembers nothing.
 */

import { answerModes, type AnswerMode } from './answerTargets.ts'

export const answerModeKey = 'fov-atlas.answer-mode'
const defaultAnswerMode: AnswerMode = 'head'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** The storage of this browser, or null when even asking for it is refused. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function rememberedAnswerMode(storage: Storage | null): AnswerMode {
  try {
    const stored = storage?.getItem(answerModeKey)
    return answerModes.find((mode) => mode === stored) ?? defaultAnswerMode
  } catch {
    return defaultAnswerMode
  }
}

export function rememberAnswerMode(storage: Storage | null, mode: AnswerMode): void {
  try {
    storage?.setItem(answerModeKey, mode)
  } catch {
    // Nothing remembered: the next visit starts with the default again.
  }
}
