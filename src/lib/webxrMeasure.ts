/**
 * The thin part of the measure that touches WebXR: opening the session, reading each frame's
 * poses, views, controller buttons and key presses, and drawing. Every decision is made by the
 * pure modules (`renderedViews.ts`, `measureFlow.ts`, `measureSession.ts`, `answerTargets.ts`,
 * `measureScene.ts`); this only feeds them.
 *
 * Only the few members used are described here, so tests can stand in for the browser and the
 * page needs no WebXR type package. The session asks for nothing beyond what an immersive session
 * always has: no camera, no room layout, no hand data.
 */

import { ButtonPresses, keyCommand, readyFill, type AnswerMode, type Command, type ControllerLike } from './answerTargets.ts'
import { quaternionOf, type DomQuaternion, type Quaternion } from './headFrame.ts'
import { noPressArrived, startFlow, stepFlow, type FlowState, type Stage } from './measureFlow.ts'
import { MeasureScene, messageCorners } from './measureScene.ts'
import {
  currentProbe,
  isComplete,
  isFinished,
  measureSteps,
  measuresOf,
  progressCount,
  startMeasure,
  type AtlasMeasure,
  type DirectionChoice,
} from './measureSession.ts'
import { readRenderedViews, relativeOrientation, type Eye, type RenderedReadResult } from './renderedViews.ts'
import { clipMatrix, createSceneRenderer, type Viewport } from './sceneRenderer.ts'
import type { Ceiling, CornerMask } from './submission.ts'

export interface XrTransformLike {
  readonly orientation: DomQuaternion
}
export interface XrViewLike {
  readonly eye: string
  readonly projectionMatrix: ArrayLike<number>
  readonly transform: XrTransformLike
}
export interface XrViewerPoseLike {
  readonly transform: XrTransformLike
  readonly views: readonly XrViewLike[]
}
export type XrReferenceSpaceLike = object
export interface XrFrameLike {
  getViewerPose(space: XrReferenceSpaceLike): XrViewerPoseLike | null | undefined
}
export type XrInputSourceLike = ControllerLike
export interface XrLayerLike {
  readonly framebuffer: WebGLFramebuffer | null
  readonly framebufferWidth: number
  readonly framebufferHeight: number
  getViewport(view: XrViewLike): Viewport | null | undefined
}
export interface XrSessionLike {
  readonly visibilityState: string
  readonly inputSources: Iterable<XrInputSourceLike>
  requestReferenceSpace(type: 'local'): Promise<XrReferenceSpaceLike>
  updateRenderState(state: { readonly baseLayer: XrLayerLike }): void
  requestAnimationFrame(callback: (time: number, frame: XrFrameLike) => void): number
  end(): Promise<void>
  addEventListener(type: 'end' | 'visibilitymaskchange', listener: (event: unknown) => void): void
}
export interface XrSystemLike {
  isSessionSupported(mode: 'immersive-vr'): Promise<boolean>
  requestSession(mode: 'immersive-vr', init: { readonly requiredFeatures: readonly string[] }): Promise<XrSessionLike>
}

/** A picture of some text, and how many times wider than high it is. */
export interface TextPicture {
  readonly image: TexImageSource
  readonly aspect: number
}

/** What the page hands over: the browser's WebXR, a WebGL context made for it, and the page's keyboard. */
export interface MeasureEnvironment {
  readonly xr: XrSystemLike
  readonly gl: WebGLRenderingContext
  createLayer(session: XrSessionLike, gl: WebGLRenderingContext): XrLayerLike
  /** Hands the `key` of every key pressed on the page to `listener`, until the returned function is called. */
  listenForKeys(listener: (key: string) => void): () => void
  /** A picture of these lines of text, to show in the headset, or null when the browser can't make one. */
  textPicture(lines: readonly string[]): TextPicture | null
}

export type Availability = 'available' | 'no-webxr' | 'no-headset'

/** Whether this browser can open a headset session; a browser that refuses to say counts as having none. */
export async function measureAvailability(xr: XrSystemLike | undefined): Promise<Availability> {
  if (xr === undefined) return 'no-webxr'
  try {
    return (await xr.isSessionSupported('immersive-vr')) ? 'available' : 'no-headset'
  } catch {
    return 'no-headset'
  }
}

/**
 * Whether a `visibilitymaskchange` event carries a mask: a list of triangles hiding part of an
 * eye's picture. An event with no triangles means nothing is hidden.
 */
export function reportsCornerMask(event: unknown): boolean {
  if (typeof event !== 'object' || event === null || !('indices' in event)) return false
  const { indices } = event
  return typeof indices === 'object' && indices !== null && 'length' in indices && typeof indices.length === 'number' && indices.length >= 3
}

