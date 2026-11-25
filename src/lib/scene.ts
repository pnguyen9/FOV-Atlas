/**
 * The "what you see" scenes, drawn in the radar's own projection (the distance from the centre is
 * the angle from straight ahead), so a measured shape cuts a window into the scene with no
 * conversion. Straight edges come out curved, as in a fisheye picture.
 *
 * A scene is either a 3D sketch around the viewer or a 360° photo already turned into the radar's
 * projection by `scripts/reproject-scene.py`. Sketch points are in metres: across to the right,
 * height up, depth straight ahead, with the eyes at the origin. Shapes are listed back to front so
 * later ones paint over earlier ones.
 */

import { degreesOf } from './ceiling.ts'
import type { RadialScale } from './radarGeometry.ts'

export type Point3 = readonly [across: number, height: number, depth: number]

interface Polygon {
  readonly kind: 'polygon'
  readonly points: readonly Point3[]
  readonly fill: string
  readonly outline?: Outline
}

interface Segment {
  readonly kind: 'segment'
  readonly start: Point3
  readonly end: Point3
  readonly stroke: string
  readonly strokeWidth: number
  readonly strokeOpacity: number
}

type Item = Polygon | Segment

/** A shape ready for the SVG: a path and the paint it is drawn with. */
export interface SceneShape {
  readonly path: string
  readonly fill: string
  readonly stroke?: string
  readonly strokeWidth?: number
  readonly strokeOpacity?: number
}

interface SceneBase {
  readonly name: string
  /** Painted first, and all there is of a photo scene while its image loads. */
  readonly sky: readonly [top: string, bottom: string]
  readonly ground: string
}

export interface SketchScene extends SceneBase {
  readonly kind: 'sketch'
  readonly items: () => Item[]
}

export interface PhotoScene extends SceneBase {
  readonly kind: 'photo'
  /** A photo in the radar's projection, served from `public/`, its disc reaching `photoLimitDegrees`. */
  readonly photo: string
}

export type Scene = SketchScene | PhotoScene

/** The angle from straight ahead at the edge of a photo scene's disc: straight behind. */
export const photoLimitDegrees = 180

/**
 * Shapes are cut at this angle from straight ahead. The projection reaches straight behind, but
 * there every direction around the centre meets in one point, so a shape crossing it would smear
 * across the chart; the cut sits just short of it.
 */
export const viewLimitDegrees = 179
/** Edges are split into steps of at most this many degrees, to follow their curve. */
const stepDegrees = 1.5
const maximumSteps = 120
/** Halvings when searching where an edge crosses the limit: far finer than a drawn pixel. */
const cutSearchSteps = 24

const length3 = (point: Point3): number => Math.hypot(...point)
const between = (start: Point3, end: Point3, ratio: number): Point3 => [
  start[0] + (end[0] - start[0]) * ratio,
  start[1] + (end[1] - start[1]) * ratio,
  start[2] + (end[2] - start[2]) * ratio,
]

/** The angle between a point's direction and straight ahead, in degrees. */
export function angleFromAhead(point: Point3): number {
  return degreesOf(Math.acos(Math.max(-1, Math.min(1, point[2] / length3(point)))))
}
const inView = (point: Point3): boolean => angleFromAhead(point) <= viewLimitDegrees

/** Where the edge from a point in view to one past the limit crosses it, found by halving. */
function limitCut(inside: Point3, outside: Point3): Point3 {
  let low = 0
  let high = 1
  for (let step = 0; step < cutSearchSteps; step += 1) {
    const middle = (low + high) / 2
    if (inView(between(inside, outside, middle))) low = middle
    else high = middle
  }
  return between(inside, outside, low)
}

/** The part of a polygon within the view limit. */
export function clipPolygon(points: readonly Point3[]): Point3[] {
  return points.flatMap((current, pointIndex) => {
    const next = points.at((pointIndex + 1) % points.length) ?? current
    const currentIn = inView(current)
    const kept: Point3[] = currentIn ? [current] : []
    if (currentIn !== inView(next)) kept.push(currentIn ? limitCut(current, next) : limitCut(next, current))
    return kept
  })
}

