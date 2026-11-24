import { describe, expect, it } from 'vitest'
import { headsets } from '../../src/data/headsets'
import { hmdgdbConfigurations } from '../../src/data/hmdgdb'
import { brands, catalogHeadset, maskedDiagonalOf, modelsOf, otherHeadset } from '../../src/lib/headsets'
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
