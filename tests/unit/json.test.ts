import { describe, expect, it } from 'vitest'
import {
  isBoolean,
  isCount,
  isFiniteNumber,
  isPlainObject,
  isPositiveCount,
  isString,
  matches,
  oneOf,
  parseJson,
} from '../../src/lib/json'

describe('parseJson', () => {
  it('parses JSON, null included', () => {
    expect(parseJson('{"values":[1]}')).toEqual({ values: [1] })
    expect(parseJson('null')).toBeNull()
  })
  it.each(['', '{', 'undefined', "{'values':1}"])('gives undefined for %j, which is not JSON', (text) => {
    expect(parseJson(text)).toBeUndefined()
  })
})

describe('isPlainObject', () => {
  it('accepts objects only, never arrays or null', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('{}')).toBe(false)
  })
})

describe('value checks', () => {
  it('tells strings, booleans and finite numbers', () => {
    expect(isString('')).toBe(true)
    expect(isString(1)).toBe(false)
    expect(isBoolean(false)).toBe(true)
    expect(isBoolean(0)).toBe(false)
    expect(isFiniteNumber(-1.5)).toBe(true)
    expect([Number.NaN, Number.POSITIVE_INFINITY, '1'].some(isFiniteNumber)).toBe(false)
  })

  it.each([
    [0, true, false],
    [3, true, true],
    [-1, false, false],
    [1.5, false, false],
    [2 ** 53, false, false],
    ['2', false, false],
  ])('counts %j: %s from zero, %s from one', (value, count, positive) => {
    expect(isCount(value)).toBe(count)
    expect(isPositiveCount(value)).toBe(positive)
  })

  it('accepts one of a set of choices', () => {
    expect(oneOf(['a', 'b'])('b')).toBe(true)
    expect(oneOf(['a', 'b'])('c')).toBe(false)
  })
})

describe('matches', () => {
  const shape = matches({ name: isString, count: isCount })
  it('accepts exactly the keys, each passing its check', () => {
    expect(shape({ name: 'x', count: 1 })).toBe(true)
  })
  it.each([
    ['a missing key', { name: 'x' }],
    ['an extra key', { name: 'x', count: 1, more: true }],
    ['a failing value', { name: 'x', count: -1 }],
    ['a key in place of another', { name: 'x', total: 1 }],
    ['an array', ['x', 1]],
    ['null', null],
  ])('refuses %s', (_description, value) => {
    expect(shape(value)).toBe(false)
  })
})
