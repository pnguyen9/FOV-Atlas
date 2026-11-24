import { describe, expect, it } from 'vitest'
import { plainTextProblem } from '../../src/lib/plainText'

const singleLine = { maximumLength: 20, multiline: false }
const multiline = { maximumLength: 40, multiline: true }

describe('plainTextProblem', () => {
  it.each([
    ['plain text', 'Studioform 3 mm', singleLine],
    ['an empty string', '', singleLine],
    ['line breaks in a multi-line field', 'first line\nsecond # line', multiline],
    ['Markdown that is not a heading', '*soft* strap, 2 × 3', singleLine],
  ])('accepts %s', (_description, text, rules) => {
    expect(plainTextProblem(text, rules)).toBeNull()
  })

  it.each([
    ['too-long', 'x'.repeat(21), singleLine],
    ['control-character', 'first\nsecond', singleLine],
    ['control-character', 'tab\there', multiline],
    ['control-character', 'carriage\r\nreturn', multiline],
    ['control-character', 'right\u202Eto-left', singleLine],
    ['control-character', 'isolate\u2066text', singleLine],
    ['control-character', 'line\u2028separator', singleLine],
    ['markup', '<b>bold</b>', singleLine],
    ['heading-line', 'text\n## heading', multiline],
    ['heading-line', '  # heading', multiline],
  ])('reports %s', (problem, text, rules) => {
    expect(plainTextProblem(text, rules)).toBe(problem)
  })
})
