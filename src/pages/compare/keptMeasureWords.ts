/** Why a kept measure couldn't be opened, in words. */

import type { MeasureFileError } from '../../lib/measureFile.ts'

export type KeptMeasureError = MeasureFileError | 'file-too-large' | 'file-unreadable'

const reasons: ReadonlyMap<KeptMeasureError, string> = new Map(Object.entries({
  'too-long': 'It is far longer than any measure.',
  'not-json': 'The text is not a complete measure: part of it may be missing.',
  'not-a-measure': 'This is not a measure saved from FOV Atlas.',
  'unsupported-version': 'It was saved in a format this site doesn’t read.',
  'shape-invalid': 'Its contents don’t have the shape of a measure.',
  'not-base64url': 'The link is damaged: part of it may be missing.',
  'no-measure-in-link': 'Paste a FOV Atlas link with a measure in it, or the text of a saved measure.',
  'file-too-large': 'The file is far larger than any measure.',
  'file-unreadable': 'The file couldn’t be read.',
}) as [KeptMeasureError, string][])

export function keptMeasureProblem(error: KeptMeasureError): string {
  return `${reasons.get(error) ?? 'Its values break the rules of a measure.'} (${error})`
}
