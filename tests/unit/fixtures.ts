/** Test data shared by the submission pipeline tests. */

import type { Submission } from '../../src/lib/submission'

export interface PayloadParts {
  version?: number
  flags?: number
  angles?: number[]
  totals?: number[]
  trailingText?: string
  trailingBytes?: number[]
}

// A real Bigscreen Beyond 2 measure and its rendered totals.
export const beyondAngles = [55.0, 42.0, 43.0, 53.9, 59.0, 41.5, 54.3, 44.2, 52.5, 52.0]
export const beyondTotals = [96.95, 96.93, 96.62, 96.67, 109.24, 84.33, 98.06, 95.54, 122.66]

export function encodeVrhpPayload({
  version = 4,
  flags = 0,
  angles = beyondAngles,
  totals = beyondTotals,
  trailingText = 'Bigscreen Beyond 2',
  trailingBytes,
}: PayloadParts = {}): string {
  const text = trailingBytes === undefined ? new TextEncoder().encode(trailingText) : Uint8Array.from(trailingBytes)
  const bytes = new Uint8Array(2 + angles.length * 2 + totals.length * 2 + text.length)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, version)
  view.setUint8(1, flags)
  angles.forEach((degrees, angleIndex) => { view.setInt16(2 + angleIndex * 2, Math.round(degrees * 100), true) })
  const totalsOffset = 2 + angles.length * 2
  totals.forEach((degrees, totalIndex) => { view.setUint16(totalsOffset + totalIndex * 2, Math.round(degrees * 100), true) })
  bytes.set(text, totalsOffset + totals.length * 2)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** The first 16 values of a WIMFOV eye, in WIMFOV's raw order. */
export const wimfovLeftRaw = [38, 50, 50, 40, 44, 51, 46, 36, 41, 47, 51, 51, 48, 43, 38, 37]
export const wimfovRightRaw = [39, 41, 50, 49, 38, 46, 51, 43, 37, 39, 43, 49, 51, 50, 46, 40]
export const wimfovPoints = `${wimfovLeftRaw.join(',')}|${wimfovRightRaw.join(',')}`
export const wimfovResultId = 'b09b0749'

/** A WIMFOV result page, cut down to the parts the parser reads. */
export function wimfovPage(data = `{"created":"2024-05-26 23:11:26","points":"${wimfovPoints}","ipd":"6200","model":"Beyond","sid":"${wimfovResultId}","note":"QmV5b25k"}`): string {
  return `<html><body><div id="container"></div><script>
    let out = JSON.parse('${data}');
    let points = out.points.indexOf('|') >= 0 ? out.points.split('|') : out.points;
  </script></body></html>`
}

const atlasEye = {
  'up': 42.7, 'up-left': 55.1, 'left': 54.6, 'down-left': 60.4, 'down': 53.1, 'down-right': 47.2, 'right': 41.6, 'up-right': 40.3,
}

/** A measure made with FOV Atlas, with the frustum read from the browser. */
export const atlasSubmission: Submission = {
  tool: 'atlas',
  headset: 'bigscreen-beyond-2',
  measures: { left: atlasEye, right: { ...atlasEye, 'left': 41.2, 'right': 53.8 } },
  ceiling: {
    source: 'measured',
    left: { left: 55, right: 42, up: 44.2, down: 54 },
    right: { left: 42, right: 55, up: 44.2, down: 54 },
    canting: 0,
  },
  cornerMask: 'on',
  provenance: { input: 'measured', linkData: null },
  reportedHeadset: '',
  face: { eyeDepth: 'in-between', noseBridge: 'low' },
  tuning: { physicallyModded: false, driverTuned: true, details: 'Pimax Play wide mode' },
  gaze: 'fixed',
  ipd: 63.5,
  facialInterface: 'Stock cushion',
  note: 'Measured twice.\nSame result.',
}

export const testHmdSubmission: Submission = {
  ...atlasSubmission,
  tool: 'testhmd',
  measures: { left: { left: 52.25, up: 47.5, down: 47.5 }, right: { right: 52.25, up: 47.5, down: 47.5 } },
  ceiling: { source: 'model' },
  cornerMask: 'unknown',
  provenance: { input: 'typed', linkData: null },
}
