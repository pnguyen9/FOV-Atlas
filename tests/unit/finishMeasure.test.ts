import { describe, expect, it } from 'vitest'
import { renderIssueBody } from '../../src/lib/issueForm'
import { emptyDraft, finishDraft, furthestStep, issueOf, keptFinishedMeasure, keptMeasureOf, valuesOf, type MeasureDraft } from '../../src/lib/measureDraft'
import { measureLink, parseMeasureInput, parseMeasureText, encodeMeasureText } from '../../src/lib/measureFile'
import {
  answerProbe,
  currentProbe,
  isFinished,
  measureSteps,
  measuresOf,
  startMeasure,
  type AtlasMeasure,
  type DirectionChoice,
} from '../../src/lib/measureSession'
import { readRenderedViews } from '../../src/lib/renderedViews'
import { runAction, type DataFiles } from '../../src/lib/submissionAction'
import { pagePath, parsePage } from '../../src/lib/submissionStore'
import { readingsOf, straightHeadset, turnedHeadset, type HeadsetShape } from './xrFixtures'

/** A measure taken by a wearer who sees 90 % of what each direction draws. */
function measured(shape: HeadsetShape, choice: DirectionChoice): AtlasMeasure {
  const read = readRenderedViews(readingsOf(shape))
  if (!read.ok) throw new Error(read.error)
  let progress = startMeasure(measureSteps(choice, read))
  while (!isFinished(progress)) {
    const probe = currentProbe(progress)
    const step = progress.steps[progress.stepIndex]
    if (probe === null || step === undefined) break
    progress = answerProbe(progress, probe.angle <= step.maximum * 0.9)
  }
  const results = measuresOf(progress)
  if (results === null) throw new Error('unfinished')
  return { ...results, ceiling: read.ceiling, cornerMask: 'on' }
}

function answered(measure: AtlasMeasure): MeasureDraft {
  return {
    ...finishDraft(measure),
    brand: 'Bigscreen',
    headset: 'bigscreen-beyond-2',
    eyeDepth: 'almost-flush',
    noseBridge: 'low',
    gaze: 'fixed',
    ipd: '65',
    note: 'Measured in the headset',
  }
}

function memoryFiles(): DataFiles & { contents: Map<string, string> } {
  const contents = new Map<string, string>()
  return {
    contents,
    read: (path) => contents.get(path) ?? null,
    write: (path, content) => {
      contents.set(path, content)
    },
    remove: (path) => {
      contents.delete(path)
    },
  }
}

describe('Finish your measure', () => {
  it('starts with the tool and values known, at the headset step', () => {
    const draft = finishDraft(measured(straightHeadset, 'principal'))
    expect(draft.tool).toBe('atlas')
    expect(valuesOf(draft).ok).toBe(true)
    expect(furthestStep(draft)).toBe(2)
  })

  it('has no values without a measure', () => {
    expect(valuesOf({ ...emptyDraft(), tool: 'atlas' })).toEqual({ ok: false, problem: 'empty' })
  })

  it.each([
    ['eight directions on a headset that does not turn its pictures', straightHeadset, 'principal'],
    ['sixteen directions on a headset that turns its pictures', turnedHeadset, 'all'],
  ] as const)('publishes %s through an issue the Action accepts as it was measured', (_, shape, choice) => {
    const measure = measured(shape, choice)
    const draft = answered(measure)
    const issue = issueOf(draft)
    if (!issue.ok) throw new Error(issue.error)
    expect(issue.url).toContain('tool=atlas')
    expect(issue.fields['wimfov-link']).toBe('')

    const files = memoryFiles()
    const result = runAction({ kind: 'submission', issue: 7, author: 'someone', body: renderIssueBody(issue.fields) }, files)
    expect(result.outcome).toBe('accepted')
    const page = parsePage(files.contents.get(pagePath('atlas', 'bigscreen-beyond-2', 0)) ?? '', 'atlas', 'bigscreen-beyond-2', 0)
    const stored = page?.entries['7']?.submission
    expect(stored?.measures).toEqual(measure.measures)
    expect(stored?.ceiling).toEqual(measure.ceiling)
    expect(stored?.cornerMask).toBe('on')
    expect(stored?.provenance).toEqual({ input: 'measured', linkData: null })
  })

  it('keeps the measure without publishing, as a link, text or file', () => {
    const kept = keptMeasureOf(answered(measured(turnedHeadset, 'principal')))
    if (!kept.ok) throw new Error(kept.error)
    expect(parseMeasureText(encodeMeasureText(kept.submission))).toEqual({ ok: true, submission: kept.submission })
    const link = measureLink(kept.submission, 'https://pnguyen9.github.io/FOV-Atlas/#measure')
    expect(link.startsWith('https://pnguyen9.github.io/FOV-Atlas/#compare?measure=')).toBe(true)
    expect(parseMeasureInput(link)).toEqual({ ok: true, submission: kept.submission })
  })

  it('keeps the measure right after measuring, its headset and face fit left out until given', () => {
    const measure = measured(straightHeadset, 'principal')
    const kept = keptFinishedMeasure(finishDraft(measure))
    if (kept === null) throw new Error('not kept')
    expect(kept).toMatchObject({ tool: 'atlas', headset: '', otherHeadsetName: '', face: null, gaze: null, tuning: null, ipd: null, note: '' })
    expect(kept.measures).toEqual(measure.measures)
    expect(parseMeasureInput(measureLink(kept, 'https://example.org/'))).toEqual({ ok: true, submission: kept })
    // Publishing still needs both.
    expect(issueOf(finishDraft(measure)).ok).toBe(false)

    const given = keptFinishedMeasure({ ...finishDraft(measure), brand: 'Bigscreen', headset: 'bigscreen-beyond-2', eyeDepth: 'deep-set', noseBridge: 'high' })
    expect(given).toMatchObject({ headset: 'bigscreen-beyond-2', face: { eyeDepth: 'deep-set', noseBridge: 'high' } })
    // Setup answers go in only once the whole Setup step is answered: the file then holds the measure as published.
    const answeredDraft = answered(measure)
    const complete = keptMeasureOf(answeredDraft)
    if (!complete.ok) throw new Error(complete.error)
    expect(keptFinishedMeasure(answeredDraft)).toEqual(complete.submission)
    expect(keptFinishedMeasure({ ...answeredDraft, gaze: null })).toMatchObject({ headset: 'bigscreen-beyond-2', gaze: null, tuning: null, ipd: null, note: '' })
    // Half a face fit is no face fit.
    expect(keptFinishedMeasure({ ...finishDraft(measure), eyeDepth: 'deep-set' })?.face).toBeNull()
  })

  it('keeps nothing right after measuring without a FOV Atlas measure, or with an invalid headset name', () => {
    expect(keptFinishedMeasure(emptyDraft())).toBeNull()
    const measure = measured(straightHeadset, 'principal')
    expect(keptFinishedMeasure({ ...finishDraft(measure), headset: 'other', otherHeadsetName: '<b>' })?.headset).toBe('')
    expect(keptFinishedMeasure(finishDraft({ ...measure, measures: { left: {}, right: {} } }))).toBeNull()
  })

  it('publishes nothing before the questions are answered', () => {
    expect(issueOf(finishDraft(measured(straightHeadset, 'principal')))).toEqual({ ok: false, error: 'incomplete' })
  })
})
