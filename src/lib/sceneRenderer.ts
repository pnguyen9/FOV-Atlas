/**
 * Draws the measure's scene with plain WebGL, which keeps the page free of any 3D library: one
 * shader pair colours triangles of directions, another lays a picture (a message) on a rectangle.
 * Everything it creates on the GL context is released by `dispose`, also when it fails to start.
 */

import { conjugate, rotate, type Quaternion } from './headFrame.ts'
import type { Mesh } from './measureScene.ts'

/** How far away the scene is drawn, in metres: well inside any headset's depth range, far enough to look at ease. */
export const sceneDistance = 10

const columns = 4
const axes = [
  { right: 1, up: 0, back: 0 },
  { right: 0, up: 1, back: 0 },
  { right: 0, up: 0, back: 1 },
] as const

/**
 * Writes into `target` the column-major matrix taking a direction to the view's clip space:
 * turned into the view's own frame, pushed out to `sceneDistance`, then projected. Directions are
 * in whatever frame `viewOrientation` is given in.
 */
export function clipMatrix(projection: ArrayLike<number>, viewOrientation: Quaternion, target: Float32Array = new Float32Array(16)): Float32Array {
  const toView = conjugate(viewOrientation)
  const placed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
  axes.forEach((axis, axisIndex) => {
    const turned = rotate(toView, axis)
    placed[axisIndex * columns] = turned.right * sceneDistance
    placed[axisIndex * columns + 1] = turned.up * sceneDistance
    placed[axisIndex * columns + 2] = turned.back * sceneDistance
  })
  const entries = placed.map((_, entry) => {
    const [column, row] = [Math.floor(entry / columns), entry % columns]
    let sum = 0
    for (let step = 0; step < columns; step += 1) sum += (projection[step * columns + row] ?? 0) * (placed.at(column * columns + step) ?? 0)
    return sum
  })
  target.set(entries)
  return target
}

const colourVertexSource = `
attribute vec3 position;
attribute vec3 colour;
uniform mat4 clip;
varying vec3 shade;
void main() {
  shade = colour;
  gl_Position = clip * vec4(position, 1.0);
}`

const colourFragmentSource = `
precision mediump float;
varying vec3 shade;
void main() {
  gl_FragColor = vec4(shade, 1.0);
}`

const pictureVertexSource = `
attribute vec3 position;
attribute vec2 spot;
uniform mat4 clip;
varying vec2 place;
void main() {
  place = spot;
  gl_Position = clip * vec4(position, 1.0);
}`

const pictureFragmentSource = `
precision mediump float;
uniform sampler2D picture;
varying vec2 place;
void main() {
  gl_FragColor = texture2D(picture, place);
}`

/** Where each corner of `messageCorners` takes the picture from: bottom left, bottom right, top right, and so on. */
const pictureSpots = new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0])

export interface Viewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SceneRenderer {
  /** Clears the whole layer to black, so an eye without anything drawn sees nothing. */
  clear(framebuffer: WebGLFramebuffer | null, width: number, height: number): void
  draw(viewport: Viewport, matrix: Float32Array, mesh: Mesh): void
  /** Lays `picture` on the rectangle of `corners` (six corners, two triangles). */
  drawPicture(viewport: Viewport, matrix: Float32Array, picture: TexImageSource, corners: Float32Array): void
  /** Releases everything made on the context; the renderer draws nothing afterward. */
  dispose(): void
}

interface Program {
  readonly program: WebGLProgram
  readonly clip: WebGLUniformLocation
  readonly attributes: readonly number[]
}

interface MeshBuffers {
  readonly positions: WebGLBuffer
  readonly colours: WebGLBuffer
  version: number
}

