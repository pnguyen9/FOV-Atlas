/** Stand-ins for a headset's views, shared by the WebXR measure tests. */

import { vi } from 'vitest'
import { targetLayout } from '../../src/lib/answerTargets'
import { radians } from '../../src/lib/ceiling'
import { identity, multiply, yawRotation, type DomQuaternion, type Quaternion } from '../../src/lib/headFrame'
import type { ViewReading, ViewTangents } from '../../src/lib/renderedViews'
import type { Viewport } from '../../src/lib/sceneRenderer'
import type {
  MeasureListener,
  MeasureOutcome,
  MeasureUpdate,
  XrFrameLike,
  XrInputSourceLike,
  XrLayerLike,
  TextPicture,
  XrSessionLike,
  XrSystemLike,
} from '../../src/lib/webxrMeasure'

/** A WebGL projection matrix (column-major) with the given tangents, as WebXR reports one. */
export function projectionOf({ left, right, down, up }: ViewTangents, near = 0.1, far = 1000): Float32Array {
  const matrix = new Float32Array(16)
  matrix[0] = 2 / (right - left)
  matrix[5] = 2 / (up - down)
  matrix[8] = (right + left) / (right - left)
  matrix[9] = (up + down) / (up - down)
  matrix[10] = -(far + near) / (far - near)
  matrix[11] = -1
  matrix[14] = (-2 * far * near) / (far - near)
  return matrix
}

/** Tangents of a picture reaching these angles from its own centre. */
export const tangentsOf = (outer: number, inner: number, up: number, down: number, eye: 'left' | 'right'): ViewTangents => {
  const [leftAngle, rightAngle] = eye === 'left' ? [outer, inner] : [inner, outer]
  return {
    left: -Math.tan(radians(leftAngle)),
    right: Math.tan(radians(rightAngle)),
    down: -Math.tan(radians(down)),
    up: Math.tan(radians(up)),
  }
}

/** A quaternion as WebXR hands it over, in a `DOMPointReadOnly`-like object. */
export function domPoint(rotation: Quaternion): DomQuaternion {
  const values = [rotation.vector.right, rotation.vector.up, rotation.vector.back, rotation.scalar]
  return Object.fromEntries(['x', 'y', 'z', 'w'].map((key, index) => [key, values.at(index)])) as unknown as DomQuaternion
}

/** The rotation of an eye's picture turned `turn` degrees away from the nose. */
export const outwardRotation = (eye: 'left' | 'right', turn: number): Quaternion => yawRotation(eye === 'left' ? turn : -turn)

export interface HeadsetShape {
  readonly outer: number
  readonly inner: number
  readonly up: number
  readonly down: number
  readonly turn: number
}

/** A Beyond-like headset: no turn, wider toward the ear. */
export const straightHeadset: HeadsetShape = { outer: 54.8, inner: 42, up: 44, down: 52.9, turn: 0 }
/** A wide headset whose pictures are turned outward. */
export const turnedHeadset: HeadsetShape = { outer: 50, inner: 45, up: 45, down: 45, turn: 10 }

export function readingsOf(shape: HeadsetShape): ViewReading[] {
  return (['left', 'right'] as const).map((eye) => ({
    eye,
    projectionMatrix: projectionOf(tangentsOf(shape.outer, shape.inner, shape.up, shape.down, eye)),
    orientation: outwardRotation(eye, shape.turn),
  }))
}

/** The views of one frame with the head turned by `head`, as WebXR gives them in the room's frame. */
export function frameViews(shape: HeadsetShape, head: Quaternion): { eye: string; projectionMatrix: Float32Array; transform: { orientation: DomQuaternion } }[] {
  return readingsOf(shape).map((reading) => ({
    eye: reading.eye,
    projectionMatrix: reading.projectionMatrix as Float32Array,
    transform: { orientation: domPoint(multiply(head, reading.orientation)) },
  }))
}

/** A WebGL context that records what is asked of it; any method not listed records its call and returns nothing. */
export function fakeGl(overrides: Record<string, unknown> = {}) {
  const calls: string[] = []
  const deleted: unknown[] = []
  const record = (name: string, result?: unknown) => () => {
    calls.push(name)
    return result
  }
  const created = (name: string) => () => {
    calls.push(name)
    return { name }
  }
  const remove = (name: string) => (resource: unknown) => {
    calls.push(name)
    deleted.push(resource)
  }
  const viewport = vi.fn(record('viewport'))
  const drawArrays = vi.fn(record('drawArrays'))
  const bufferData = vi.fn(record('bufferData'))
  const texImage2D = vi.fn(record('texImage2D'))
  const listed: Record<string, unknown> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    TRIANGLES: 11,
    createShader: created('createShader'),
    getShaderParameter: record('getShaderParameter', true),
    createProgram: created('createProgram'),
    getProgramParameter: record('getProgramParameter', true),
    createBuffer: created('createBuffer'),
    createTexture: created('createTexture'),
    getUniformLocation: record('getUniformLocation', {}),
    getAttribLocation: record('getAttribLocation', 0),
    deleteShader: remove('deleteShader'),
    deleteProgram: remove('deleteProgram'),
    deleteBuffer: remove('deleteBuffer'),
    deleteTexture: remove('deleteTexture'),
    viewport,
    drawArrays,
    bufferData,
    texImage2D,
    ...overrides,
  }
  const members = new Map(Object.entries(listed))
  const gl = new Proxy(listed, {
    get(_, name) {
      if (typeof name !== 'string') return undefined
      if (members.has(name)) return members.get(name)
      // Constants are upper case: any distinct number does for a stand-in.
      return /^[A-Z]/.test(name) ? 100 + name.length : record(name)
    },
  })
  return { gl: gl as unknown as WebGLRenderingContext, calls, deleted, viewport, drawArrays, bufferData, texImage2D }
}