/** The part of a segment within the view limit, or null when it lies wholly past it. */
export function clipSegment(start: Point3, end: Point3): readonly [Point3, Point3] | null {
  const startIn = inView(start)
  const endIn = inView(end)
  if (!startIn && !endIn) return null
  return [startIn ? start : limitCut(end, start), endIn ? end : limitCut(start, end)]
}

/**
 * Where a point lands on the chart: as far from the centre as its angle from straight ahead.
 * Points an edge passes through beyond the limit are drawn at the limit.
 */
export function project(point: Point3, scale: RadialScale): readonly [number, number] {
  const around = Math.atan2(point[1], point[0])
  const distance = scale(Math.min(viewLimitDegrees, angleFromAhead(point)))
  return [Math.cos(around) * distance, -Math.sin(around) * distance]
}

function stepsBetween(start: Point3, end: Point3): number {
  const cosine = (start[0] * end[0] + start[1] * end[1] + start[2] * end[2]) / (length3(start) * length3(end))
  const degrees = degreesOf(Math.acos(Math.max(-1, Math.min(1, cosine))))
  return Math.min(maximumSteps, Math.max(1, Math.ceil(degrees / stepDegrees)))
}

/** The SVG path of a 3D outline, each edge split finely enough to follow its curve. */
export function scenePath(points: readonly Point3[], closed: boolean, scale: RadialScale): string {
  const edgeCount = closed ? points.length : points.length - 1
  const projected: (readonly [number, number])[] = []
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const start = points.at(edgeIndex) as Point3
    const end = points.at((edgeIndex + 1) % points.length) as Point3
    const steps = stepsBetween(start, end)
    for (let step = 0; step < steps; step += 1) projected.push(project(between(start, end, step / steps), scale))
  }
  if (!closed) projected.push(project(points.at(-1) as Point3, scale))
  const path = projected.map(([screenX, screenY]) => `${screenX.toFixed(1)},${screenY.toFixed(1)}`).join('L')
  return `M${path}${closed ? 'Z' : ''}`
}

interface Outline {
  readonly stroke: string
  readonly strokeWidth: number
}

const polygon = (points: readonly Point3[], fill: string, outline?: Outline): Polygon => ({
  kind: 'polygon',
  points,
  fill,
  ...(outline && { outline }),
})

const segment = (start: Point3, end: Point3, stroke: string, strokeWidth: number, strokeOpacity = 1): Segment => ({
  kind: 'segment',
  start,
  end,
  stroke,
  strokeWidth,
  strokeOpacity,
})

type Axis = 'across' | 'height' | 'depth'

/** The face of an axis-aligned box lying in the plane where `axis` equals `value`. */
function faceAt(axis: Axis, value: number, low: Point3, high: Point3): Point3[] {
  const [lowAcross, lowHeight, lowDepth] = low
  const [highAcross, highHeight, highDepth] = high
  if (axis === 'across') {
    return [[value, lowHeight, lowDepth], [value, highHeight, lowDepth], [value, highHeight, highDepth], [value, lowHeight, highDepth]]
  }
  if (axis === 'height') {
    return [[lowAcross, value, lowDepth], [highAcross, value, lowDepth], [highAcross, value, highDepth], [lowAcross, value, highDepth]]
  }
  return [[lowAcross, lowHeight, value], [highAcross, lowHeight, value], [highAcross, highHeight, value], [lowAcross, highHeight, value]]
}

interface BoxColours {
  readonly top: string
  readonly side: string
  readonly front: string
}