/** A renderer for the context, or null when its shaders don't build. */
export function createSceneRenderer(gl: WebGLRenderingContext): SceneRenderer | null {
  const shaders: WebGLShader[] = []
  const programs: WebGLProgram[] = []
  const buffers: WebGLBuffer[] = []
  const textures: WebGLTexture[] = []
  const release = (): void => {
    for (const shader of shaders) gl.deleteShader(shader)
    for (const program of programs) gl.deleteProgram(program)
    for (const buffer of buffers) gl.deleteBuffer(buffer)
    for (const texture of textures) gl.deleteTexture(texture)
    shaders.length = 0
    programs.length = 0
    buffers.length = 0
    textures.length = 0
  }

  const compiled = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type)
    if (shader === null) return null
    shaders.push(shader)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true ? shader : null
  }

  const linked = (vertexSource: string, fragmentSource: string, attributeNames: readonly string[]): Program | null => {
    const vertexShader = compiled(gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = compiled(gl.FRAGMENT_SHADER, fragmentSource)
    if (vertexShader === null || fragmentShader === null) return null
    const program = gl.createProgram()
    programs.push(program)
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) return null
    const clip = gl.getUniformLocation(program, 'clip')
    const attributes = attributeNames.map((name) => gl.getAttribLocation(program, name))
    if (clip === null || attributes.some((location) => location < 0)) return null
    return { program, clip, attributes }
  }

  const colourProgram = linked(colourVertexSource, colourFragmentSource, ['position', 'colour'])
  const pictureProgram = colourProgram === null ? null : linked(pictureVertexSource, pictureFragmentSource, ['position', 'spot'])
  // A linked program keeps working without its shaders.
  for (const shader of shaders) gl.deleteShader(shader)
  shaders.length = 0
  if (colourProgram === null || pictureProgram === null) {
    release()
    return null
  }

  const createdBuffer = (): WebGLBuffer => {
    const buffer = gl.createBuffer()
    buffers.push(buffer)
    return buffer
  }
  const meshBuffers = new Map<Mesh, MeshBuffers>()
  const pictureCorners = createdBuffer()
  const pictureSpotBuffer = createdBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, pictureSpotBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, pictureSpots, gl.STATIC_DRAW)
  let shownPicture: TexImageSource | null = null
  let shownCorners: Float32Array | null = null
  let pictureTexture: WebGLTexture | null = null
  let disposed = false

  const attribute = (buffer: WebGLBuffer, location: number, size: number): void => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
  }

  const use = ({ program, clip }: Program, viewport: Viewport, matrix: Float32Array): void => {
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.useProgram(program)
    gl.uniformMatrix4fv(clip, false, matrix)
  }

  const [positionAt = 0, colourAt = 0] = colourProgram.attributes
  const [cornerAt = 0, spotAt = 0] = pictureProgram.attributes
  const pictureAt = gl.getUniformLocation(pictureProgram.program, 'picture')

  return {
    clear(framebuffer, width, height) {
      if (disposed) return
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.viewport(0, 0, width, height)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    },
    draw(viewport, matrix, mesh) {
      if (disposed || mesh.count === 0) return
      let held = meshBuffers.get(mesh)
      if (held === undefined) {
        held = { positions: createdBuffer(), colours: createdBuffer(), version: -1 }
        meshBuffers.set(mesh, held)
      }
      use(colourProgram, viewport, matrix)
      const upload = held.version !== mesh.version
      for (const [buffer, values, location] of [
        [held.positions, mesh.positions, positionAt],
        [held.colours, mesh.colours, colourAt],
      ] as const) {
        if (upload) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
          gl.bufferData(gl.ARRAY_BUFFER, values.subarray(0, mesh.count * 3), gl.DYNAMIC_DRAW)
        }
        attribute(buffer, location, 3)
      }
      held.version = mesh.version
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count)
    },
    drawPicture(viewport, matrix, picture, corners) {
      if (disposed) return
      use(pictureProgram, viewport, matrix)
      if (pictureTexture === null) {
        pictureTexture = gl.createTexture()
        textures.push(pictureTexture)
      }
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, pictureTexture)
      if (picture !== shownPicture) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture)
        shownPicture = picture
      }
      gl.uniform1i(pictureAt, 0)
      if (corners !== shownCorners) {
        gl.bindBuffer(gl.ARRAY_BUFFER, pictureCorners)
        gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW)
        shownCorners = corners
      }
      attribute(pictureCorners, cornerAt, 3)
      attribute(pictureSpotBuffer, spotAt, 2)
      gl.drawArrays(gl.TRIANGLES, 0, corners.length / 3)
    },
    dispose() {
      if (disposed) return
      disposed = true
      meshBuffers.clear()
      release()
    },
  }
}
