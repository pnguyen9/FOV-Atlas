import { describe, expect, it } from 'vitest'
import { headsets } from '../../src/data/headsets'
import { brands, catalogHeadset, modelsOf, otherHeadset } from '../../src/lib/headsets'
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
