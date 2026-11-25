/**
 * The rendered field of view: what the headset a measure was taken with reports it draws, the
 * most anyone could see with it. Each measure is only ever set against its own headset's report,
 * in its own tool's convention.
 *
 * Only FOV Atlas reads each eye's edges, so only its measures get an outline of their own on the
 * radar. A VR Headset Picker link carries per-eye and both-eye totals, which the figures compare
 * (see `figuresOf` in `submissionStore.ts`). On the radar, groups of FOV Atlas, VR Headset
 * Picker and TestHMD measures are outlined with their model's averaged pictures
 * (`renderedAverage.ts`). WIMFOV has its own standard and gets none.
 *
 * The corner mask some headsets apply hides corners, never these edges, so the outline is that of
 * the full picture.
 */

import type { EdgeAngles, Submission, Tool } from './submission.ts'

/** Both eyes' edges and how far each eye's picture is turned outward. */
export interface RenderedFrame {
  readonly left: EdgeAngles
  readonly right: EdgeAngles
  readonly turn: number
}

/** Whether the radar draws a rendered outline for the tool's measures or groups: every tool following hmdq's definition. */
export const drawsRenderedOutline = (tool: Tool): boolean => tool !== 'wimfov'

export function renderedFrameOf({ ceiling }: Pick<Submission, 'ceiling'>): RenderedFrame | undefined {
  return ceiling.source === 'measured' ? { left: ceiling.left, right: ceiling.right, turn: ceiling.canting } : undefined
}

/** A point of an outline, in the radar's terms: its turn from up toward the wearer's left, and its angle from straight ahead. */
export interface OutlinePoint {
  readonly turn: number
  readonly degrees: number
}

export const radians = (degrees: number): number => (degrees * Math.PI) / 180
export const degreesOf = (angle: number): number => (angle * 180) / Math.PI
/** Hundredths of a degree, the finest step stored. */
export const roundCenti = (degrees: number): number => Math.round(degrees * 100) / 100
const pointsPerSide = 16

/**
 * An angle up or down from straight ahead of the head, turned into the same angle from the centre
 * of a picture turned outward by `turn`. Straight ahead meets the picture `turn` off its centre,
 * further from the eye, so the same edge sits at a smaller angle there.
 */
export const pictureVertical = (headDegrees: number, turn: number): number =>
  degreesOf(Math.atan(Math.tan(radians(headDegrees)) / Math.cos(radians(turn))))

/** The outer and inner edges of one eye's picture, measured across the picture itself. */
function sideExtents(edges: EdgeAngles, turn: number, eye: 'left' | 'right'): { readonly outer: number; readonly inner: number } {
  const [outer, inner] = eye === 'left' ? [edges.left, edges.right] : [edges.right, edges.left]
  return { outer: outer - turn, inner: inner + turn }
}

/**
 * Whether the edges, read from straight ahead of the head with the picture turned outward by
 * `turn`, can bound a flat picture: each edge less than a quarter turn from the picture's centre.
 */
export function isFlatPicture(edges: EdgeAngles, turn: number, eye: 'left' | 'right'): boolean {
  const { outer, inner } = sideExtents(edges, turn, eye)
  return [outer, inner, edges.up, edges.down].every((angle) => angle > -90 && angle < 90)
}

/**
 * The border of one eye's picture as seen from that eye. A headset draws each eye's picture flat,
 * so its border is a rectangle on a plane in front of the eye, turned outward by `turn`; the
 * radar's projection then bends its sides. The stored edges are angles from straight ahead of the
 * head along each principal direction, which this turns back into the picture's own extents.
 * Null when the edges describe no flat picture.
 */
export function pictureOutline(edges: EdgeAngles, turn: number, eye: 'left' | 'right'): OutlinePoint[] | null {
  if (!isFlatPicture(edges, turn, eye)) return null
  const turned = radians(turn)
  const { outer: outerExtent, inner: innerExtent } = sideExtents(edges, turn, eye)
  const top = Math.tan(radians(pictureVertical(edges.up, turn)))
  const bottom = -Math.tan(radians(pictureVertical(edges.down, turn)))
  const outerSide = Math.tan(radians(outerExtent))
  const innerSide = Math.tan(radians(innerExtent))
  const [leftSide, rightSide] = eye === 'left' ? [-outerSide, innerSide] : [-innerSide, outerSide]
  if (leftSide >= rightSide || bottom >= top) return null

  // The picture's own right and forward directions in the head frame, as parts to the wearer's
  // right and straight ahead; up is the same for the picture and the head.
  const outward = eye === 'left' ? -1 : 1
  const right = { sideways: Math.cos(turned), ahead: -outward * Math.sin(turned) }
  const forward = { sideways: outward * Math.sin(turned), ahead: Math.cos(turned) }
  const corners = [
    [leftSide, top],
    [leftSide, bottom],
    [rightSide, bottom],
    [rightSide, top],
  ] as const
  return corners.flatMap(([startX, startY], cornerIndex) => {
    const [endX, endY] = corners[(cornerIndex + 1) % corners.length] ?? corners[0]
    return Array.from({ length: pointsPerSide }, (_, step) => {
      const fraction = step / pointsPerSide
      const pictureX = startX + (endX - startX) * fraction
      const pictureY = startY + (endY - startY) * fraction
      const headX = pictureX * right.sideways + forward.sideways
      const headZ = pictureX * right.ahead + forward.ahead
      return {
        turn: Math.atan2(-headX, pictureY),
        degrees: degreesOf(Math.atan2(Math.hypot(headX, pictureY), headZ)),
      }
    })
  })
}

/** Where a measure's rendered field of view comes from, for the list of measures. */
export function ceilingWords(submission: Submission): string {
  if (submission.ceiling.source === 'measured') return 'Read while measuring'
  if (submission.ceiling.source === 'link') return 'From the tool’s link'
  return 'Not reported'
}

export function cornerMaskWords(submission: Submission): string {
  if (submission.cornerMask === 'on') return 'corner mask detected'
  return submission.tool === 'atlas' ? 'corner mask not reported' : 'corner mask unknown'
}
