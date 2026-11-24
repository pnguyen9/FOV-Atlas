import { describe, expect, it } from 'vitest'
import { dataFilePath } from '../../scripts/files'

describe('dataFilePath', () => {
  const root = '/repository'

  it('resolves a data file of either directory below the repository', () => {
    expect(dataFilePath(root, 'public/data/submissions/atlas/valve-index/0.json')).toBe(
      '/repository/public/data/submissions/atlas/valve-index/0.json',
    )
    expect(dataFilePath(root, 'data/issues/12.json')).toBe('/repository/data/issues/12.json')
  })

  it.each([
    ['a parent segment', 'public/data/../../etc/passwd.json'],
    ['a parent segment from the lookups', 'data/issues/../../etc/passwd.json'],
    ['a move from the lookups into the site', 'data/issues/../../public/data/index.json'],
    ['a sibling of the lookups sharing the prefix', 'data/issues-old/1.json'],
    ['the lookup directory itself', 'data/issues'],
    ['a file next to the lookups', 'data/index.json'],
    ['an absolute path', '/etc/data.json'],
    ['a sibling sharing the prefix', 'public/database.json'],
    ['the data directory itself', 'public/data'],
    ['a file outside the data directory', 'package.json'],
    ['a path that is not a data file name', 'public/data/index.html'],
  ])('refuses %s', (_description, path) => {
    expect(() => dataFilePath(root, path)).toThrow('Refusing')
  })
})
