import { describe, expect, it } from 'vitest'
import { issueFieldsOf, renderIssueBody, type IssueError } from '../../src/lib/issueForm'
import { messageFor, readEvent, runAction, type ActionEvent, type DataFiles } from '../../src/lib/submissionAction'
import { aggregatePath, indexPath, parseShard, shardDirectory, shardPath } from '../../src/lib/submissionStore'
import { wimfovResultLink } from '../../src/lib/wimfov'
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
    listShards: () => [...contents.keys()].filter((path) => path.startsWith(`${shardDirectory}/`)),
  }
}

const atlasBody = renderIssueBody(issueFieldsOf(atlasSubmission))
const atlasShard = shardPath('atlas', 'bigscreen-beyond-2')

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
  it('stores an accepted submission with its aggregate and the index', () => {
    const files = memoryFiles()
    const result = runAction(submissionEvent(atlasBody), files)
    expect(result.outcome).toBe('accepted')
    expect(result.message).toContain('`bigscreen-beyond-2`')
    expect(result.commitMessage).toBe('Store submission #42 (atlas/bigscreen-beyond-2)')
    const shard = parseShard(files.contents.get(atlasShard) ?? '', 'atlas', 'bigscreen-beyond-2')
    expect(shard?.entries['42']).toEqual({ author: 'someone', submission: atlasSubmission })
    expect(files.contents.get(aggregatePath('atlas', 'bigscreen-beyond-2'))).toContain('"count": 1')
    expect(JSON.parse(files.contents.get(indexPath) ?? '')).toEqual({ version: 1, counts: { atlas: { 'bigscreen-beyond-2': 1 } } })
  })

  it('moves an edited submission to its new shard', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    runAction(submissionEvent(atlasBody, 43), files)
    const moved = renderIssueBody(issueFieldsOf({ ...testHmdSubmission, headset: 'valve-index' }))
    expect(runAction(submissionEvent(moved), files).outcome).toBe('accepted')
    expect(Object.keys(parseShard(files.contents.get(atlasShard) ?? '', 'atlas', 'bigscreen-beyond-2')?.entries ?? {})).toEqual(['43'])
    expect(files.contents.has(shardPath('testhmd', 'valve-index'))).toBe(true)
    expect(JSON.parse(files.contents.get(indexPath) ?? '')).toEqual({
      version: 1,
      counts: { atlas: { 'bigscreen-beyond-2': 1 }, testhmd: { 'valve-index': 1 } },
    })
  })

  it('uses the fetched WIMFOV page', () => {
    const fields = { ...issueFieldsOf(atlasSubmission), tool: 'wimfov', measure: '', 'wimfov-link': wimfovResultLink(wimfovResultId) }
    const files = memoryFiles()
    expect(runAction(submissionEvent(renderIssueBody(fields)), files, { wimfovPage: wimfovPage() }).outcome).toBe('accepted')
    expect(files.contents.has(shardPath('wimfov', 'bigscreen-beyond-2'))).toBe(true)
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

  it('removes a withdrawn submission, its empty shard and its aggregate', () => {
    const files = memoryFiles()
    runAction(submissionEvent(atlasBody), files)
    const result = runAction(withdrawEvent(), files)
    expect(result).toMatchObject({ outcome: 'withdrawn', commitMessage: 'Withdraw submission #42' })
    expect([...files.contents.keys()]).toEqual([indexPath])
    expect(JSON.parse(files.contents.get(indexPath) ?? '')).toEqual({ version: 1, counts: {} })
  })

  it('says so when there is nothing to withdraw', () => {
    expect(runAction(withdrawEvent(), memoryFiles())).toMatchObject({ outcome: 'not-found', commitMessage: '' })
  })

  it.each([
    ['a corrupt shard', { [atlasShard]: '{' }, 'is corrupt'],
    ['a corrupt index', { [indexPath]: '[]' }, 'is corrupt'],
    ['an unexpected file among the shards', { [`${shardDirectory}/notes.txt`]: '' }, 'Unexpected file'],
    ['a shard of an unknown tool', { [`${shardDirectory}/hmdq/valve-index.json`]: '{}' }, 'Unexpected file'],
  ])('stops on %s', (_description, initial: Record<string, string>, message) => {
    expect(() => runAction(submissionEvent(atlasBody), memoryFiles(initial))).toThrow(message)
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
