/** Byte-level helpers: Rust counts PTY output in UTF-8 bytes, JS strings are UTF-16. */

const encoder = new TextEncoder()

/** UTF-8 byte length of a string, without allocating for pure ASCII. */
export function utf8Length(s: string): number {
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      // A surrogate pair is one 4-byte code point.
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

/** Base64 of the string's UTF-8 bytes — the `replayB64` / `b64` wire format. */
export function utf8ToBase64(s: string): string {
  const bytes = encoder.encode(s)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** A short random hex id (`crypto` when available). */
export function hexId(bytes = 6): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** RFC 4122 v4 UUID. */
export function uuid(): string {
  return crypto.randomUUID()
}

/** Deterministic PRNG (mulberry32) so scripted behaviour looks the same every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
