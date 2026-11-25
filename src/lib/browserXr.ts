/**
 * The browser's own WebXR objects, described by the few members `webxrMeasure.ts` uses, and the
 * page's keyboard and text drawing it needs. The TypeScript DOM library doesn't describe WebXR, so
 * they are looked up here, once.
 */

import type { MeasureEnvironment, TextPicture, XrLayerLike, XrSessionLike, XrSystemLike } from './webxrMeasure.ts'

type LayerConstructor = new (session: XrSessionLike, gl: WebGLRenderingContext) => XrLayerLike

export function browserXr(): XrSystemLike | undefined {
  return (navigator as Navigator & { readonly xr?: XrSystemLike }).xr
}

/** Keys the measure answers with, whose own effect on the page (scrolling, a click) is held back. */
const answerKeys = new Set(['Enter', ' ', 'Backspace'])

function listenForKeys(listener: (key: string) => void): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (answerKeys.has(event.key)) event.preventDefault()
    // A key held down repeats; only the first press counts.
    if (!event.repeat) listener(event.key)
  }
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('keydown', onKey)
  }
}

const textLook = { lineHeight: 64, font: '44px system-ui, sans-serif', width: 1024 } as const

/** White text on black, centred line by line, drawn on a canvas the headset shows as a picture. */
function textPicture(lines: readonly string[]): TextPicture | null {
  const canvas = document.createElement('canvas')
  canvas.width = textLook.width
  canvas.height = textLook.lineHeight * (lines.length + 1)
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#fff'
  context.font = textLook.font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  lines.forEach((text, lineIndex) => {
    context.fillText(text, canvas.width / 2, textLook.lineHeight * (lineIndex + 1))
  })
  return { image: canvas, aspect: canvas.width / canvas.height }
}

/** WebXR and a WebGL context on `canvas` made for it, or null when the browser offers either not. */
export function browserMeasureEnvironment(canvas: HTMLCanvasElement): MeasureEnvironment | null {
  const xr = browserXr()
  const Layer = (window as Window & { readonly XRWebGLLayer?: LayerConstructor }).XRWebGLLayer
  const gl = canvas.getContext('webgl', { xrCompatible: true })
  if (xr === undefined || Layer === undefined || gl === null) return null
  return { xr, gl, createLayer: (session, context) => new Layer(session, context), listenForKeys, textPicture }
}
