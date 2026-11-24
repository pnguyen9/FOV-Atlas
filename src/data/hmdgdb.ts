/**
 * Rendered field of view of headset configurations, recorded with hmdq.
 *
 * Source: the HMD Geometry Database, "hmdq / hmdgdb by Richard Musil", CC BY-SA 4.0
 * (https://risa2000.github.io/hmdgdb/, https://creativecommons.org/licenses/by-sa/4.0/). The
 * figures are its summary table as read on 2026-11-24, mapped to catalog ids; this file is
 * shared under CC BY-SA 4.0, unlike the rest of the repository. Two rows have no catalog model of
 * their own and are left out: "HTC Vive XR Streaming" and "Pimax Crystal Super", which the catalog
 * splits into lens variants without saying which one was recorded.
 *
 * Totals are binocular, in degrees. A configuration's hidden area mask hides the corners of the
 * rendered view, and hmdq computes the totals, the diagonal included, on what the mask leaves.
 */

export interface HmdgdbConfiguration {
  readonly headset: string
  /** hmdgdb's configuration label: field-of-view mode, `Native` or `PP` (parallel projections), refresh rate. */
  readonly config: string
  /** The configuration's page, `https://risa2000.github.io/hmdgdb/hmd_cfgs/<page>.html`. */
  readonly page: string
  readonly horizontal: number
  readonly vertical: number
  /** hmdgdb marks the vertical total of parallel-projection modes as unreliable. */
  readonly verticalReliable: boolean
  readonly diagonal: number
  readonly overlap: number
  /** Share of the rendered view the mask hides, in percent; null when the headset defines no mask. */
  readonly hiddenAreaMask: number | null
}

