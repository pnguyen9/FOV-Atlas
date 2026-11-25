// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserMeasureEnvironment, browserXr } from '../../src/lib/browserXr'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function canvasWith(context: unknown): { canvas: HTMLCanvasElement; getContext: ReturnType<typeof vi.fn> } {
  const getContext = vi.fn(() => context)
  return { canvas: { getContext } as unknown as HTMLCanvasElement, getContext }
}

describe('browserXr', () => {
  it('finds nothing in a browser without WebXR', () => {
    expect(browserXr()).toBeUndefined()
    expect(browserMeasureEnvironment(canvasWith({}).canvas)).toBeNull()
  })

  it('joins the browser WebXR and a WebGL context made for it', () => {
    const xr = { isSessionSupported: vi.fn(), requestSession: vi.fn() }
    const FakeLayer = vi.fn()
    vi.stubGlobal('navigator', { xr })
    vi.stubGlobal('XRWebGLLayer', FakeLayer)
    const gl = {}
    const { canvas, getContext } = canvasWith(gl)
    const environment = browserMeasureEnvironment(canvas)
    expect(browserXr()).toBe(xr)
    expect(getContext).toHaveBeenCalledWith('webgl', { xrCompatible: true })
    expect(environment?.gl).toBe(gl)
    const session = {}
    expect(environment?.createLayer(session as never, gl as never)).toBeInstanceOf(FakeLayer)
    expect(FakeLayer).toHaveBeenCalledWith(session, gl)
  })

  it('finds nothing without a layer to draw into or a WebGL context', () => {
    vi.stubGlobal('navigator', { xr: {} })
    expect(browserMeasureEnvironment(canvasWith({}).canvas)).toBeNull()
    vi.stubGlobal('XRWebGLLayer', vi.fn())
    expect(browserMeasureEnvironment(canvasWith(null).canvas)).toBeNull()
  })
  it('hands key presses on the page over until told to stop, holding back their scrolling and repeats', () => {
    vi.stubGlobal('navigator', { xr: {} })
    vi.stubGlobal('XRWebGLLayer', vi.fn())
    const environment = browserMeasureEnvironment(canvasWith({}).canvas)
    const keys: string[] = []
    const stop = environment?.listenForKeys((key) => keys.push(key))
    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true })
    window.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true)
    const letter = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    window.dispatchEvent(letter)
    expect(letter.defaultPrevented).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }))
    stop?.()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(keys).toEqual([' ', 'a'])
  })

  it('draws lines of text as a picture for the headset, or none without a 2D context', () => {
    vi.stubGlobal('navigator', { xr: {} })
    vi.stubGlobal('XRWebGLLayer', vi.fn())
    const environment = browserMeasureEnvironment(canvasWith({}).canvas)
    const fillText = vi.fn()
    const context = { fillRect: vi.fn(), fillText }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const picture = environment?.textPicture(['Look at the dot', 'and hold still.'])
    expect(fillText).toHaveBeenCalledTimes(2)
    expect(picture?.aspect).toBeGreaterThan(1)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(environment?.textPicture(['x'])).toBeNull()
  })
})
