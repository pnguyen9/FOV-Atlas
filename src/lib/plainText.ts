/**
 * Free text from visitors (notes, cushion names, a tool's own headset label) is shown on the site
 * and in GitHub comments, so it has to stay plain: no control characters, no characters that flip
 * the reading direction, no HTML angle brackets, and, when several lines are allowed, no line that
 * Markdown would turn into a heading (the issue body parser splits sections on headings).
 */

export interface PlainTextRules {
  readonly maximumLength: number
  readonly multiline: boolean
}

export type PlainTextProblem = 'too-long' | 'control-character' | 'markup' | 'heading-line'

// \p{Cc} covers tab, line feed and carriage return; line feeds are allowed in multi-line fields.
// The other ranges are the line separators and the bidirectional overrides and isolates.
const controlCharacters = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]/u
const markupCharacters = /[<>]/
const headingLine = /^[ \t]*#/m

export function plainTextProblem(text: string, rules: PlainTextRules): PlainTextProblem | null {
  if (text.length > rules.maximumLength) return 'too-long'
  const checked = rules.multiline ? text.replaceAll('\n', '') : text
  if (controlCharacters.test(checked)) return 'control-character'
  if (markupCharacters.test(text)) return 'markup'
  if (rules.multiline && headingLine.test(text)) return 'heading-line'
  return null
}