export function headTurned(yaw: number, pitch: number): Quaternion {
  const half = radians(pitch) / 2
  return multiply(yawRotation(yaw), { vector: { right: Math.sin(half), up: 0, back: 0 }, scalar: Math.cos(half) })
}
/** Where the head points to look at Yes or No, once ready while facing straight ahead. */
export const onYes = headTurned(targetLayout.sideways, -targetLayout.below)
export const onNo = headTurned(-targetLayout.sideways, -targetLayout.below)
export const onBack = headTurned(0, -targetLayout.backBelow)
/** Where the head points to look at the offer of head pointing, made while facing straight ahead. */
export const onHeadPointing = headTurned(0, -targetLayout.below)

type FrameCallback = (time: number, frame: XrFrameLike) => void

/** A headset session driven frame by frame. */
export class FakeSession implements XrSessionLike {
  visibilityState = 'visible'
  inputSources: XrInputSourceLike[] = []
  renderState: unknown = null
  endCalls = 0
  private callbacks: FrameCallback[] = []
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()
  private time = 0

  private readonly shape: HeadsetShape

  constructor(shape: HeadsetShape = straightHeadset) {
    this.shape = shape
  }

  requestReferenceSpace(): Promise<object> {
    return Promise.resolve({})
  }
  updateRenderState(state: { readonly baseLayer: XrLayerLike }): void {
    this.renderState = state
  }
  requestAnimationFrame(callback: FrameCallback): number {
    this.callbacks.push(callback)
    return this.callbacks.length
  }
  end(): Promise<void> {
    this.endCalls += 1
    this.dispatch('end', {})
    return this.endCalls > 1 ? Promise.reject(new Error('already ended')) : Promise.resolve()
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  /** Runs one frame with the head turned by `head`, `seconds` after the last one. */
  frame(head: Quaternion, { seconds = 0.1, views = frameViews(this.shape, head) }: { seconds?: number; views?: unknown[] | null } = {}): void {
    this.time += seconds * 1000
    const callbacks = this.callbacks
    this.callbacks = []
    const pose = views === null ? null : { transform: { orientation: domPoint(head) }, views }
    for (const callback of callbacks) callback(this.time, { getViewerPose: () => pose } as XrFrameLike)
  }

  press(buttons: number[]): void {
    this.inputSources = [
      { handedness: 'right', gamepad: { buttons: Array.from({ length: 6 }, (_, button) => ({ pressed: buttons.includes(button) })) } },
    ]
  }

  get waiting(): number {
    return this.callbacks.length
  }
}

export function recorder(): MeasureListener & { updates: MeasureUpdate[]; outcomes: MeasureOutcome[] } {
  const updates: MeasureUpdate[] = []
  const outcomes: MeasureOutcome[] = []
  return {
    updates,
    outcomes,
    progress: (update) => updates.push(update),
    finished: (outcome) => outcomes.push(outcome),
  }
}

/** A WebXR viewport: where one eye's picture sits on the layer. */
export const viewportAt = (across: number, upward: number, width: number, height: number): Viewport =>
  Object.fromEntries([
    ['x', across],
    ['y', upward],
    ['width', width],
    ['height', height],
  ]) as unknown as Viewport

export function environmentWith(session: FakeSession, overrides: Partial<XrSystemLike> = {}, glOverrides: Record<string, unknown> = {}) {
  const fake = fakeGl(glOverrides)
  const layer: XrLayerLike = {
    framebuffer: null,
    framebufferWidth: 2000,
    framebufferHeight: 1000,
    getViewport: (view) => (view.eye === 'left' ? viewportAt(0, 0, 1000, 1000) : viewportAt(1000, 0, 1000, 1000)),
  }
  const xr: XrSystemLike = {
    isSessionSupported: () => Promise.resolve(true),
    requestSession: () => Promise.resolve(session),
    ...overrides,
  }
  const keyListeners = new Set<(key: string) => void>()
  const textPicture = vi.fn((lines: readonly string[]): TextPicture | null => ({ image: { lines } as unknown as TexImageSource, aspect: 4 }))
  return {
    xr,
    gl: fake.gl,
    createLayer: (): XrLayerLike => layer,
    listenForKeys(listener: (key: string) => void): () => void {
      keyListeners.add(listener)
      return () => keyListeners.delete(listener)
    },
    textPicture,
    /** Presses a key on the page. */
    pressKey(key: string): void {
      for (const listener of keyListeners) listener(key)
    },
    keyListeners,
    fake,
    viewport: fake.viewport,
    drawArrays: fake.drawArrays,
  }
}

/** Gets ready with the head: a look around, then the head held still straight ahead. */
export function readyByHead(session: FakeSession): void {
  session.frame(headTurned(5, 0))
  for (let frame = 0; frame < 16; frame += 1) session.frame(identity)
}

/** Answers with the head: held on a target until its ring fills, then back to the dot. */
export function answerByHead(session: FakeSession, head: Quaternion): void {
  for (let frame = 0; frame < 10; frame += 1) session.frame(head)
  session.frame(identity)
}

/** Presses one controller button for a frame, then lets it go. */
export function pressButton(session: FakeSession, button: number): void {
  session.press([button])
  session.frame(identity)
  session.press([])
  session.frame(identity)
}
