/**
 * The rendered ceiling: how far the headset draws its picture in each direction, the most anyone
 * could see. The compare pages draw it as marks on each edge (left, right, up, down).
 *
 * A FOV Atlas measure carries each eye's edges, read from the browser. A VR Headset Picker link
 * and the hmdq HMD Geometry Database (`src/data/hmdgdb.ts`) carry binocular totals only: the outer
 * edge of each eye is then half the total width and the inner edge half the overlap, taking both
 * eyes as mirror images, and the split between up and down is unknown, so neither is drawn.
 *
 * The corner mask some headsets apply hides corners, never these edges, so the edges are the same
 * full frame or masked; only the diagonal differs, and it is labelled with the variant it is.
 */

import { borrowedReferenceLabel, referenceConfigurationOf } from './headsets.ts'
import type { EyeMeasure, EyeMeasures, Submission } from './submission.ts'

type CeilingSource = 'measured' | 'link' | 'model'

export interface CeilingEdges {
  readonly source: CeilingSource
  readonly edges: EyeMeasures
}

function mirroredEdges(horizontal: number, overlap: number): EyeMeasures {
  const outer = horizontal / 2
  const inner = overlap / 2
  return { left: { left: outer, right: inner }, right: { left: inner, right: outer } }
}

/** The model's reference edges from its hmdgdb configuration, when it has a single one. */
export function modelCeiling(headset: string): CeilingEdges | undefined {
  const reference = referenceConfigurationOf(headset)
  return reference === undefined ? undefined : { source: 'model', edges: mirroredEdges(reference.horizontal, reference.overlap) }
}

/** A measure's own ceiling when it carries one, the model's reference otherwise. */
export function measureCeiling(submission: Submission): CeilingEdges | undefined {
  const { ceiling } = submission
  if (ceiling.source === 'measured') {
    const eye = (edges: typeof ceiling.left): EyeMeasure => ({ left: edges.left, right: edges.right, up: edges.up, down: edges.down })
    return { source: 'measured', edges: { left: eye(ceiling.left), right: eye(ceiling.right) } }
  }
  if (ceiling.source === 'link') {
    return { source: 'link', edges: mirroredEdges(ceiling.totals.binocularHorizontal, ceiling.totals.binocularHorizontalOverlap) }
  }
  return modelCeiling(submission.headset)
}

/** Where a measure's ceiling comes from, and which corner variant applies to its diagonal. */
export function ceilingWords(submission: Submission): string {
  if (submission.ceiling.source === 'measured') return 'Read while measuring'
  if (submission.ceiling.source === 'link') return 'From the tool’s link'
  if (referenceConfigurationOf(submission.headset) === undefined) return 'No model reference'
  const borrowed = borrowedReferenceLabel(submission.headset)
  const reference = borrowed === undefined ? 'Model reference' : `Model reference ${borrowed}`
  return `${reference}, ${submission.cornerMask === 'on' ? 'with corner mask' : 'full frame'}`
}

export function cornerMaskWords(submission: Submission): string {
  if (submission.cornerMask === 'on') return 'corner mask detected'
  if (submission.cornerMask === 'off-probably') return 'corner mask probably off'
  return submission.tool === 'atlas' ? 'corner mask not reported' : 'corner mask unknown'
}
