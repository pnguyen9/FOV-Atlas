import { describe, expect, it, vi } from 'vitest'
import { identity } from '../../src/lib/headFrame'
import { readRenderedViews } from '../../src/lib/renderedViews'
import { measureAvailability, reportsCornerMask, runMeasure, type XrSystemLike } from '../../src/lib/webxrMeasure'
import { headsetMessages, type MeasureOptions } from '../../src/lib/webxrMeasure'
import {
  answerByHead,
  environmentWith,
  FakeSession,
  frameViews,
  headTurned,
  onBack,
  onHeadPointing,
  onNo,
  onYes,
  pressButton,
  readingsOf,
  recorder,
  readyByHead,
  straightHeadset,
} from './xrFixtures'

const byHead: MeasureOptions = { choice: 'principal', mode: 'head' }
const byController: MeasureOptions = { choice: 'principal', mode: 'controller' }
const byKeyboard: MeasureOptions = { choice: 'principal', mode: 'keyboard' }
const [trigger, grip, buttonA, buttonB] = [0, 1, 4, 5]

/** Answers until the measure ends, at most `limit` times. */
function answerAll(answer: () => void, listener: ReturnType<typeof recorder>, limit = 400): void {
  for (let count = 0; count < limit && listener.outcomes.length === 0; count += 1) answer()
}

const lastUpdate = (listener: ReturnType<typeof recorder>) => listener.updates.at(-1)

describe('measureAvailability', () => {
  it('tells a browser without WebXR from one without a headset', async () => {
    expect(await measureAvailability(undefined)).toBe('no-webxr')
    const xr = (supported: Promise<boolean>): XrSystemLike => ({ isSessionSupported: () => supported, requestSession: vi.fn() })
    expect(await measureAvailability(xr(Promise.resolve(true)))).toBe('available')
    expect(await measureAvailability(xr(Promise.resolve(false)))).toBe('no-headset')
    expect(await measureAvailability(xr(Promise.reject(new Error('blocked'))))).toBe('no-headset')
  })
})

describe('reportsCornerMask', () => {
  it('reads a mask from an event carrying triangles', () => {
    expect(reportsCornerMask({ eye: 'left', vertices: new Float32Array(6), indices: new Uint32Array(3) })).toBe(true)
  })

  it.each([
    ['nothing', null],
    ['a number', 3],
    ['no indices', { vertices: [] }],
    ['empty indices', { indices: new Uint32Array(0) }],
    ['indices that are no list', { indices: 'abc' }],
    ['indices with no length', { indices: {} }],
    ['null indices', { indices: null }],
  ])('reads no mask from %s', (_, event) => {
    expect(reportsCornerMask(event)).toBe(false)
  })
})