export const hmdgdbConfigurations: readonly HmdgdbConfiguration[] = [
  { headset: 'bigscreen-beyond-2e', config: 'Native+R90', page: 'Beyond2E_Native_R90', horizontal: 109.22, vertical: 96.91, verticalReliable: true, diagonal: 121.64, overlap: 84.54, hiddenAreaMask: null },
  { headset: 'bigscreen-beyond', config: 'Native+R90', page: 'Beyond_Native_R90', horizontal: 97.53, vertical: 88.55, verticalReliable: true, diagonal: 112.16, overlap: 79.60, hiddenAreaMask: null },
  { headset: 'dpvr-e4', config: 'Native+R120', page: 'E4_Native_R120', horizontal: 96.00, vertical: 96.00, verticalReliable: true, diagonal: 115.03, overlap: 96.00, hiddenAreaMask: null },
  { headset: 'hp-reverb-g2', config: 'Native+R90', page: 'ReverbG2_Native_R90', horizontal: 98.85, vertical: 90.85, verticalReliable: true, diagonal: 107.52, overlap: 84.31, hiddenAreaMask: 16.51 },
  { headset: 'hp-reverb', config: 'Native+R90', page: 'Reverb_Native_R90', horizontal: 95.76, vertical: 90.43, verticalReliable: true, diagonal: 111.78, overlap: 86.99, hiddenAreaMask: 0.04 },
  { headset: 'vive-pro-2', config: 'Native+R90', page: 'VIVEPro2_Native_R90', horizontal: 116.52, vertical: 96.49, verticalReliable: true, diagonal: 113.30, overlap: 79.83, hiddenAreaMask: 10.03 },
  { headset: 'vive-xr-elite', config: 'Native+R90', page: 'ViveElite_Native_R90', horizontal: 97.62, vertical: 103.03, verticalReliable: true, diagonal: 109.31, overlap: 79.57, hiddenAreaMask: 9.14 },
  { headset: 'vive-focus-3', config: 'Native+R90', page: 'ViveFocus3_Native_R90', horizontal: 116.79, vertical: 96.57, verticalReliable: true, diagonal: 126.18, overlap: 79.66, hiddenAreaMask: 0.00 },
  { headset: 'htc-vive-pro', config: 'Native+R90', page: 'VivePro_Native_R90', horizontal: 107.21, vertical: 107.82, verticalReliable: true, diagonal: 110.61, overlap: 90.49, hiddenAreaMask: 20.20 },
  { headset: 'htc-vive', config: 'Native+R90', page: 'Vive_Native_R90', horizontal: 108.77, vertical: 111.53, verticalReliable: true, diagonal: 113.18, overlap: 93.45, hiddenAreaMask: 19.10 },
  { headset: 'lenovo-explorer', config: 'Native+R90', page: 'Explorer_Native_R90', horizontal: 101.73, vertical: 101.20, verticalReliable: true, diagonal: 103.40, overlap: 100.64, hiddenAreaMask: 17.74 },
  { headset: 'meta-quest-3', config: 'Native+R72', page: 'MetaQuest3_Native_R72', horizontal: 108.00, vertical: 98.25, verticalReliable: true, diagonal: 113.30, overlap: 80.00, hiddenAreaMask: 10.66 },
  { headset: 'meta-quest-pro', config: 'Native+R72', page: 'MetaQuestPro_Native_R72', horizontal: 108.00, vertical: 95.57, verticalReliable: true, diagonal: 111.24, overlap: 79.72, hiddenAreaMask: 11.92 },
  { headset: 'oculus-rift-cv1', config: 'Native+R90', page: 'OculusRiftCV1_Native_R90', horizontal: 87.95, vertical: 89.66, verticalReliable: true, diagonal: 98.07, overlap: 71.15, hiddenAreaMask: 10.03 },
  { headset: 'oculus-rift-s', config: 'Native+R80', page: 'OculusRiftS_Native_R80', horizontal: 88.00, vertical: 94.00, verticalReliable: true, diagonal: 101.95, overlap: 92.00, hiddenAreaMask: 9.25 },
  { headset: 'meta-quest-2', config: 'Native+R72', page: 'Quest2_Native_R72', horizontal: 104.00, vertical: 98.00, verticalReliable: true, diagonal: 113.46, overlap: 90.00, hiddenAreaMask: 7.12 },
  { headset: 'oculus-quest', config: 'Native+R72', page: 'Quest_Native_R72', horizontal: 104.00, vertical: 100.00, verticalReliable: true, diagonal: 115.52, overlap: 84.00, hiddenAreaMask: 3.68 },
  { headset: 'pico-neo-2', config: 'Native+R72', page: 'PicoNeo2_Native_R72', horizontal: 101.00, vertical: 101.00, verticalReliable: true, diagonal: 119.52, overlap: 101.00, hiddenAreaMask: null },
  { headset: 'pico-4', config: 'Native+R90', page: 'PICO4_Native_R90', horizontal: 104.00, vertical: 104.00, verticalReliable: true, diagonal: 122.16, overlap: 104.00, hiddenAreaMask: null },
  { headset: 'pico-neo-3', config: 'Native+R72', page: 'PicoNeo3_Native_R72', horizontal: 93.87, vertical: 93.87, verticalReliable: true, diagonal: 113.08, overlap: 93.87, hiddenAreaMask: null },
  { headset: 'pimax-dream-air-lighthouse', config: 'Native+R72', page: 'DreamAirLH_Native_R72', horizontal: 110.15, vertical: 89.09, verticalReliable: true, diagonal: 114.30, overlap: 91.08, hiddenAreaMask: 3.49 },
  { headset: 'pimax-5k-plus', config: 'Large+Native+R90', page: 'Pimax5KPlus_Large_Native_R90', horizontal: 160.29, vertical: 102.70, verticalReliable: true, diagonal: 158.04, overlap: 86.79, hiddenAreaMask: 3.49 },
  { headset: 'pimax-5k-plus', config: 'Large+PP+R90', page: 'Pimax5KPlus_Large_PP_R90', horizontal: 160.29, vertical: 94.71, verticalReliable: false, diagonal: 159.18, overlap: 86.79, hiddenAreaMask: 13.87 },
  { headset: 'pimax-5k-plus', config: 'Normal+Native+R144', page: 'Pimax5KPlus_Normal_Native_R144', horizontal: 139.29, vertical: 102.70, verticalReliable: true, diagonal: 133.95, overlap: 82.41, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Normal+Native+R90', page: 'Pimax5KPlus_Normal_Native_R90', horizontal: 140.29, vertical: 102.70, verticalReliable: true, diagonal: 134.52, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Normal+PP+R144', page: 'Pimax5KPlus_Normal_PP_R144', horizontal: 139.29, vertical: 100.15, verticalReliable: false, diagonal: 136.90, overlap: 82.41, hiddenAreaMask: 19.11 },
  { headset: 'pimax-5k-plus', config: 'Normal+PP+R90', page: 'Pimax5KPlus_Normal_PP_R90', horizontal: 140.29, vertical: 100.63, verticalReliable: false, diagonal: 137.62, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-5k-plus', config: 'Small+Native+R120', page: 'Pimax5KPlus_Small_Native_R120', horizontal: 120.13, vertical: 102.70, verticalReliable: true, diagonal: 119.80, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Small+Native+R144', page: 'Pimax5KPlus_Small_Native_R144', horizontal: 119.29, vertical: 102.70, verticalReliable: true, diagonal: 119.62, overlap: 82.41, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Small+Native+R90', page: 'Pimax5KPlus_Small_Native_R90', horizontal: 120.29, vertical: 102.70, verticalReliable: true, diagonal: 119.90, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Small+PP+R120', page: 'Pimax5KPlus_Small_PP_R120', horizontal: 120.13, vertical: 105.63, verticalReliable: false, diagonal: 123.62, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-5k-plus', config: 'Small+PP+R144', page: 'Pimax5KPlus_Small_PP_R144', horizontal: 119.29, vertical: 104.95, verticalReliable: false, diagonal: 123.32, overlap: 82.41, hiddenAreaMask: 19.11 },
  { headset: 'pimax-5k-plus', config: 'Small+PP+R90', page: 'Pimax5KPlus_Small_PP_R90', horizontal: 120.29, vertical: 105.59, verticalReliable: false, diagonal: 123.71, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-5k-plus', config: 'Tiny+Native+R120', page: 'Pimax5KPlus_Tiny_Native_R120', horizontal: 100.13, vertical: 102.70, verticalReliable: true, diagonal: 108.43, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Tiny+Native+R90', page: 'Pimax5KPlus_Tiny_Native_R90', horizontal: 100.29, vertical: 102.70, verticalReliable: true, diagonal: 108.51, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-5k-plus', config: 'Tiny+PP+R120', page: 'Pimax5KPlus_Tiny_PP_R120', horizontal: 100.13, vertical: 110.08, verticalReliable: false, diagonal: 114.14, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-5k-plus', config: 'Tiny+PP+R90', page: 'Pimax5KPlus_Tiny_PP_R90', horizontal: 100.29, vertical: 110.04, verticalReliable: false, diagonal: 114.20, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-8k', config: 'Large+Native+R80', page: 'Pimax8K_Large_Native_R80', horizontal: 160.29, vertical: 104.27, verticalReliable: true, diagonal: 158.14, overlap: 86.79, hiddenAreaMask: 3.49 },
  { headset: 'pimax-8k', config: 'Large+PP+R80', page: 'Pimax8K_Large_PP_R80', horizontal: 160.29, vertical: 116.14, verticalReliable: false, diagonal: 161.03, overlap: 86.79, hiddenAreaMask: 1.75 },
  { headset: 'pimax-8k', config: 'Normal+Native+R80', page: 'Pimax8K_Normal_Native_R80', horizontal: 140.29, vertical: 104.27, verticalReliable: true, diagonal: 134.88, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-8k', config: 'Normal+PP+R80', page: 'Pimax8K_Normal_PP_R80', horizontal: 140.29, vertical: 117.12, verticalReliable: false, diagonal: 137.91, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-8k', config: 'Small+Native+R80', page: 'Pimax8K_Small_Native_R80', horizontal: 120.29, vertical: 104.27, verticalReliable: true, diagonal: 120.57, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-8k', config: 'Small+PP+R80', page: 'Pimax8K_Small_PP_R80', horizontal: 120.29, vertical: 117.12, verticalReliable: false, diagonal: 124.38, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-artisan', config: 'Small+Native+R90+I60', page: 'PimaxArtisan_Small_Native_R90_I60', horizontal: 131.56, vertical: 102.70, verticalReliable: true, diagonal: 127.67, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-artisan', config: 'Small+Native+R90+I70', page: 'PimaxArtisan_Small_Native_R90_I70', horizontal: 117.49, vertical: 102.70, verticalReliable: true, diagonal: 118.15, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-artisan', config: 'Small+PP+R90+I60', page: 'PimaxArtisan_Small_PP_R90_I60', horizontal: 131.56, vertical: 102.87, verticalReliable: false, diagonal: 130.91, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-artisan', config: 'Small+PP+R90+I70', page: 'PimaxArtisan_Small_PP_R90_I70', horizontal: 117.49, vertical: 106.23, verticalReliable: false, diagonal: 122.15, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-artisan', config: 'Tiny+Native+R90+I60', page: 'PimaxArtisan_Tiny_Native_R90_I60', horizontal: 111.56, vertical: 102.70, verticalReliable: true, diagonal: 114.64, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-artisan', config: 'Tiny+Native+R90+I70', page: 'PimaxArtisan_Tiny_Native_R90_I70', horizontal: 97.49, vertical: 102.70, verticalReliable: true, diagonal: 107.11, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-artisan', config: 'Tiny+PP+R90+I60', page: 'PimaxArtisan_Tiny_PP_R90_I60', horizontal: 111.56, vertical: 107.60, verticalReliable: false, diagonal: 119.12, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-artisan', config: 'Tiny+PP+R90+I70', page: 'PimaxArtisan_Tiny_PP_R90_I70', horizontal: 97.49, vertical: 110.63, verticalReliable: false, diagonal: 113.13, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-crystal', config: 'Native+R120', page: 'PimaxCrystal_Native_R120', horizontal: 103.31, vertical: 103.75, verticalReliable: true, diagonal: 115.99, overlap: 83.31, hiddenAreaMask: 3.49 },
  { headset: 'pimax-vision-8k-plus', config: 'Large+Native+R110', page: 'PimaxVision8KPlus_Large_Native_R110', horizontal: 159.21, vertical: 102.70, verticalReliable: true, diagonal: 152.17, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Large+Native+R90', page: 'PimaxVision8KPlus_Large_Native_R90', horizontal: 160.29, vertical: 102.70, verticalReliable: true, diagonal: 158.04, overlap: 86.79, hiddenAreaMask: 3.49 },
  { headset: 'pimax-vision-8k-plus', config: 'Large+PP+R110', page: 'PimaxVision8KPlus_Large_PP_R110', horizontal: 159.21, vertical: 95.07, verticalReliable: false, diagonal: 155.82, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-plus', config: 'Large+PP+R90', page: 'PimaxVision8KPlus_Large_PP_R90', horizontal: 160.29, vertical: 94.71, verticalReliable: false, diagonal: 159.18, overlap: 86.79, hiddenAreaMask: 13.87 },
  { headset: 'pimax-vision-8k-plus', config: 'Normal+Native+R110', page: 'PimaxVision8KPlus_Normal_Native_R110', horizontal: 139.21, vertical: 102.70, verticalReliable: true, diagonal: 133.63, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Normal+Native+R90', page: 'PimaxVision8KPlus_Normal_Native_R90', horizontal: 140.29, vertical: 102.70, verticalReliable: true, diagonal: 134.52, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Normal+PP+R110', page: 'PimaxVision8KPlus_Normal_PP_R110', horizontal: 139.21, vertical: 100.91, verticalReliable: false, diagonal: 136.73, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-plus', config: 'Normal+PP+R90', page: 'PimaxVision8KPlus_Normal_PP_R90', horizontal: 140.29, vertical: 100.63, verticalReliable: false, diagonal: 137.62, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-plus', config: 'Small+Native+R110', page: 'PimaxVision8KPlus_Small_Native_R110', horizontal: 119.21, vertical: 102.70, verticalReliable: true, diagonal: 119.22, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Small+Native+R90', page: 'PimaxVision8KPlus_Small_Native_R90', horizontal: 120.29, vertical: 102.70, verticalReliable: true, diagonal: 119.90, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Small+PP+R110', page: 'PimaxVision8KPlus_Small_PP_R110', horizontal: 119.21, vertical: 105.84, verticalReliable: false, diagonal: 123.10, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-plus', config: 'Small+PP+R90', page: 'PimaxVision8KPlus_Small_PP_R90', horizontal: 120.29, vertical: 105.59, verticalReliable: false, diagonal: 123.71, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-plus', config: 'Tiny+Native+R110', page: 'PimaxVision8KPlus_Tiny_Native_R110', horizontal: 99.21, vertical: 102.70, verticalReliable: true, diagonal: 107.97, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Tiny+Native+R90', page: 'PimaxVision8KPlus_Tiny_Native_R90', horizontal: 100.29, vertical: 102.70, verticalReliable: true, diagonal: 108.51, overlap: 86.79, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-plus', config: 'Tiny+PP+R110', page: 'PimaxVision8KPlus_Tiny_PP_R110', horizontal: 99.21, vertical: 110.27, verticalReliable: false, diagonal: 113.78, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-plus', config: 'Tiny+PP+R90', page: 'PimaxVision8KPlus_Tiny_PP_R90', horizontal: 100.29, vertical: 110.04, verticalReliable: false, diagonal: 114.20, overlap: 86.79, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-x', config: 'Large+Native+R75', page: 'PimaxVision8KX_Large_Native_R75', horizontal: 160.29, vertical: 102.70, verticalReliable: true, diagonal: 153.42, overlap: 82.89, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-x', config: 'Large+PP+R75', page: 'PimaxVision8KX_Large_PP_R75', horizontal: 160.29, vertical: 94.30, verticalReliable: false, diagonal: 157.02, overlap: 82.95, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-x', config: 'Normal+Native+R75', page: 'PimaxVision8KX_Normal_Native_R75', horizontal: 140.29, vertical: 102.70, verticalReliable: true, diagonal: 134.74, overlap: 82.95, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-x', config: 'Normal+PP+R75', page: 'PimaxVision8KX_Normal_PP_R75', horizontal: 140.29, vertical: 99.98, verticalReliable: false, diagonal: 137.70, overlap: 82.95, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-x', config: 'Small+Native+R75', page: 'PimaxVision8KX_Small_Native_R75', horizontal: 120.29, vertical: 102.70, verticalReliable: true, diagonal: 120.20, overlap: 82.95, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-x', config: 'Small+PP+R75', page: 'PimaxVision8KX_Small_PP_R75', horizontal: 120.29, vertical: 104.83, verticalReliable: false, diagonal: 123.86, overlap: 82.95, hiddenAreaMask: 19.11 },
  { headset: 'pimax-vision-8k-x', config: 'Tiny+Native+R75', page: 'PimaxVision8KX_Tiny_Native_R75', horizontal: 100.29, vertical: 102.70, verticalReliable: true, diagonal: 108.96, overlap: 82.95, hiddenAreaMask: 8.73 },
  { headset: 'pimax-vision-8k-x', config: 'Tiny+PP+R75', page: 'PimaxVision8KX_Tiny_PP_R75', horizontal: 100.29, vertical: 109.25, verticalReliable: false, diagonal: 114.41, overlap: 82.95, hiddenAreaMask: 19.11 },
  { headset: 'samsung-galaxy-xr', config: 'Native+R72', page: 'GalaxyXR_Native_R72', horizontal: 108.98, vertical: 105.14, verticalReliable: true, diagonal: 124.88, overlap: 79.75, hiddenAreaMask: null },
  { headset: 'samsung-odyssey-plus', config: 'Native+R90', page: 'Odyssey+_Native_R90', horizontal: 106.12, vertical: 109.72, verticalReliable: true, diagonal: 113.13, overlap: 86.74, hiddenAreaMask: 13.18 },
  { headset: 'playstation-vr2', config: 'Native+R90', page: 'PSVR2_Native_R90', horizontal: 123.00, vertical: 106.08, verticalReliable: true, diagonal: 127.58, overlap: 86.89, hiddenAreaMask: 2.34 },
  { headset: 'starvr-one', config: 'Compatible+Native+R90', page: 'StarVROne_Compatible_Native_R90', horizontal: 107.22, vertical: 107.22, verticalReliable: true, diagonal: 107.22, overlap: 107.22, hiddenAreaMask: 29.57 },
  { headset: 'starvr-one', config: 'Normal+Native+R90', page: 'StarVROne_Normal_Native_R90', horizontal: 177.55, vertical: 117.45, verticalReliable: true, diagonal: 176.68, overlap: 80.65, hiddenAreaMask: 28.19 },
  { headset: 'valve-index', config: 'Native+R144', page: 'Index_Native_R144', horizontal: 108.06, vertical: 109.16, verticalReliable: true, diagonal: 114.43, overlap: 85.93, hiddenAreaMask: 24.88 },
  { headset: 'valve-index', config: 'PP+R144', page: 'Index_PP_R144', horizontal: 109.26, vertical: 108.47, verticalReliable: false, diagonal: 114.19, overlap: 84.13, hiddenAreaMask: 24.88 },
  { headset: 'valve-steam-frame', config: 'PC+Native+R120', page: 'SteamFramePC_Native_R120', horizontal: 117.97, vertical: 109.45, verticalReliable: true, diagonal: 130.09, overlap: 101.00, hiddenAreaMask: null },
  { headset: 'valve-steam-frame', config: 'Standalone+Native+R120', page: 'SteamFrameStandalone_Native_R120', horizontal: 117.35, vertical: 109.45, verticalReliable: true, diagonal: 124.85, overlap: 92.45, hiddenAreaMask: 15.64 },
  { headset: 'varjo-aero', config: 'Native+R90', page: 'VarjoAero_Native_R90', horizontal: 110.76, vertical: 85.61, verticalReliable: true, diagonal: 121.17, overlap: 70.02, hiddenAreaMask: 5.83 },
  { headset: 'varjo-vr-2', config: 'Native+R60', page: 'VarjoVR-2_Native_R60', horizontal: 89.30, vertical: 89.30, verticalReliable: true, diagonal: 92.42, overlap: 71.64, hiddenAreaMask: 17.84 },
  { headset: 'varjo-xr-1-developer-edition', config: 'Native+R60', page: 'VarjoXR-1_Native_R60', horizontal: 89.12, vertical: 89.32, verticalReliable: true, diagonal: 92.28, overlap: 72.27, hiddenAreaMask: 17.84 },
  { headset: 'varjo-xr-4', config: 'Native+R90', page: 'VarjoXR-4_Native_R90', horizontal: 114.28, vertical: 103.29, verticalReliable: true, diagonal: 126.83, overlap: 90.38, hiddenAreaMask: null },
]
