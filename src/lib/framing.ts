/**
 * The site refuses to run inside a frame. A meta CSP can't set frame-ancestors, and a framing page
 * could otherwise grant itself xr-spatial-tracking and trick a visitor into starting a VR session.
 */
export interface WindowFrameView {
  readonly self: object
  readonly top: object | null
}

export function isFramed(currentWindow: WindowFrameView): boolean {
  try {
    return currentWindow.top !== currentWindow.self
  } catch {
    // Reading top across origins throws, which itself means a foreign frame.
    return true
  }
}
