import { describe, expect, it } from 'vitest'
import { headDirection, identity, straightAhead, upward, yawRotation } from '../../src/lib/headFrame'
import { clipMatrix, createSceneRenderer, sceneDistance } from '../../src/lib/sceneRenderer'
import { Mesh, messageCorners } from '../../src/lib/measureScene'
import { fakeGl, projectionOf, viewportAt } from './xrFixtures'

/** Where a head-frame direction lands on the view, in normalized device coordinates. */
function project(matrix: Float32Array, direction: { right: number; up: number; back: number }): { across: number; upward: number } {
  const input = [direction.right, direction.up, direction.back, 1]
  const output = [0, 1, 2, 3].map((row) => [0, 1, 2, 3].reduce((sum, column) => sum + (matrix.at(column * 4 + row) ?? 0) * (input.at(column) ?? 0), 0))
  const [clipX = 0, clipY = 0, , clipW = 1] = output
  return { across: clipX / clipW, upward: clipY / clipW }
}

describe('clipMatrix', () => {
  const tangents = { left: -1, right: 1, down: -1, up: 1 }

  it('puts straight ahead at the centre of a picture that is not turned', () => {
    const point = project(clipMatrix(projectionOf(tangents), identity), headDirection(0, 0))
    expect(point.across).toBeCloseTo(0, 5)
    expect(point.upward).toBeCloseTo(0, 5)
  })

  it('puts a picture edge at the border of the view', () => {
    const matrix = clipMatrix(projectionOf(tangents), identity)
    expect(project(matrix, headDirection(90, 45)).across).toBeCloseTo(-1, 5)
    expect(project(matrix, headDirection(0, 45)).upward).toBeCloseTo(1, 5)
  })

  it('turns directions into the view of a turned picture', () => {
    // The left picture turned 10° outward has its centre 10° to the left of straight ahead.
    const matrix = clipMatrix(projectionOf(tangents), yawRotation(10))
    expect(project(matrix, headDirection(90, 10)).across).toBeCloseTo(0, 5)
    expect(project(matrix, headDirection(90, 55)).across).toBeCloseTo(-1, 5)
  })

  it('writes into the matrix it is given', () => {
    const target = new Float32Array(16)
    expect(clipMatrix(projectionOf(tangents), identity, target)).toBe(target)
    expect(Array.from(target)).toEqual(Array.from(clipMatrix(projectionOf(tangents), identity)))
  })

  it('draws the scene at its distance, inside the depth range', () => {
    const matrix = clipMatrix(projectionOf(tangents), identity)
    const clipW = [0, 1, 2, 3].reduce((sum, column) => sum + (matrix.at(column * 4 + 3) ?? 0) * ([0, 0, -1, 1].at(column) ?? 0), 0)
    expect(clipW).toBeCloseTo(sceneDistance, 5)
  })
})