describe('runMeasure', () => {
  it('measures every edge with the head and ends the session, with the rendered field of view read on the first frame', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    const listener = recorder()
    const handle = await runMeasure(environment, byHead, listener)
    expect(handle).not.toBeNull()
    expect(session.renderState).not.toBeNull()
    session.dispatch('visibilitymaskchange', { indices: new Uint32Array(6) })
    readyByHead(session)
    expect(lastUpdate(listener)).toEqual({ stage: 'asking', mode: 'head', done: 0, total: 16, eye: 'left', noPressArrived: false })
    answerAll(() => {
      answerByHead(session, onYes)
    }, listener)
    const [outcome] = listener.outcomes
    if (outcome?.kind !== 'measured') throw new Error('not measured')
    const read = readRenderedViews(readingsOf(straightHeadset))
    if (!read.ok || read.ceiling.source !== 'measured') throw new Error('fixture')
    // Seeing the line everywhere it is drawn confirms every edge at what the headset draws.
    expect(outcome.measure.measures.left.left).toBe(read.ceiling.left.left)
    expect(outcome.measure.measures.right.down).toBe(read.ceiling.right.down)
    expect(Object.keys(outcome.measure.measures.left)).toHaveLength(8)
    expect(outcome.measure.unsettled).toEqual([])
    expect(outcome.measure.ceiling).toEqual(read.ceiling)
    expect(outcome.measure.cornerMask).toBe('on')
    expect(session.endCalls).toBe(1)
    expect(listener.outcomes).toHaveLength(1)
    session.frame(identity)
    expect(session.waiting).toBe(0)
  })

  it('asks nothing until the wearer is ready, and places the targets from where the head faced then', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byHead, listener)
    // A headset lying still on a desk never gets ready.
    for (let frame = 0; frame < 30; frame += 1) session.frame(identity)
    expect(lastUpdate(listener)?.stage).toBe('ready')
    // Nor does a head held still looking almost straight up, which faces no clear way.
    for (let frame = 0; frame < 30; frame += 1) session.frame(headTurned(0, 80))
    expect(lastUpdate(listener)?.stage).toBe('ready')
    // Ready while facing 90° to the left: Yes and No hang below that way.
    const facingLeft = headTurned(90, 0)
    for (let frame = 0; frame < 16; frame += 1) session.frame(facingLeft)
    expect(lastUpdate(listener)?.stage).toBe('asking')
    answerByHead(session, onNo)
    expect(listener.updates.filter((update) => update.stage === 'asking')).toHaveLength(1)
    for (let frame = 0; frame < 10; frame += 1) session.frame(headTurned(90 - 14, -20))
    expect(listener.updates.filter((update) => update.stage === 'asking').length).toBeGreaterThan(1)
  })

  it('goes back one answer with the head, through the Back target', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byHead, listener)
    readyByHead(session)
    for (let count = 0; count < 30 && lastUpdate(listener)?.done === 0; count += 1) answerByHead(session, onYes)
    expect(lastUpdate(listener)?.done).toBe(1)
    answerByHead(session, onBack)
    expect(lastUpdate(listener)?.done).toBe(0)
  })

  it('answers once per hold with the head', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byHead, listener)
    readyByHead(session)
    const before = listener.updates.length
    for (let frame = 0; frame < 9; frame += 1) session.frame(onNo)
    expect(listener.updates).toHaveLength(before)
    for (let frame = 0; frame < 30; frame += 1) session.frame(onNo)
    expect(listener.updates).toHaveLength(before + 1)
  })

  it('answers with controller buttons, once per press, and goes back with the grip', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byController, listener)
    session.frame(identity)
    expect(lastUpdate(listener)?.stage).toBe('ready')
    pressButton(session, trigger)
    expect(lastUpdate(listener)?.stage).toBe('asking')
    // Yes every time confirms each edge at what the headset draws, a few answers per edge.
    for (let press = 0; press < 30 && lastUpdate(listener)?.done === 0; press += 1) pressButton(session, press % 2 === 0 ? trigger : buttonA)
    expect(lastUpdate(listener)?.done).toBe(1)
    pressButton(session, grip)
    expect(lastUpdate(listener)?.done).toBe(0)
    answerAll(() => {
      pressButton(session, buttonB)
    }, listener)
    const [outcome] = listener.outcomes
    // Never seeing the line keeps every edge at the smallest angle asked.
    expect(outcome?.kind === 'measured' ? outcome.measure.measures.left.up : null).toBe(1)
  })

  it('counts a press held down over many frames once', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byController, listener)
    session.frame(identity)
    pressButton(session, trigger)
    const before = listener.updates.length
    session.press([buttonB])
    for (let frame = 0; frame < 10; frame += 1) session.frame(identity)
    expect(listener.updates).toHaveLength(before + 1)
  })

  it('answers with keys, and stops listening to them when it ends', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    const listener = recorder()
    const handle = await runMeasure(environment, byKeyboard, listener)
    session.frame(identity)
    environment.pressKey('Enter')
    session.frame(identity)
    expect(lastUpdate(listener)?.stage).toBe('asking')
    environment.pressKey(' ')
    environment.pressKey('x')
    session.frame(identity)
    expect(lastUpdate(listener)?.done).toBe(0)
    const answered = listener.updates.length
    environment.pressKey('Backspace')
    session.frame(identity)
    expect(listener.updates.length).toBe(answered + 1)
    handle?.stop()
    expect(environment.keyListeners.size).toBe(0)
  })

  it('shows what to do in the headset while getting ready, and nothing once asking', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    await runMeasure(environment, byKeyboard, recorder())
    session.frame(identity)
    expect(environment.textPicture).toHaveBeenCalledWith(headsetMessages.get('keyboard'))
    // While getting ready both eyes see the dot and the message.
    expect(environment.viewport).toHaveBeenCalledWith(1000, 0, 1000, 1000)
    environment.pressKey('Enter')
    session.frame(identity)
    environment.viewport.mockClear()
    session.frame(identity)
    expect(environment.viewport).not.toHaveBeenCalledWith(1000, 0, 1000, 1000)
    expect(environment.textPicture).toHaveBeenCalledTimes(1)
  })

  it('offers head pointing when no key press arrives, and carries on with the head', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    const listener = recorder()
    await runMeasure(environment, byKeyboard, listener)
    for (let frame = 0; frame < 210; frame += 1) session.frame(identity)
    expect(lastUpdate(listener)).toMatchObject({ stage: 'ready', mode: 'keyboard', noPressArrived: true })
    expect(environment.textPicture).toHaveBeenCalledWith(headsetMessages.get('no-press'))
    for (let frame = 0; frame < 10; frame += 1) session.frame(onHeadPointing)
    expect(lastUpdate(listener)).toMatchObject({ stage: 'asking', mode: 'head', noPressArrived: false })
    answerByHead(session, onYes)
    answerAll(() => {
      answerByHead(session, onYes)
    }, listener)
    expect(listener.outcomes[0]?.kind).toBe('measured')
  })

  it('records no corner mask when the browser reports none', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byController, listener)
    session.dispatch('visibilitymaskchange', { indices: new Uint32Array(0) })
    session.frame(identity)
    answerAll(() => {
      pressButton(session, trigger)
    }, listener)
    const [outcome] = listener.outcomes
    expect(outcome?.kind === 'measured' ? outcome.measure.cornerMask : null).toBe('unknown')
  })

  it('takes no answers and counts no time while the headset is not showing the page', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byHead, listener)
    readyByHead(session)
    const before = listener.updates.length
    session.visibilityState = 'hidden'
    for (let frame = 0; frame < 20; frame += 1) session.frame(onYes)
    expect(listener.updates).toHaveLength(before)
  })

  it('counts a long pause between frames as a short one', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byHead, listener)
    readyByHead(session)
    const before = listener.updates.length
    session.frame(onYes, { seconds: 0.05 })
    session.frame(onYes, { seconds: 30 })
    expect(listener.updates).toHaveLength(before)
  })

  it('draws only in the eye being measured once asking, on a cleared layer', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    await runMeasure(environment, byController, recorder())
    session.frame(identity)
    pressButton(session, trigger)
    environment.viewport.mockClear()
    environment.drawArrays.mockClear()
    session.frame(identity)
    expect(environment.viewport).toHaveBeenCalledWith(0, 0, 2000, 1000)
    expect(environment.viewport).toHaveBeenCalledWith(0, 0, 1000, 1000)
    expect(environment.viewport).not.toHaveBeenCalledWith(1000, 0, 1000, 1000)
    // The dot and the line; no targets outside head mode.
    expect(environment.drawArrays).toHaveBeenCalledTimes(1)
  })

  it('skips a view the layer has no place for', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    await runMeasure({ ...environment, createLayer: () => ({ ...environment.createLayer(), getViewport: () => null }) }, byHead, recorder())
    session.frame(identity)
    expect(environment.drawArrays).not.toHaveBeenCalled()
  })

  it('waits for a frame with a pose', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byHead, listener)
    session.frame(identity, { views: null })
    expect(listener.updates).toHaveLength(0)
    expect(session.waiting).toBe(1)
  })

  it('stops when the views cannot be read, releasing what it drew with', async () => {
    const session = new FakeSession()
    const environment = environmentWith(session)
    const listener = recorder()
    await runMeasure(environment, byHead, listener)
    session.frame(identity, { views: frameViews(straightHeadset, identity).slice(0, 1) })
    expect(listener.outcomes).toEqual([{ kind: 'failed', reason: 'views-missing' }])
    expect(session.endCalls).toBe(1)
    expect(environment.fake.calls).toContain('deleteProgram')
  })

  it('drops an unfinished measure when stopped from the page or by the headset', async () => {
    const fromPage = new FakeSession()
    const listener = recorder()
    const handle = await runMeasure(environmentWith(fromPage), byHead, listener)
    fromPage.frame(identity)
    handle?.stop()
    handle?.stop()
    expect(listener.outcomes).toEqual([{ kind: 'stopped' }])

    const byHeadset = new FakeSession()
    const other = recorder()
    await runMeasure(environmentWith(byHeadset), { choice: 'all', mode: 'head' }, other)
    byHeadset.dispatch('end', {})
    expect(other.outcomes).toEqual([{ kind: 'stopped' }])
  })

  it('reports a session the browser refuses, releasing the renderer', async () => {
    const listener = recorder()
    const environment = environmentWith(new FakeSession(), { requestSession: () => Promise.reject(new Error('NotAllowedError')) })
    const handle = await runMeasure(environment, byHead, listener)
    expect(handle).toBeNull()
    expect(listener.outcomes).toEqual([{ kind: 'failed', reason: 'session-refused' }])
    expect(environment.fake.calls).toContain('deleteProgram')
  })

  it('ends a session whose setup fails after it opened', async () => {
    const session = new FakeSession()
    session.requestReferenceSpace = () => Promise.reject(new Error('NotSupportedError'))
    const listener = recorder()
    const handle = await runMeasure(environmentWith(session), byHead, listener)
    expect(handle).toBeNull()
    expect(listener.outcomes).toEqual([{ kind: 'failed', reason: 'session-refused' }])
    expect(session.endCalls).toBe(1)
  })

  it('hears the session end while it is still being set up, and stops there', async () => {
    const session = new FakeSession()
    let openSpace = (): void => undefined
    session.requestReferenceSpace = () =>
      new Promise((resolve) => {
        openSpace = () => {
          resolve({})
        }
      })
    const listener = recorder()
    const running = runMeasure(environmentWith(session), byHead, listener)
    await new Promise((resolve) => setTimeout(resolve, 0))
    session.dispatch('end', {})
    openSpace()
    expect(await running).toBeNull()
    expect(listener.outcomes).toEqual([{ kind: 'stopped' }])
  })

  it('keeps a corner mask reported while it is still being set up', async () => {
    const session = new FakeSession()
    session.requestReferenceSpace = () => {
      session.dispatch('visibilitymaskchange', { indices: new Uint32Array(3) })
      return Promise.resolve({})
    }
    const listener = recorder()
    await runMeasure(environmentWith(session), byController, listener)
    session.frame(identity)
    answerAll(() => {
      pressButton(session, trigger)
    }, listener)
    const [outcome] = listener.outcomes
    expect(outcome?.kind === 'measured' ? outcome.measure.cornerMask : null).toBe('on')
  })

  it('reports a browser that cannot draw', async () => {
    const listener = recorder()
    const handle = await runMeasure(environmentWith(new FakeSession(), {}, { createShader: () => null }), byHead, listener)
    expect(handle).toBeNull()
    expect(listener.outcomes).toEqual([{ kind: 'failed', reason: 'renderer-unavailable' }])
  })

  it('reads controllers without a gamepad as pressing nothing', async () => {
    const session = new FakeSession()
    const listener = recorder()
    await runMeasure(environmentWith(session), byController, listener)
    session.inputSources = [{ handedness: 'none', gamepad: null }, { handedness: 'left' }]
    session.frame(identity)
    session.frame(identity)
    expect(listener.updates).toHaveLength(1)
  })
})
