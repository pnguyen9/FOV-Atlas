import type { Component } from 'vue'
import App from './App.vue'
import FramedNotice from './FramedNotice.vue'
import { isFramed, type WindowFrameView } from './lib/framing'

/** Inside a frame only the notice is mounted, so nothing the app adds later can run there. */
export function rootComponent(currentWindow: WindowFrameView): Component {
  return isFramed(currentWindow) ? FramedNotice : App
}
