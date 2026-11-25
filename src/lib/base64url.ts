/** Base64url without padding, as links carry it: VR Headset Picker's results and kept measures. */

const base64UrlPattern = /^[A-Za-z0-9_-]+$/

export const isBase64Url = (text: string): boolean => base64UrlPattern.test(text)

export function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** The bytes, or null for text outside the alphabet or of a length no encoding has. */
export function base64UrlToBytes(encoded: string): Uint8Array | null {
  if (!isBase64Url(encoded) || encoded.length % 4 === 1) return null
  const standard = encoded.replaceAll('-', '+').replaceAll('_', '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  // The alphabet and length checks above guarantee atob accepts the padded string.
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
