/**
 * The headset models a measure can be filed under, grouped by brand.
 *
 * Ids follow VR Headset Picker's wherever it lists the model: its share links carry the id of the
 * headset picked there, which then selects the same model here. Models it lacks get slugs in the
 * same style. An id is never changed or reused once measures are stored under it.
 */

export interface Headset {
  /** Lowercase slug, also the folder name of the headset's stored data. */
  readonly id: string
  readonly brand: string
  readonly name: string
}

export const headsets: readonly Headset[] = [
  { id: 'apple-vision-pro', brand: 'Apple', name: 'Apple Vision Pro' },

  { id: 'bigscreen-beyond', brand: 'Bigscreen', name: 'Bigscreen Beyond' },
  { id: 'bigscreen-beyond-2', brand: 'Bigscreen', name: 'Bigscreen Beyond 2' },
  { id: 'bigscreen-beyond-2e', brand: 'Bigscreen', name: 'Bigscreen Beyond 2e' },

  { id: 'hp-reverb', brand: 'HP', name: 'HP Reverb' },
  { id: 'hp-reverb-g2', brand: 'HP', name: 'HP Reverb G2' },

  { id: 'htc-vive', brand: 'HTC', name: 'HTC Vive' },
  { id: 'htc-vive-pro', brand: 'HTC', name: 'HTC Vive Pro' },
  { id: 'htc-vive-cosmos', brand: 'HTC', name: 'HTC Vive Cosmos' },
  { id: 'vive-pro-2', brand: 'HTC', name: 'VIVE Pro 2' },
  { id: 'vive-focus-3', brand: 'HTC', name: 'VIVE Focus 3' },
  { id: 'vive-focus-vision', brand: 'HTC', name: 'VIVE Focus Vision' },
  { id: 'vive-xr-elite', brand: 'HTC', name: 'VIVE XR Elite' },
  { id: 'vive-flow', brand: 'HTC', name: 'VIVE Flow' },

  { id: 'meta-quest-2', brand: 'Meta', name: 'Meta Quest 2' },
  { id: 'meta-quest-3', brand: 'Meta', name: 'Meta Quest 3' },
  { id: 'meta-quest-3s', brand: 'Meta', name: 'Meta Quest 3S' },
  { id: 'meta-quest-pro', brand: 'Meta', name: 'Meta Quest Pro' },

  { id: 'oculus-rift-dk1', brand: 'Oculus', name: 'Oculus Rift DK1' },
  { id: 'oculus-rift-dk2', brand: 'Oculus', name: 'Oculus Rift DK2' },
  { id: 'oculus-rift-cv1', brand: 'Oculus', name: 'Oculus Rift CV1' },
  { id: 'oculus-rift-s', brand: 'Oculus', name: 'Oculus Rift S' },
  { id: 'oculus-go', brand: 'Oculus', name: 'Oculus Go' },
  { id: 'oculus-quest', brand: 'Oculus', name: 'Oculus Quest' },

  { id: 'pico-4', brand: 'PICO', name: 'PICO 4' },
  { id: 'pico-4-ultra', brand: 'PICO', name: 'PICO 4 Ultra' },

  { id: 'pimax-5k-plus', brand: 'Pimax', name: 'Pimax 5K Plus' },
  { id: 'pimax-8k', brand: 'Pimax', name: 'Pimax 8K' },
  { id: 'pimax-vision-5k-super', brand: 'Pimax', name: 'Pimax Vision 5K Super' },
  { id: 'pimax-vision-8k-plus', brand: 'Pimax', name: 'Pimax Vision 8K Plus' },
  { id: 'pimax-vision-8k-x', brand: 'Pimax', name: 'Pimax Vision 8K X' },
  { id: 'pimax-crystal', brand: 'Pimax', name: 'Pimax Crystal' },
  { id: 'pimax-crystal-light', brand: 'Pimax', name: 'Pimax Crystal Light' },
  { id: 'pimax-crystal-super-50-ppd', brand: 'Pimax', name: 'Pimax Crystal Super 50 PPD' },
  { id: 'pimax-crystal-super-57-ppd', brand: 'Pimax', name: 'Pimax Crystal Super 57 PPD' },
  { id: 'pimax-crystal-super-micro-oled', brand: 'Pimax', name: 'Pimax Crystal Super Micro-OLED' },
  { id: 'pimax-crystal-super-ultrawide', brand: 'Pimax', name: 'Pimax Crystal Super Ultrawide' },
  { id: 'pimax-dream-air-lighthouse', brand: 'Pimax', name: 'Pimax Dream Air (Lighthouse)' },
  { id: 'pimax-dream-air-slam', brand: 'Pimax', name: 'Pimax Dream Air (SLAM)' },
  { id: 'pimax-dream-air-se-lighthouse', brand: 'Pimax', name: 'Pimax Dream Air SE (Lighthouse)' },
  { id: 'pimax-dream-air-se-slam', brand: 'Pimax', name: 'Pimax Dream Air SE (SLAM)' },

  { id: 'play-for-dream-mr', brand: 'Play For Dream', name: 'Play For Dream MR' },

  { id: 'samsung-galaxy-xr', brand: 'Samsung', name: 'Samsung Galaxy XR' },

  { id: 'meganex-superlight-8k', brand: 'Shiftall', name: 'MeganeX superlight 8K' },
  { id: 'meganex-8k-mark-ii', brand: 'Shiftall', name: 'MeganeX 8K Mark II' },

  { id: 'somnium-vr1-visionary-edition', brand: 'Somnium Space', name: 'Somnium VR1 Visionary Edition' },
  { id: 'somnium-vr1-ultimate-edition', brand: 'Somnium Space', name: 'Somnium VR1 Ultimate Edition' },
  { id: 'somnium-vr1-titan-edition', brand: 'Somnium Space', name: 'Somnium VR1 Titan Edition' },

  { id: 'playstation-vr', brand: 'Sony', name: 'PlayStation VR' },
  { id: 'playstation-vr2', brand: 'Sony', name: 'PlayStation VR2' },

  { id: 'valve-index', brand: 'Valve', name: 'Valve Index' },
  { id: 'valve-steam-frame', brand: 'Valve', name: 'Steam Frame' },

  { id: 'varjo-vr-2', brand: 'Varjo', name: 'Varjo VR-2' },
  { id: 'varjo-vr-2-pro', brand: 'Varjo', name: 'Varjo VR-2 Pro' },
  { id: 'varjo-vr-3', brand: 'Varjo', name: 'Varjo VR-3' },
  { id: 'varjo-xr-1-developer-edition', brand: 'Varjo', name: 'Varjo XR-1 Developer Edition' },
  { id: 'varjo-xr-3', brand: 'Varjo', name: 'Varjo XR-3' },
  { id: 'varjo-xr-4', brand: 'Varjo', name: 'Varjo XR-4' },
  { id: 'varjo-xr-4-focal-edition', brand: 'Varjo', name: 'Varjo XR-4 Focal Edition' },
  { id: 'varjo-aero', brand: 'Varjo', name: 'Varjo Aero' },
]