export type MeasureFailure =
  | 'session-refused'
  | 'renderer-unavailable'
  /** A required direction's answers never settled. */
  | 'edges-unsettled'
  | Extract<RenderedReadResult, { ok: false }>['error']

export type MeasureOutcome =
  | { readonly kind: 'measured'; readonly measure: AtlasMeasure }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'failed'; readonly reason: MeasureFailure }

export interface MeasureUpdate {
  readonly stage: Stage
  /** The answer mode in use, which the wearer may switch to head pointing from inside the headset. */
  readonly mode: AnswerMode
  readonly done: number
  readonly total: number
  readonly eye: Eye | null
  /** True once a while has passed in keyboard or controller mode with no press reaching the page. */
  readonly noPressArrived: boolean
}

export interface MeasureListener {
  progress(update: MeasureUpdate): void
  finished(outcome: MeasureOutcome): void
}

export interface MeasureHandle {
  /** Ends the session; a measure not finished yet is dropped. */
  stop(): void
}

export interface MeasureOptions {
  readonly choice: DirectionChoice
  readonly mode: AnswerMode
}

/** A long pause between frames (the headset taken off) must not count as holding still or holding a target. */
const longestFrameSeconds = 0.1

/** What the headset shows above the dot while the wearer gets ready. */
type MessageName = AnswerMode | 'no-press'
export const headsetMessages: ReadonlyMap<MessageName, readonly string[]> = new Map<MessageName, readonly string[]>([
  ['head', ['Look around a little, then look at the dot', 'and hold still until its ring fills.']],
  ['controller', ['Look at the dot, then press the trigger.']],
  ['keyboard', ['Look at the dot, then press Enter.']],
  ['no-press', ['No press has reached this page.', 'To answer with your head instead,', 'look at the arrow below and hold.']],
])

interface Running {
  flow: FlowState
  ceiling: Ceiling
  lastTime: number | null
}

