// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { rootComponent } from '../../src/rootComponent'

describe('rootComponent', () => {
  it('mounts the app in its own tab', () => {
    const topWindow = {}
    const root = rootComponent({ self: topWindow, top: topWindow })
    expect(mount(root).text()).toContain('measured by the people wearing them')
  })
  it('mounts only the notice inside a frame', () => {
    const text = mount(rootComponent({ self: {}, top: {} })).text()
    expect(text).toContain('only runs in its own tab')
    expect(text).not.toContain('measured by the people wearing them')
  })
})
