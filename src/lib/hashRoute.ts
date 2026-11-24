/**
 * Hash routing: GitHub Pages serves a single index.html, so every page lives after the `#`.
 *
 * The hash comes from the address bar and from links anyone can share, so it is parsed strictly:
 * a known page name, for a headset page a well-formed headset id, for How it works a known
 * section, and for Compare an optional kept measure (see `measureFile.ts`), carried as given and
 * checked by the page that reads it. Anything else is a page that doesn't exist, never a guess at
 * the closest one.
 */

import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'
import { maximumEncodedLength, measureParameterOfLink } from './measureFile.ts'
import { isHeadsetId } from './submission.ts'

export const pageNames = ['home', 'compare', 'submit', 'method'] as const
export type PageName = (typeof pageNames)[number]
export const methodSections = ['credits'] as const
export type MethodSection = (typeof methodSections)[number]

export type Route =
  | { readonly page: 'home' | 'submit' }
  | { readonly page: 'compare'; readonly measure: string | null }
  | { readonly page: 'method'; readonly section: MethodSection | null }
  | { readonly page: 'headset'; readonly headset: string }
  | { readonly page: 'not-found' }

export const navigation: readonly { readonly page: PageName; readonly route: Route; readonly label: string }[] = [
  { page: 'home', route: { page: 'home' }, label: 'Home' },
  { page: 'compare', route: { page: 'compare', measure: null }, label: 'Compare' },
  { page: 'submit', route: { page: 'submit' }, label: 'Add a measure' },
  { page: 'method', route: { page: 'method', section: null }, label: 'How it works' },
]

/** Room for a kept measure and nothing far beyond; caps the work done on a hostile address. */
const maximumHashLength = maximumEncodedLength + 64
const notFound: Route = { page: 'not-found' }

export function parseRoute(hash: string): Route {
  if (hash.length > maximumHashLength) return notFound
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  if (path === '' || path === 'home') return { page: 'home' }
  if (path === 'submit') return { page: 'submit' }
  if (path === 'compare') return { page: 'compare', measure: null }
  if (path.startsWith('compare?')) {
    const measure = measureParameterOfLink(`#${path}`)
    return measure === null ? notFound : { page: 'compare', measure }
  }
  const [name, argument, ...rest] = path.split('/')
  if (rest.length > 0) return notFound
  if (name === 'method') {
    if (argument === undefined) return { page: 'method', section: null }
    const section = methodSections.find((candidate) => candidate === argument)
    return section === undefined ? notFound : { page: 'method', section }
  }
  return name === 'headset' && argument !== undefined && isHeadsetId(argument) ? { page: 'headset', headset: argument } : notFound
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'headset':
      return `#headset/${route.headset}`
    case 'compare':
      return route.measure === null ? '#compare' : `#compare?measure=${encodeURIComponent(route.measure)}`
    case 'method':
      return route.section === null ? '#method' : `#method/${route.section}`
    case 'not-found':
      return '#home'
    default:
      return `#${route.page}`
  }
}

/** The navigation entry shown as current: a headset page belongs to Compare. */
export function navigationPageOf(route: Route): PageName | null {
  if (route.page === 'headset') return 'compare'
  return route.page === 'not-found' ? null : route.page
}

export interface HashSource {
  readonly location: { readonly hash: string }
  addEventListener(type: 'hashchange', listener: () => void): void
  removeEventListener(type: 'hashchange', listener: () => void): void
}

/** The current route, following the address bar until the calling component unmounts. */
export function useHashRoute(source: HashSource): Readonly<Ref<Route>> {
  const route = ref<Route>(parseRoute(source.location.hash))
  const update = (): void => {
    route.value = parseRoute(source.location.hash)
  }
  source.addEventListener('hashchange', update)
  onBeforeUnmount(() => {
    source.removeEventListener('hashchange', update)
  })
  return readonly(route)
}
