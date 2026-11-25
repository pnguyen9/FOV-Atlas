import { describe, expect, it } from 'vitest'
import { renderIssueBody, type IssueError } from '../../src/lib/issueForm'
import { messageFor, readEvent, rebuildAggregates, runAction, type ActionEvent, type DataFiles } from '../../src/lib/submissionAction'
import {
  aggregatePath,
  emptyPage,
  entriesPerPage,
  indexPath,
  lookupPath,
  pagePath,
  parsePage,
  serialize,
  serializePage,
  withEntry,
} from '../../src/lib/submissionStore'
import { parseRenderedAverage, renderedPath } from '../../src/lib/renderedAverage'
import { wimfovResultLink } from '../../src/lib/wimfov'
import type { Tool } from '../../src/lib/submission'
import { atlasSubmission, issueFieldsOf, testHmdSubmission, wimfovPage, wimfovResultId } from './fixtures'

interface MemoryFiles extends DataFiles {
  readonly contents: Map<string, string>
}

function memoryFiles(initial: Record<string, string> = {}): MemoryFiles {
  const contents = new Map(Object.entries(initial))
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

const atlasBody = renderIssueBody(issueFieldsOf(atlasSubmission))
const atlasPage = pagePath('atlas', 'bigscreen-beyond-2', 0)

interface PayloadParts {
  action?: string
  labels?: unknown
  login?: string
  body?: unknown
  number?: unknown
  extra?: Record<string, unknown>
  issueExtra?: Record<string, unknown>
}

function payload({
  action = 'opened',
  labels = [{ name: 'submission' }],
  login = 'Someone',
  body = atlasBody,
  number = 42,
  extra = {},
  issueExtra = {},
}: PayloadParts = {}): unknown {
  return { action, issue: { number, user: { login }, labels, body, ...issueExtra }, ...extra }
}

const comment = (text: string, login = 'someone', action = 'created', association = 'NONE'): unknown =>
  payload({ action, extra: { comment: { body: text, user: { login }, author_association: association } } })
const otherBody = renderIssueBody(issueFieldsOf({ ...atlasSubmission, headset: 'other', otherHeadsetName: 'Meta Boba 3 prototype' }))

describe('readEvent', () => {
  it('reads an opened submission', () => {
    expect(readEvent('issues', payload())).toEqual({ kind: 'submission', issue: 42, author: 'Someone', body: atlasBody })
  })

  it('reads an edit of the body', () => {
    const event = readEvent('issues', payload({ action: 'edited', extra: { changes: { body: { from: '' } } } }))
    expect(event?.kind).toBe('submission')
  })

  it('reads a missing body as empty', () => {
    expect(readEvent('issues', payload({ body: null }))).toMatchObject({ body: '' })
  })

  it('reads /withdraw from the issue author, whatever the case of the login', () => {
    expect(readEvent('issue_comment', comment('  /withdraw\n'))).toEqual({ kind: 'withdraw', issue: 42, author: 'Someone' })
  })

  it.each(['OWNER', 'MEMBER', 'COLLABORATOR'])('reads /recheck from a maintainer (%s) as the issue as it stands', (association) => {
    expect(readEvent('issue_comment', comment(' /recheck\n', 'maintainer', 'created', association))).toEqual({
      kind: 'submission',
      issue: 42,
      author: 'Someone',
      body: atlasBody,
    })
  })

  it('reads a missing body as empty on /recheck', () => {
    const event = payload({ action: 'created', body: null, extra: { comment: { body: '/recheck', user: { login: 'maintainer' }, author_association: 'OWNER' } } })
    expect(readEvent('issue_comment', event)).toMatchObject({ body: '' })
  })

  it.each([
    ['a payload that is not an object', 'issues', null],
    ['another issue action', 'issues', payload({ action: 'closed' })],
    ['an edit of the title only', 'issues', payload({ action: 'edited', extra: { changes: { title: { from: '' } } } })],
    ['an issue without the submission label', 'issues', payload({ labels: [{ name: 'bug' }] })],
    ['labels that are not a list', 'issues', payload({ labels: 'submission' })],
    ['a withdrawn issue', 'issues', payload({ labels: [{ name: 'submission' }, { name: 'withdrawn' }] })],
    ['a pull request', 'issue_comment', payload({ issueExtra: { pull_request: {} } })],
    ['an issue number that is not a positive integer', 'issues', payload({ number: 0 })],
    ['an issue number that is text', 'issues', payload({ number: '42' })],
    ['an invalid login', 'issues', payload({ login: 'some one' })],
    ['/withdraw from someone else', 'issue_comment', comment('/withdraw', 'other')],
    ['another comment', 'issue_comment', comment('/withdraw please')],
    ['/recheck from the issue author', 'issue_comment', comment('/recheck')],
    ['/recheck from a contributor without write access', 'issue_comment', comment('/recheck', 'other', 'created', 'CONTRIBUTOR')],
    ['/recheck without an association', 'issue_comment', payload({ extra: { comment: { body: '/recheck', user: { login: 'other' } } } })],
    ['an edited /recheck', 'issue_comment', comment('/recheck', 'other', 'edited', 'OWNER')],
    ['an edited comment', 'issue_comment', comment('/withdraw', 'someone', 'edited')],
    ['a comment without text', 'issue_comment', payload({ extra: { comment: { user: { login: 'someone' } } } })],
    ['another event', 'push', payload()],
  ])('ignores %s', (_description, eventName, eventPayload) => {
    expect(readEvent(eventName, eventPayload)).toBeNull()
  })
})

const submissionEvent = (body: string, issue = 42): ActionEvent => ({ kind: 'submission', issue, author: 'someone', body })
const withdrawEvent = (issue = 42): ActionEvent => ({ kind: 'withdraw', issue, author: 'someone' })

describe('runAction', () => {
  const json = (files: MemoryFiles, path: string): unknown => JSON.parse(files.contents.get(path) ?? 'null')
  const issuesOn = (files: MemoryFiles, tool: Tool, headset: string, page: number): string[] =>
    Object.keys(parsePage(files.contents.get(pagePath(tool, headset, page)) ?? '', tool, headset, page)?.entries ?? {})
  const valveBody = renderIssueBody(issueFieldsOf({ ...testHmdSubmission, headset: 'valve-index' }))

  /** Stores issues 1 to `count` on the atlas headset. */
  function filled(count: number): MemoryFiles {
    const files = memoryFiles()
    for (let issue = 1; issue <= count; issue += 1) runAction(submissionEvent(atlasBody, issue), files)
    return files
  }

  it('stores an accepted submission with its aggregate, the index and the issue lookup', () => {
    const files = memoryFiles()
    const result = runAction(submissionEvent(atlasBody), files)
    expect(result.outcome).toBe('accepted')
    expect(result.message).toContain('`bigscreen-beyond-2`')
    expect(result.commitMessage).toBe('Store submission #42 (atlas/bigscreen-beyond-2)')
    const page = parsePage(files.contents.get(atlasPage) ?? '', 'atlas', 'bigscreen-beyond-2', 0)
    expect(page?.entries['42']).toEqual({ author: 'someone', submission: atlasSubmission })
    expect(files.contents.get(aggregatePath('atlas', 'bigscreen-beyond-2'))).toContain('"count": 1')
    expect(json(files, indexPath)).toEqual({ version: 1, headsets: { atlas: { 'bigscreen-beyond-2': { count: 1, pages: 1 } } } })
    expect(json(files, lookupPath(0))).toEqual({
      version: 1,
      lookup: 0,
      issues: { 42: { tool: 'atlas', headset: 'bigscreen-beyond-2', page: 0 } },
    })
  })

  it('replaces an edited submission on its page when it stays on its headset', () => {
    const files = filled(entriesPerPage + 1)
    const edited = renderIssueBody(issueFieldsOf({ ...atlasSubmission, ipd: 60 }))
    expect(runAction(submissionEvent(edited, 5), files).outcome).toBe('accepted')
    const page = parsePage(files.contents.get(atlasPage) ?? '', 'atlas', 'bigscreen-beyond-2', 0)
    expect(page?.entries['5']?.submission.ipd).toBe(60)
    expect(issuesOn(files, 'atlas', 'bigscreen-beyond-2', 1)).toEqual([String(entriesPerPage + 1)])
    expect(json(files, indexPath)).toEqual({
      version: 1,
      headsets: { atlas: { 'bigscreen-beyond-2': { count: entriesPerPage + 1, pages: 2 } } },
    })
  })

  it('moves an edited submission to its new headset', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    runAction(submissionEvent(atlasBody, 43), files)
    expect(runAction(submissionEvent(valveBody), files).outcome).toBe('accepted')
    expect(issuesOn(files, 'atlas', 'bigscreen-beyond-2', 0)).toEqual(['43'])
    expect(issuesOn(files, 'testhmd', 'valve-index', 0)).toEqual(['42'])
    expect(json(files, indexPath)).toEqual({
      version: 1,
      headsets: { atlas: { 'bigscreen-beyond-2': { count: 1, pages: 1 } }, testhmd: { 'valve-index': { count: 1, pages: 1 } } },
    })
    expect(json(files, lookupPath(0))).toMatchObject({ issues: { 42: { tool: 'testhmd', headset: 'valve-index', page: 0 } } })
  })

  it('reads and writes the index and the issue lookup once per event, even when a measure moves', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    const reads: string[] = []
    const writes: string[] = []
    const counted: DataFiles = {
      read: (path) => {
        reads.push(path)
        return files.read(path)
      },
      write: (path, content) => {
        writes.push(path)
        files.write(path, content)
      },
      remove: (path) => {
        files.remove(path)
      },
    }
    expect(runAction(submissionEvent(valveBody), counted).outcome).toBe('accepted')
    const times = (paths: readonly string[], path: string): number => paths.filter((item) => item === path).length
    expect([times(reads, indexPath), times(reads, lookupPath(0))]).toEqual([1, 1])
    expect([times(writes, indexPath), times(writes, lookupPath(0))]).toEqual([1, 1])
  })

  it('removes the old headset entirely when its last submission moves away', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    runAction(submissionEvent(valveBody), files)
    expect(files.contents.has(atlasPage)).toBe(false)
    expect(files.contents.has(aggregatePath('atlas', 'bigscreen-beyond-2'))).toBe(false)
    expect(json(files, indexPath)).toEqual({ version: 1, headsets: { testhmd: { 'valve-index': { count: 1, pages: 1 } } } })
  })

  it('starts a new page once the last one is full', () => {
    const files = filled(entriesPerPage + 1)
    expect(issuesOn(files, 'atlas', 'bigscreen-beyond-2', 0)).toHaveLength(entriesPerPage)
    expect(issuesOn(files, 'atlas', 'bigscreen-beyond-2', 1)).toEqual([String(entriesPerPage + 1)])
    expect(json(files, lookupPath(0))).toMatchObject({ issues: { [entriesPerPage + 1]: { page: 1 } } })
    expect(json(files, aggregatePath('atlas', 'bigscreen-beyond-2'))).toMatchObject({ count: entriesPerPage + 1 })
  })

  it('leaves a gap on an earlier page and keeps appending to the last one', () => {
    const files = filled(entriesPerPage + 1)
    expect(runAction(withdrawEvent(1), files).outcome).toBe('withdrawn')
    expect(issuesOn(files, 'atlas', 'bigscreen-beyond-2', 0)).toHaveLength(entriesPerPage - 1)
    runAction(submissionEvent(atlasBody, 5000), files)
    expect(issuesOn(files, 'atlas', 'bigscreen-beyond-2', 1)).toEqual([String(entriesPerPage + 1), '5000'])
    expect(json(files, indexPath)).toEqual({
      version: 1,
      headsets: { atlas: { 'bigscreen-beyond-2': { count: entriesPerPage + 1, pages: 2 } } },
    })
    expect(json(files, lookupPath(5))).toEqual({
      version: 1,
      lookup: 5,
      issues: { 5000: { tool: 'atlas', headset: 'bigscreen-beyond-2', page: 1 } },
    })
  })

  it('drops trailing pages left empty, however many', () => {
    const files = filled(entriesPerPage + 1)
    for (let issue = 1; issue <= entriesPerPage; issue += 1) runAction(withdrawEvent(issue), files)
    expect(files.contents.get(atlasPage)).toContain('"entries":{}')
    runAction(withdrawEvent(entriesPerPage + 1), files)
    expect([...files.contents.keys()]).toEqual([indexPath])
    expect(json(files, indexPath)).toEqual({ version: 1, headsets: {} })
  })

  it('keeps an empty page that has a later page after it', () => {
    const files = filled(entriesPerPage + 1)
    for (let issue = 1; issue <= entriesPerPage; issue += 1) runAction(withdrawEvent(issue), files)
    expect(json(files, indexPath)).toEqual({ version: 1, headsets: { atlas: { 'bigscreen-beyond-2': { count: 1, pages: 2 } } } })
    expect(files.contents.has(lookupPath(0))).toBe(true)
  })

  it('uses the fetched WIMFOV page', () => {
    const fields = { ...issueFieldsOf(atlasSubmission), tool: 'wimfov', measure: '', 'wimfov-link': wimfovResultLink(wimfovResultId) }
    const files = memoryFiles()
    expect(runAction(submissionEvent(renderIssueBody(fields)), files, { wimfovPage: wimfovPage() }).outcome).toBe('accepted')
    expect(files.contents.has(pagePath('wimfov', 'bigscreen-beyond-2', 0))).toBe(true)
  })

  it('checks a headset missing from the catalog but stores nothing, waiting for a maintainer', () => {
    const files = memoryFiles()
    const result = runAction(submissionEvent(otherBody), files)
    expect(result).toMatchObject({ outcome: 'new-headset', commitMessage: '' })
    expect(result.message).toContain('check the model by hand')
    expect(result.message).not.toContain('Boba')
    expect(result.message).not.toContain('accepted earlier')
    expect(files.contents.size).toBe(0)
  })

  it('keeps the accepted version when an edit moves the issue to a headset missing from the catalog', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    const stored = new Map(files.contents)
    const result = runAction(submissionEvent(otherBody), files)
    expect(result.outcome).toBe('new-headset')
    expect(result.message).toContain('accepted earlier stays published')
    expect(files.contents).toEqual(stored)
  })

  it('rejects a headset missing from the catalog when something else is invalid', () => {
    expect(runAction(submissionEvent(otherBody.replace('in-between', 'deep')), memoryFiles()).outcome).toBe('invalid')
  })

  it('answers an invalid submission with the reason and stores nothing', () => {
    const files = memoryFiles()
    const result = runAction(submissionEvent(atlasBody.replace('### Note', '### Notes')), files)
    expect(result).toMatchObject({ outcome: 'invalid', commitMessage: '' })
    expect(result.message).toContain(messageFor('body-malformed'))
    expect(result.message).not.toContain('accepted earlier')
    expect(files.contents.size).toBe(0)
  })

  it('keeps the accepted version when an edit makes the issue invalid, and says so', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    const stored = new Map(files.contents)
    const result = runAction(submissionEvent(atlasBody.replace('### Note', '### Notes')), files)
    expect(result.outcome).toBe('invalid')
    expect(result.message).toContain('accepted earlier stays published')
    expect(files.contents).toEqual(stored)
  })

  it('removes a withdrawn submission, its empty page, its aggregate and its lookup', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    const result = runAction(withdrawEvent(), files)
    expect(result).toMatchObject({ outcome: 'withdrawn', commitMessage: 'Withdraw submission #42' })
    expect([...files.contents.keys()]).toEqual([indexPath])
    expect(json(files, indexPath)).toEqual({ version: 1, headsets: {} })
  })

  describe('averaged rendered field of view', () => {
    const stock = { ...atlasSubmission, tuning: { physicallyModded: false, driverTuned: false, details: '' } }
    const bodyOf = (submission: typeof atlasSubmission): string => renderIssueBody(issueFieldsOf(submission))
    const widened = (degrees: number): typeof atlasSubmission => {
      const { ceiling } = atlasSubmission
      if (ceiling.source !== 'measured') throw new Error('no edges')
      return {
        ...stock,
        ceiling: { ...ceiling, left: { ...ceiling.left, left: ceiling.left.left + degrees }, right: { ...ceiling.right, right: ceiling.right.right + degrees } },
      }
    }
    const averagePath = renderedPath('bigscreen-beyond-2')

    it('rebuilds the model’s average with each FOV Atlas measure, leaving driver-tuned ones out', () => {
      const files = memoryFiles()
      expect(runAction(submissionEvent(atlasBody, 1), files).renderedDiffers).toBe(false)
      expect(files.contents.has(averagePath)).toBe(false)
      expect(runAction(submissionEvent(bodyOf(stock), 2), files)).toMatchObject({ outcome: 'accepted', renderedDiffers: false })
      expect(parseRenderedAverage(files.contents.get(averagePath) ?? '', 'bigscreen-beyond-2')?.count).toBe(1)
      expect(json(files, indexPath)).toMatchObject({ rendered: { 'bigscreen-beyond-2': 1 } })
      runAction(submissionEvent(bodyOf(widened(2)), 3), files)
      expect(parseRenderedAverage(files.contents.get(averagePath) ?? '', 'bigscreen-beyond-2')?.values.horizontal).toMatchObject({
        count: 2,
        min: 110,
        max: 114,
      })
    })

    it('stores a measure far from the average anyway, saying which values differ and by how much', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      const result = runAction(submissionEvent(bodyOf(widened(3)), 2), files)
      expect(result).toMatchObject({ outcome: 'accepted', renderedDiffers: true })
      expect(result.message).toContain('differs by more than 4° from the average of this model\'s other measures')
      expect(result.message).toContain('horizontal, both eyes: 116.0°, against 110.0° on average over the 1 other measure (6.0° apart)')
      expect(result.message).not.toContain('left eye, left edge')
      expect(result.message).not.toMatch(/[\r\n]/)
      expect(files.contents.get(averagePath)).toContain('"count": 2')
    })

    it('leaves the measure itself out of the average it is checked against, on an edit too', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      runAction(submissionEvent(bodyOf(stock), 2), files)
      expect(runAction(submissionEvent(bodyOf(widened(1)), 2), files).renderedDiffers).toBe(false)
      const edited = runAction(submissionEvent(bodyOf(widened(5)), 2), files)
      expect(edited.message).toContain('average over the 1 other measure')
      expect(edited.message).toContain('(10.0° apart)')
      expect(runAction(submissionEvent(bodyOf(widened(5)), 3), files).message).toContain('over the 2 other measures')
    })

    it('drops the average and its listing once its last measure is withdrawn', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock)), files)
      runAction(withdrawEvent(), files)
      expect(files.contents.has(averagePath)).toBe(false)
      expect(json(files, indexPath)).toEqual({ version: 1, headsets: {} })
    })

    const averageIn = (files: MemoryFiles, headset: string): ReturnType<typeof parseRenderedAverage> =>
      parseRenderedAverage(files.contents.get(renderedPath(headset)) ?? '', headset)

    it('rebuilds both models’ averages when an edit moves a measure to another headset', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      runAction(submissionEvent(bodyOf(stock), 2), files)
      runAction(submissionEvent(bodyOf({ ...stock, headset: 'valve-index' }), 2), files)
      expect(averageIn(files, 'bigscreen-beyond-2')?.count).toBe(1)
      expect(averageIn(files, 'valve-index')?.count).toBe(1)
      expect(json(files, indexPath)).toMatchObject({ rendered: { 'bigscreen-beyond-2': 1, 'valve-index': 1 } })
      runAction(submissionEvent(bodyOf({ ...stock, headset: 'valve-index' }), 1), files)
      expect(files.contents.has(averagePath)).toBe(false)
      expect(averageIn(files, 'valve-index')?.count).toBe(2)
      expect(json(files, indexPath)).toMatchObject({ rendered: { 'valve-index': 2 } })
      expect(json(files, indexPath)).not.toHaveProperty(['rendered', 'bigscreen-beyond-2'])
    })

    it('drops a measure from the average when an edit changes its tool away from FOV Atlas', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      runAction(submissionEvent(bodyOf(stock), 2), files)
      const testHmd = { ...testHmdSubmission, tuning: stock.tuning }
      expect(runAction(submissionEvent(bodyOf(testHmd), 2), files)).toMatchObject({ outcome: 'accepted', renderedDiffers: false })
      expect(averageIn(files, 'bigscreen-beyond-2')?.count).toBe(1)
      expect(json(files, indexPath)).toMatchObject({ rendered: { 'bigscreen-beyond-2': 1 } })
      runAction(submissionEvent(bodyOf(testHmd), 1), files)
      expect(files.contents.has(averagePath)).toBe(false)
      expect(json(files, indexPath)).not.toHaveProperty('rendered')
    })

    it('takes a measure edited to driver-tuned out of the average, unflagged', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      expect(runAction(submissionEvent(bodyOf(widened(5)), 2), files).renderedDiffers).toBe(true)
      const tuned = { ...widened(5), tuning: atlasSubmission.tuning }
      const result = runAction(submissionEvent(bodyOf(tuned), 2), files)
      expect(result).toMatchObject({ outcome: 'accepted', renderedDiffers: false })
      expect(result.message).not.toContain('Note for the maintainers')
      expect(averageIn(files, 'bigscreen-beyond-2')?.count).toBe(1)
      expect(averageIn(files, 'bigscreen-beyond-2')?.values.horizontal).toMatchObject({ min: 110, max: 110 })
    })

    it('rebuilds the average on a maintainer’s /recheck', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      const recheck = readEvent(
        'issue_comment',
        payload({
          action: 'created',
          number: 2,
          body: bodyOf(widened(5)),
          extra: { comment: { body: '/recheck', user: { login: 'maintainer' }, author_association: 'OWNER' } },
        }),
      )
      if (recheck === null) throw new Error('no event')
      expect(runAction(recheck, files)).toMatchObject({ outcome: 'accepted', renderedDiffers: true })
      expect(averageIn(files, 'bigscreen-beyond-2')?.count).toBe(2)
      expect(json(files, indexPath)).toMatchObject({ rendered: { 'bigscreen-beyond-2': 2 } })
    })

    it('rewrites the average without a withdrawn measure while others remain', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      runAction(submissionEvent(bodyOf(widened(2)), 2), files)
      runAction(submissionEvent(bodyOf(widened(4)), 3), files)
      expect(runAction(withdrawEvent(2), files).outcome).toBe('withdrawn')
      expect(averageIn(files, 'bigscreen-beyond-2')?.count).toBe(2)
      expect(averageIn(files, 'bigscreen-beyond-2')?.values.horizontal).toMatchObject({ count: 2, min: 110, max: 118 })
      expect(json(files, indexPath)).toMatchObject({ rendered: { 'bigscreen-beyond-2': 2 } })
    })

    it('leaves the average alone for other tools', () => {
      const files = memoryFiles()
      runAction(submissionEvent(bodyOf(stock), 1), files)
      const before = files.contents.get(averagePath)
      const testHmd = { ...testHmdSubmission, tuning: stock.tuning, headset: 'bigscreen-beyond-2' }
      expect(runAction(submissionEvent(bodyOf(testHmd), 2), files)).toMatchObject({ outcome: 'accepted', renderedDiffers: false })
      expect(files.contents.get(averagePath)).toBe(before)
    })
  })

  it('says so when there is nothing to withdraw', () => {
    expect(runAction(withdrawEvent(), memoryFiles())).toMatchObject({ outcome: 'not-found', commitMessage: '' })
  })

  const atlasIndex = serialize({ version: 1, headsets: { atlas: { 'bigscreen-beyond-2': { count: 1, pages: 1 } } } })
  const atlasLookup = (page: number): string =>
    serialize({ version: 1, lookup: 0, issues: { 42: { tool: 'atlas', headset: 'bigscreen-beyond-2', page } } })
  const otherIssuePage = serializePage(
    withEntry(emptyPage('atlas', 'bigscreen-beyond-2', 0), 43, { author: 'someone', submission: atlasSubmission }),
  )

  it.each([
    ['a corrupt page', { [indexPath]: atlasIndex, [atlasPage]: '{' }, submissionEvent(atlasBody), 'is corrupt'],
    ['a page the index lists but that is missing', { [indexPath]: atlasIndex }, submissionEvent(atlasBody), 'is missing'],
    ['a corrupt index', { [indexPath]: '[]' }, submissionEvent(atlasBody), 'is corrupt'],
    ['a corrupt issue lookup', { [lookupPath(0)]: '{' }, submissionEvent(atlasBody), 'is corrupt'],
    [
      'a lookup pointing outside the data',
      { [lookupPath(0)]: serialize({ version: 1, lookup: 0, issues: { 42: { tool: 'atlas', headset: '../../x', page: 0 } } }) },
      withdrawEvent(),
      'is corrupt',
    ],
    [
      'a lookup pointing to a page without the issue, on withdraw',
      { [indexPath]: atlasIndex, [atlasPage]: otherIssuePage, [lookupPath(0)]: atlasLookup(0) },
      withdrawEvent(),
      'to a page without it',
    ],
    [
      'a lookup pointing to a page without the issue, on edit',
      { [indexPath]: atlasIndex, [atlasPage]: otherIssuePage, [lookupPath(0)]: atlasLookup(0) },
      submissionEvent(atlasBody),
      'to a page without it',
    ],
    [
      'a lookup pointing past the last page',
      { [indexPath]: atlasIndex, [atlasPage]: otherIssuePage, [lookupPath(0)]: atlasLookup(3) },
      submissionEvent(atlasBody),
      'to a page without it',
    ],
  ])('stops on %s', (_description, initial: Record<string, string>, event: ActionEvent, message) => {
    expect(() => runAction(event, memoryFiles(initial))).toThrow(message)
  })
})