/** The faces of a box turned toward the viewer; those never overlap one another. */
function box(low: Point3, high: Point3, colours: BoxColours): Polygon[] {
  const sides = [
    { axis: 'across', low: low[0], high: high[0], nearColour: colours.side, farColour: colours.side },
    { axis: 'height', low: low[1], high: high[1], nearColour: colours.side, farColour: colours.top },
    { axis: 'depth', low: low[2], high: high[2], nearColour: colours.front, farColour: colours.front },
  ] as const
  return sides.flatMap((side) => {
    if (side.low > 0) return [polygon(faceAt(side.axis, side.low, low, high), side.nearColour)]
    return side.high < 0 ? [polygon(faceAt(side.axis, side.high, low, high), side.farColour)] : []
  })
}

/** A horizontal disc, such as a ceiling light. */
function flatDisc(centre: Point3, radius: number, fill: string): Polygon {
  const [across, height, depth] = centre
  const points = Array.from({ length: 24 }, (_, pointIndex): Point3 => {
    const angle = (pointIndex / 24) * 2 * Math.PI
    return [across + radius * Math.cos(angle), height, depth + radius * Math.sin(angle)]
  })
  return polygon(points, fill)
}

function gridVoid(): Item[] {
  const floor = -1.6
  const gridColour = '#2f6fd6'
  const gridOpacity = 0.7
  const blocks = { top: '#2a4a80', side: '#1a3060', front: '#21396d' }
  const items: Item[] = [polygon([[-300, floor, 0], [300, floor, 0], [300, floor, 300], [-300, floor, 300]], '#0a1222')]
  for (let across = -30; across <= 30; across += 1) {
    items.push(segment([across, floor, 0], [across, floor, 60], gridColour, across % 5 === 0 ? 1.3 : 0.7, gridOpacity))
  }
  for (let depth = 1; depth <= 60; depth += 1) {
    items.push(segment([-30, floor, depth], [30, floor, depth], gridColour, depth % 5 === 0 ? 1.3 : 0.7, gridOpacity))
  }
  items.push(...box([1.2, floor, 4], [2.2, floor + 1, 5], blocks), ...box([-3.5, floor, 7], [-2, floor + 2.5, 8.5], blocks))
  return items
}

function livingRoom(): Item[] {
  const floor = -1.15
  const ceiling = 1.35
  const side = 2.6
  const front = 3.6
  const items: Item[] = [
    polygon([[-side, ceiling, 0], [side, ceiling, 0], [side, ceiling, front], [-side, ceiling, front]], '#efebe4'),
    polygon([[-side, floor, front], [side, floor, front], [side, ceiling, front], [-side, ceiling, front]], '#d8cdbd'),
    polygon([[-side, floor, 0], [-side, floor, front], [-side, ceiling, front], [-side, ceiling, 0]], '#c9bca8'),
    polygon([[side, floor, 0], [side, floor, front], [side, ceiling, front], [side, ceiling, 0]], '#cdc1af'),
    polygon([[-side, floor, 0], [side, floor, 0], [side, floor, front], [-side, floor, front]], '#9a7650'),
  ]
  for (let board = 0; board < 25; board += 1) {
    const across = -2.4 + board * 0.2
    items.push(segment([across, floor, 0], [across, floor, front], '#86643f', 0.7))
  }
  items.push(
    polygon([[-1.3, floor + 0.01, 0.8], [1.3, floor + 0.01, 0.8], [1.3, floor + 0.01, 2.6], [-1.3, floor + 0.01, 2.6]], '#7d3f3a'),
    polygon([[-side + 0.01, -0.4, 1], [-side + 0.01, -0.4, 2.6], [-side + 0.01, 0.9, 2.6], [-side + 0.01, 0.9, 1]], '#bfe0f7', {
      stroke: '#fafafa',
      strokeWidth: 4,
    }),
    segment([-side + 0.01, -0.4, 1.8], [-side + 0.01, 0.9, 1.8], '#fafafa', 3),
    segment([-side + 0.01, 0.25, 1], [-side + 0.01, 0.25, 2.6], '#fafafa', 3),
    polygon([[side - 0.01, floor, 2.2], [side - 0.01, floor, 3.1], [side - 0.01, 0.85, 3.1], [side - 0.01, 0.85, 2.2]], '#a9825a', {
      stroke: '#8a6640',
      strokeWidth: 2,
    }),
    ...box([2.2, floor, 0.6], [side, 0.7, 1.6], { top: '#6b4c32', side: '#6b4c32', front: '#5a3f29' }),
  )
  for (const height of [-0.6, -0.1, 0.4]) items.push(segment([2.2, height, 0.6], [2.2, height, 1.6], '#3f2c1c', 2.5))
  items.push(
    ...box([-1.1, floor, 3.2], [1.1, -0.65, front], { top: '#5e4630', side: '#4d3926', front: '#4d3926' }),
    polygon([[-0.9, -0.45, front - 0.02], [0.9, -0.45, front - 0.02], [0.9, 0.55, front - 0.02], [-0.9, 0.55, front - 0.02]], '#121417'),
    polygon([[-0.86, -0.41, front - 0.03], [0.86, -0.41, front - 0.03], [0.86, 0.51, front - 0.03], [-0.86, 0.51, front - 0.03]], '#22344a'),
    segment([-2.1, floor, 3.1], [-2.1, 0.4, 3.1], '#333333', 2),
    ...box([-2.3, 0.4, 2.9], [-1.9, 0.75, 3.3], { top: '#f3e3c0', side: '#ecd7ab', front: '#f3e3c0' }),
    flatDisc([0, ceiling - 0.01, 2], 0.25, '#fff8e1'),
    ...box([-0.6, floor, 1.2], [0.6, -0.75, 1.8], { top: '#6e5236', side: '#55402a', front: '#5d4630' }),
  )
  return items
}

