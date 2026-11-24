/** Test data shared by the submission pipeline tests. */

import type { Submission } from '../../src/lib/submission'

export interface PayloadParts {
  version?: number
  /** Computed from the sections given unless set. */
  flags?: number
  angles?: number[]
  /** Null leaves the totals section out. */
  totals?: number[] | null
  /** Null leaves the name section out. */
  name?: string | null
  /** Raw bytes for the name section, in place of `name`. */
  nameBytes?: number[]
  /** Null leaves the id section out. */
  id?: string | null
  /** Bytes appended after every section. */
  tail?: number[]
}

// A real Bigscreen Beyond 2 measure (signed as in the link: left and down negative) and its rendered totals.
export const beyondAngles = [-55.0, 42.0, 43.0, -53.9, -59.0, -41.5, 54.3, 44.2, -52.5, 52.0]
export const beyondTotals = [96.95, 96.93, 96.62, 96.67, 109.24, 84.33, 98.06, 95.54, 122.66]

const textSection = (bytes: Uint8Array): number[] => [bytes.length & 0xff, bytes.length >> 8, ...bytes]

/** A VR Headset Picker share payload, version 4, as base64url. */
export function encodeVrhpPayload({
  version = 4,
  flags,
  angles = beyondAngles,
  totals = beyondTotals,
  name = 'Bigscreen Beyond 2',
  nameBytes,
  id = 'bigscreen-beyond-2',
  tail = [],
}: PayloadParts = {}): string {
  const hasName = name !== null || nameBytes !== undefined
  const computedFlags = (totals === null ? 0 : 1) | (hasName ? 2 : 0) | (id === null ? 0 : 4)
  const numbers = new DataView(new ArrayBuffer(angles.length * 2 + (totals?.length ?? 0) * 2))
  angles.forEach((degrees, angleIndex) => { numbers.setInt16(angleIndex * 2, Math.round(degrees * 100), true) })
  totals?.forEach((degrees, totalIndex) => { numbers.setUint16((angles.length + totalIndex) * 2, Math.round(degrees * 100), true) })
  const encoder = new TextEncoder()
  const bytes = [
    version,
    flags ?? computedFlags,
    ...new Uint8Array(numbers.buffer),
    ...(hasName ? textSection(nameBytes === undefined ? encoder.encode(name ?? '') : Uint8Array.from(nameBytes)) : []),
    ...(id === null ? [] : textSection(encoder.encode(id))),
    ...tail,
  ]
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
  otherHeadsetName: '',
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