describe('messageFor', () => {
  it.each([
    ['wimfov-link-not-read-only', 'Never post your WIMFOV edit link'],
    ['note-heading-line', '“Note” has a line starting with `#`.'],
    ['facial-interface-too-long', '“Facial interface and cushion” is too long.'],
    ['headset-name-markup', '“Headset name, if not listed” contains `<` or `>`'],
    ['headset-name-missing', 'must give the model’s name'],
    ['unknown', 'The submission is invalid.'],
  ])('explains %s', (error, expected) => {
    expect(messageFor(error as IssueError)).toContain(expected)
  })

  it('keeps every message on one line', () => {
    const errors: IssueError[] = ['body-malformed', 'vrhp-too-short', 'wimfov-mismatch', 'tuning-details-markup']
    for (const error of errors) expect(messageFor(error)).not.toMatch(/[\r\n]/)
  })
})

describe('rebuildAggregates', () => {
  it('rewrites every headset’s aggregate from its pages', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody, 1), files)
    runAction(submissionEvent(renderIssueBody(issueFieldsOf({ ...testHmdSubmission, headset: 'valve-index' })), 2), files)
    const atlasAggregate = aggregatePath('atlas', 'bigscreen-beyond-2')
    const built = files.contents.get(atlasAggregate)
    files.write(atlasAggregate, 'stale')
    files.remove(aggregatePath('testhmd', 'valve-index'))
    expect(rebuildAggregates(files)).toBe(2)
    expect(files.contents.get(atlasAggregate)).toBe(built)
    expect(files.contents.get(aggregatePath('testhmd', 'valve-index'))).toContain('"count": 1')
  })

  it('refuses a missing page the index lists', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody, 1), files)
    files.remove(atlasPage)
    expect(() => rebuildAggregates(files)).toThrow(`${atlasPage} is missing`)
  })

  it('writes nothing without an index', () => {
    expect(rebuildAggregates(memoryFiles())).toBe(0)
  })
})