/** Opens the headset session and runs the measure; the listener hears how it goes and how it ends. */
export async function runMeasure(
  environment: MeasureEnvironment,
  { choice, mode }: MeasureOptions,
  listener: MeasureListener,
): Promise<MeasureHandle | null> {
  const renderer = createSceneRenderer(environment.gl)
  if (renderer === null) {
    listener.finished({ kind: 'failed', reason: 'renderer-unavailable' })
    return null
  }
  let session: XrSessionLike
  try {
    session = await environment.xr.requestSession('immersive-vr', { requiredFeatures: ['local'] })
  } catch {
    renderer.dispose()
    listener.finished({ kind: 'failed', reason: 'session-refused' })
    return null
  }

  let ended = false
  // Read through a function: the session's end event can set it while setup awaits.
  const isEnded = (): boolean => ended
  let cornerMask: CornerMask = 'unknown'
  let stopKeys = (): void => undefined
  const finish = (outcome: MeasureOutcome): void => {
    if (ended) return
    ended = true
    stopKeys()
    renderer.dispose()
    listener.finished(outcome)
    session.end().catch(() => undefined)
  }
  // Listening from the start: the session can end, and report its mask, while it is still being set up.
  session.addEventListener('end', () => {
    finish({ kind: 'stopped' })
  })
  session.addEventListener('visibilitymaskchange', (event) => {
    if (reportsCornerMask(event)) cornerMask = 'on'
  })

  let layer: XrLayerLike
  let space: XrReferenceSpaceLike
  try {
    layer = environment.createLayer(session, environment.gl)
    session.updateRenderState({ baseLayer: layer })
    space = await session.requestReferenceSpace('local')
  } catch {
    finish({ kind: 'failed', reason: 'session-refused' })
    return null
  }
  if (isEnded()) return null

  const pendingCommands: Command[] = []
  let keyPressed = false
  if (mode === 'keyboard') {
    stopKeys = environment.listenForKeys((key) => {
      keyPressed = true
      const command = keyCommand(key)
      if (command !== null) pendingCommands.push(command)
    })
  }
  const buttons = new ButtonPresses()
  const scene = new MeasureScene()
  const pictures = new Map<MessageName, { readonly picture: TextPicture; readonly corners: Float32Array } | null>()
  const pictureOf = (name: MessageName) => {
    if (!pictures.has(name)) {
      const picture = environment.textPicture(headsetMessages.get(name) ?? [])
      pictures.set(name, picture === null ? null : { picture, corners: messageCorners(picture.aspect) })
    }
    return pictures.get(name) ?? null
  }
  const headMatrix = new Float32Array(16)
  const roomMatrix = new Float32Array(16)
  let running: Running | null = null
  let reported: FlowState | null = null

  /** Tells the listener about every answer and every change of stage, mode or hint. */
  const report = (flow: FlowState): void => {
    const previous = reported
    reported = flow
    const unchanged =
      previous !== null &&
      previous.progress === flow.progress &&
      previous.stage === flow.stage &&
      previous.mode === flow.mode &&
      noPressArrived(previous) === noPressArrived(flow)
    if (unchanged) return
    listener.progress({
      stage: flow.stage,
      mode: flow.mode,
      ...progressCount(flow.progress),
      eye: flow.stage === 'asking' ? (currentProbe(flow.progress)?.eye ?? null) : null,
      noPressArrived: noPressArrived(flow),
    })
  }

  const start = (head: Quaternion, pose: XrViewerPoseLike): Running | null => {
    const read = readRenderedViews(
      pose.views.map((view) => ({
        eye: view.eye,
        projectionMatrix: view.projectionMatrix,
        orientation: relativeOrientation(head, quaternionOf(view.transform.orientation)),
      })),
    )
    if (!read.ok) {
      finish({ kind: 'failed', reason: read.error })
      return null
    }
    const flow = startFlow(startMeasure(measureSteps(choice, { left: read.left, right: read.right })), mode)
    report(flow)
    return { flow, ceiling: read.ceiling, lastTime: null }
  }

  const step = (state: Running, head: Quaternion, time: number): void => {
    const deltaSeconds = state.lastTime === null ? 0 : Math.min(longestFrameSeconds, Math.max(0, (time - state.lastTime) / 1000))
    state.lastTime = time
    if (mode === 'controller') buttons.read(session.inputSources, pendingCommands)
    const pressed = keyPressed
    keyPressed = false
    const before = state.flow
    // Presses made while the headset doesn't show the page are dropped: the wearer can't see what they answer.
    if (session.visibilityState === 'visible') state.flow = stepFlow(before, { head, deltaSeconds, commands: pendingCommands, keyPressed: pressed })
    pendingCommands.length = 0
    if (state.flow.targets !== before.targets) scene.placeTargets(state.flow.targets)
    report(state.flow)
  }

  const draw = (state: Running, head: Quaternion, pose: XrViewerPoseLike): void => {
    renderer.clear(layer.framebuffer, layer.framebufferWidth, layer.framebufferHeight)
    const { flow } = state
    const probe = flow.stage === 'asking' ? currentProbe(flow.progress) : null
    scene.showProbe(probe)
    scene.showReady(flow.stage === 'ready' && flow.mode === 'head' ? readyFill(flow.ready) : null)
    scene.showHold(flow.hold)
    const message = flow.stage === 'ready' ? pictureOf(noPressArrived(flow) ? 'no-press' : flow.mode) : null
    for (const view of pose.views) {
      const viewport = layer.getViewport(view)
      // While getting ready both eyes see the dot; once asking, only the eye being measured.
      if (viewport === null || viewport === undefined || (probe !== null && view.eye !== probe.eye)) continue
      const viewOrientation = quaternionOf(view.transform.orientation)
      clipMatrix(view.projectionMatrix, relativeOrientation(head, viewOrientation), headMatrix)
      clipMatrix(view.projectionMatrix, viewOrientation, roomMatrix)
      renderer.draw(viewport, headMatrix, scene.head)
      renderer.draw(viewport, headMatrix, scene.ready)
      renderer.draw(viewport, roomMatrix, scene.room)
      renderer.draw(viewport, roomMatrix, scene.fill)
      if (message !== null) renderer.drawPicture(viewport, headMatrix, message.picture.image, message.corners)
    }
  }

  const finishMeasure = (state: Running): void => {
    const results = measuresOf(state.flow.progress)
    if (results === null) return
    if (!isComplete(results)) {
      finish({ kind: 'failed', reason: 'edges-unsettled' })
      return
    }
    finish({ kind: 'measured', measure: { ...results, ceiling: state.ceiling, cornerMask } })
  }

  const onFrame = (time: number, frame: XrFrameLike): void => {
    if (ended) return
    session.requestAnimationFrame(onFrame)
    const pose = frame.getViewerPose(space)
    if (pose === null || pose === undefined) return
    const head = quaternionOf(pose.transform.orientation)
    running ??= start(head, pose)
    if (running === null) return
    step(running, head, time)
    if (isFinished(running.flow.progress)) {
      finishMeasure(running)
      return
    }
    draw(running, head, pose)
  }
  session.requestAnimationFrame(onFrame)

  return {
    stop() {
      finish({ kind: 'stopped' })
    },
  }
}
