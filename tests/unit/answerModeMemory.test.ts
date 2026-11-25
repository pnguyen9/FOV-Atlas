// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerModeKey, browserStorage, rememberAnswerMode, rememberedAnswerMode } from '../../src/lib/answerModeMemory'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const refusing = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('answer mode memory', () => {
  it('remembers the mode chosen in this browser', () => {
    const storage = browserStorage()
    expect(rememberedAnswerMode(storage)).toBe('head')
    rememberAnswerMode(storage, 'keyboard')
    expect(window.localStorage.getItem(answerModeKey)).toBe('keyboard')
    expect(rememberedAnswerMode(storage)).toBe('keyboard')
  })

  it('starts with the head when the stored value is no mode', () => {
    window.localStorage.setItem(answerModeKey, 'telepathy')
    expect(rememberedAnswerMode(browserStorage())).toBe('head')
  })

  it('works without storage, or with storage that refuses', () => {
    expect(rememberedAnswerMode(null)).toBe('head')
    expect(() => {
      rememberAnswerMode(null, 'controller')
    }).not.toThrow()
    expect(rememberedAnswerMode(refusing)).toBe('head')
    expect(() => {
      rememberAnswerMode(refusing, 'controller')
    }).not.toThrow()
  })

  it('finds no storage when the browser refuses access to it', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(browserStorage()).toBeNull()
  })
})