describe('createSceneRenderer', () => {
  function triangleMesh(): Mesh {
    const mesh = new Mesh()
    mesh.begin()
    for (const corner of [straightAhead, upward, { right: 1, up: 0, back: 0 }]) mesh.corner(corner, [1, 1, 1])
    mesh.end()
    return mesh
  }

  it('clears the whole layer, then draws one eye in its viewport', () => {
    const { gl, calls, viewport, drawArrays } = fakeGl()
    const renderer = createSceneRenderer(gl)
    if (renderer === null) throw new Error('no renderer')
    renderer.clear(null, 2000, 1000)
    expect(viewport).toHaveBeenLastCalledWith(0, 0, 2000, 1000)
    renderer.draw(viewportAt(1000, 0, 1000, 1000), new Float32Array(16), triangleMesh())
    expect(viewport).toHaveBeenLastCalledWith(1000, 0, 1000, 1000)
    expect(drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3)
    expect(calls).toContain('uniformMatrix4fv')
  })

  it('deletes its shaders once the programs are linked', () => {
    const { gl, calls } = fakeGl()
    createSceneRenderer(gl)
    expect(calls.filter((call) => call === 'deleteShader')).toHaveLength(4)
    expect(calls).not.toContain('deleteProgram')
  })

  it('uploads a mesh again only when it changed, and draws nothing for an empty one', () => {
    const { gl, bufferData, drawArrays } = fakeGl()
    const renderer = createSceneRenderer(gl)
    if (renderer === null) throw new Error('no renderer')
    const mesh = triangleMesh()
    const uploads = bufferData.mock.calls.length
    renderer.draw(viewportAt(0, 0, 10, 10), new Float32Array(16), mesh)
    renderer.draw(viewportAt(0, 0, 10, 10), new Float32Array(16), mesh)
    expect(bufferData.mock.calls.length).toBe(uploads + 2)
    mesh.end()
    renderer.draw(viewportAt(0, 0, 10, 10), new Float32Array(16), mesh)
    expect(bufferData.mock.calls.length).toBe(uploads + 4)
    drawArrays.mockClear()
    renderer.draw(viewportAt(0, 0, 10, 10), new Float32Array(16), new Mesh())
    expect(drawArrays).not.toHaveBeenCalled()
  })

  it('lays a picture on its rectangle, uploading it once', () => {
    const { gl, texImage2D, drawArrays } = fakeGl()
    const renderer = createSceneRenderer(gl)
    if (renderer === null) throw new Error('no renderer')
    const picture = {} as TexImageSource
    const corners = messageCorners(4)
    renderer.drawPicture(viewportAt(0, 0, 10, 10), new Float32Array(16), picture, corners)
    renderer.drawPicture(viewportAt(0, 0, 10, 10), new Float32Array(16), picture, corners)
    expect(texImage2D).toHaveBeenCalledTimes(1)
    expect(drawArrays).toHaveBeenLastCalledWith(gl.TRIANGLES, 0, 6)
    renderer.drawPicture(viewportAt(0, 0, 10, 10), new Float32Array(16), {} as TexImageSource, corners)
    expect(texImage2D).toHaveBeenCalledTimes(2)
  })

  it('releases its programs, buffers and picture when disposed, then draws nothing', () => {
    const { gl, deleted, drawArrays, viewport } = fakeGl()
    const renderer = createSceneRenderer(gl)
    if (renderer === null) throw new Error('no renderer')
    renderer.draw(viewportAt(0, 0, 10, 10), new Float32Array(16), triangleMesh())
    renderer.drawPicture(viewportAt(0, 0, 10, 10), new Float32Array(16), {} as TexImageSource, messageCorners(4))
    const shaders = deleted.length
    renderer.dispose()
    const names = deleted.slice(shaders).map((resource) => (resource as { name: string }).name)
    expect(names.filter((name) => name === 'createProgram')).toHaveLength(2)
    expect(names.filter((name) => name === 'createBuffer')).toHaveLength(4)
    expect(names).toContain('createTexture')
    renderer.dispose()
    expect(deleted.length).toBe(shaders + names.length)
    drawArrays.mockClear()
    viewport.mockClear()
    renderer.clear(null, 10, 10)
    renderer.draw(viewportAt(0, 0, 10, 10), new Float32Array(16), triangleMesh())
    renderer.drawPicture(viewportAt(0, 0, 10, 10), new Float32Array(16), {} as TexImageSource, messageCorners(4))
    expect(drawArrays).not.toHaveBeenCalled()
    expect(viewport).not.toHaveBeenCalled()
  })

  it.each([
    ['a shader cannot be made', { createShader: () => null }],
    ['a shader does not compile', { getShaderParameter: () => false }],
    ['the program does not link', { getProgramParameter: () => false }],
    ['the matrix has no place', { getUniformLocation: () => null }],
    ['an attribute has no place', { getAttribLocation: () => -1 }],
  ])('gives nothing when %s, releasing what it made', (_, overrides) => {
    const { gl, calls } = fakeGl(overrides)
    expect(createSceneRenderer(gl)).toBeNull()
    const made = calls.filter((call) => call === 'createProgram').length
    expect(calls.filter((call) => call === 'deleteProgram')).toHaveLength(made)
  })
})