export const sceneNames = ['void', 'room', 'cockpit'] as const
export type SceneName = (typeof sceneNames)[number]

const scenes: ReadonlyMap<SceneName, Scene> = new Map([
  ['void', { kind: 'sketch', name: 'Grid void', sky: ['#03060d', '#0b1630'], ground: '#060a12', items: gridVoid }],
  ['room', { kind: 'sketch', name: 'Living room', sky: ['#efebe4', '#efebe4'], ground: '#9a7650', items: livingRoom }],
  [
    'cockpit',
    {
      kind: 'photo',
      name: 'Cockpit',
      sky: ['#d9dcdc', '#c4c7c6'],
      ground: '#3a3d40',
      // "Eesti Lennundusmuuseum. Hävitaja F-4C Phantom II kabiin" by Lauri Veerde, Wikimedia Commons, CC BY-SA 4.0.
      // The reprojected image is shared under the same licence.
      photo: 'scenes/cockpit.webp',
    },
  ],
])

export function sceneOf(name: SceneName): Scene {
  return scenes.get(name) as Scene
}

function shapeOf(item: Item, scale: RadialScale): SceneShape | null {
  if (item.kind === 'segment') {
    const clipped = clipSegment(item.start, item.end)
    if (clipped === null) return null
    return {
      path: scenePath(clipped, false, scale),
      fill: 'none',
      stroke: item.stroke,
      strokeWidth: item.strokeWidth,
      strokeOpacity: item.strokeOpacity,
    }
  }
  const clipped = clipPolygon(item.points)
  if (clipped.length < 3) return null
  return { path: scenePath(clipped, true, scale), fill: item.fill, ...item.outline }
}

/** Projecting a scene is the slow part, so each scene is projected once per chart reach. */
const projected = new Map<string, readonly SceneShape[]>()

export function sceneShapes(scene: SketchScene, reach: number, scale: RadialScale): readonly SceneShape[] {
  const key = `${scene.name}:${String(reach)}`
  const cached = projected.get(key)
  if (cached !== undefined) return cached
  const shapes = scene.items().flatMap((item) => {
    const shape = shapeOf(item, scale)
    return shape === null ? [] : [shape]
  })
  projected.set(key, shapes)
  return shapes
}
