import { describe, expect, it } from 'vitest'
import { headsets } from '../../src/data/headsets'
import { hmdgdbConfigurations } from '../../src/data/hmdgdb'
import {
  brands,
  catalogHeadset,
  borrowedReferenceLabel,
  configurationsOf,
  hasCornerMask,
  hmdgdbPageUrl,
  maskedDiagonalOf,
  modelsOf,
  otherHeadset,
  referenceConfigurationOf,
} from '../../src/lib/headsets'
import { isHeadsetId } from '../../src/lib/submission'

describe('headset catalog', () => {
  it('has unique ids that are valid storage ids, none of them the other choice', () => {
    const ids = headsets.map((headset) => headset.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => !isHeadsetId(id))).toEqual([])
    expect(ids).not.toContain(otherHeadset)
  })

  it('keeps each brand together', () => {
    const brandRuns = headsets.map((headset) => headset.brand).filter((brand, index, all) => brand !== all[index - 1])
    expect(brandRuns).toEqual(brands)
  })

  it('names a catalog model for every hmdgdb configuration', () => {
    expect(hmdgdbConfigurations.filter((configuration) => catalogHeadset(configuration.headset) === undefined)).toEqual([])
  })
})

describe('catalogHeadset', () => {
  it('finds a model by its VR Headset Picker id', () => {
    expect(catalogHeadset('pimax-dream-air-slam')).toEqual({ id: 'pimax-dream-air-slam', brand: 'Pimax', name: 'Pimax Dream Air (SLAM)' })
  })
  it.each([['other'], [''], ['Valve Index']])('knows nothing of %j', (id) => {
    expect(catalogHeadset(id)).toBeUndefined()
  })
})

describe('modelsOf', () => {
  it('lists a brand’s models in catalog order', () => {
    expect(modelsOf('Bigscreen').map((headset) => headset.id)).toEqual(['bigscreen-beyond', 'bigscreen-beyond-2', 'bigscreen-beyond-2e'])
  })
  it('lists nothing for an unknown brand', () => {
    expect(modelsOf('Nobody')).toEqual([])
  })
})

describe('maskedDiagonalOf', () => {
  it.each([
    ['a single native configuration with a mask', 'valve-index', 114.43],
    ['a single configuration without a mask', 'bigscreen-beyond-2e', undefined],
    ['a mask that hides nothing', 'vive-focus-3', undefined],
    ['several native configurations', 'pimax-5k-plus', undefined],
    ['no hmdgdb record', 'apple-vision-pro', undefined],
  ])('reads %s', (_description, id, expected) => {
    expect(maskedDiagonalOf(id)).toBe(expected)
  })
})

describe('referenceConfigurationOf', () => {
  it('takes the only native configuration, setting parallel projection aside', () => {
    expect(referenceConfigurationOf('valve-index')?.config).toBe('Native+R144')
  })
  it.each([['pimax-5k-plus'], ['valve-steam-frame'], ['apple-vision-pro']])('has none for %s', (id) => {
    expect(referenceConfigurationOf(id)).toBeUndefined()
  })
})

describe('configurationsOf', () => {
  it('lists every configuration of a model, linked to its hmdgdb page', () => {
    const configurations = configurationsOf('valve-index')
    expect(configurations.map((configuration) => configuration.config)).toEqual(['Native+R144', 'PP+R144'])
    const [first] = configurations
    if (first === undefined) throw new Error('no configuration')
    expect(hmdgdbPageUrl(first)).toBe('https://risa2000.github.io/hmdgdb/hmd_cfgs/Index_Native_R144.html')
    expect(configurationsOf('apple-vision-pro')).toEqual([])
  })
})

describe('hasCornerMask', () => {
  it('tells masked configurations from full-frame ones', () => {
    const [index, beyond] = [referenceConfigurationOf('valve-index'), referenceConfigurationOf('bigscreen-beyond-2e')]
    if (index === undefined || beyond === undefined) throw new Error('no configuration')
    expect(hasCornerMask(index)).toBe(true)
    expect(hasCornerMask(beyond)).toBe(false)
  })
})

describe('borrowed references', () => {
  it('point at catalog models with a reference of their own', () => {
    const borrowing = headsets.filter((headset) => headset.referenceBorrowedFrom !== undefined)
    expect(borrowing.map((headset) => headset.id)).toEqual(['bigscreen-beyond-2'])
    for (const headset of borrowing) {
      const source = headset.referenceBorrowedFrom?.headset ?? ''
      expect(catalogHeadset(source)?.referenceBorrowedFrom).toBeUndefined()
      expect(referenceConfigurationOf(source)).toBeDefined()
    }
  })
  it('stand in for the model and say where they come from', () => {
    expect(referenceConfigurationOf('bigscreen-beyond-2')).toBe(referenceConfigurationOf('bigscreen-beyond-2e'))
    expect(configurationsOf('bigscreen-beyond-2')).toEqual(configurationsOf('bigscreen-beyond-2e'))
    expect(borrowedReferenceLabel('bigscreen-beyond-2')).toBe('from the Beyond 2e (same lenses and panels)')
    expect(borrowedReferenceLabel('bigscreen-beyond-2e')).toBeUndefined()
    expect(borrowedReferenceLabel('nothing-here')).toBeUndefined()
  })
})
