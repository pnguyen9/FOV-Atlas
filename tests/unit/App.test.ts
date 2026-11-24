import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../src/App.vue'

describe('App', () => {
  it('shows the site description in its own tab', () => {
    expect(mount(App, { props: { framed: false } }).text()).toContain('measured by the people wearing them')
  })
  it('refuses to run inside a frame', () => {
    expect(mount(App, { props: { framed: true } }).text()).toContain('only runs in its own tab')
  })
})
