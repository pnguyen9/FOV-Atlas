/**
 * The site refuses to run inside a frame. A meta CSP can't set frame-ancestors, and a framing page
 * could otherwise grant itself xr-spatial-tracking and trick a visitor into starting a VR session.
 */
export interface WindowFrameView {
  readonly self: object
  readonly top: object | null
}

/** `top` is one of the few properties readable across origins, so this never throws. */
export function isFramed(currentWindow: WindowFrameView): boolean {
  return currentWindow.top !== currentWindow.self
}
