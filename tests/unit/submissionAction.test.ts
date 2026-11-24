import { describe, expect, it } from 'vitest'
import { issueFieldsOf, renderIssueBody, type IssueError } from '../../src/lib/issueForm'
import { messageFor, readEvent, runAction, type ActionEvent, type DataFiles } from '../../src/lib/submissionAction'
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
import { wimfovResultLink } from '../../src/lib/wimfov'
import type { Tool } from '../../src/lib/submission'
import { atlasSubmission, testHmdSubmission, wimfovPage, wimfovResultId } from './fixtures'

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

const comment = (text: string, login = 'someone', action = 'created'): unknown =>
  payload({ action, extra: { comment: { body: text, user: { login } } } })

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
    ['unknown', 'The submission is invalid.'],
  ])('explains %s', (error, expected) => {
    expect(messageFor(error as IssueError)).toContain(expected)
  })

  it('keeps every message on one line', () => {
    const errors: IssueError[] = ['body-malformed', 'vrhp-too-short', 'wimfov-mismatch', 'tuning-details-markup']
    for (const error of errors) expect(messageFor(error)).not.toMatch(/[\r\n]/)
  })
})
